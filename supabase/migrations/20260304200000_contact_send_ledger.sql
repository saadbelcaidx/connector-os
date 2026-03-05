-- =============================================================================
-- contact_send_ledger — Pre-send safety gate + audit trail
-- Every send attempt gets a row. DB is the guardrail, app code is UX.
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_send_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Who (global email dedup — side doesn't matter)
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  email_domain TEXT NOT NULL,
  root_domain TEXT NOT NULL,
  operator_id TEXT NOT NULL,

  -- Context
  client_id TEXT,
  client_name TEXT,
  job_id TEXT,
  eval_id TEXT,

  -- Idempotency
  send_id TEXT NOT NULL UNIQUE,
  message_hash TEXT,

  -- Lifecycle: reserved → sent | failed | bounced
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'sent', 'failed', 'blocked', 'bounced')),
  block_reason TEXT,
  introduction_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ
);

-- Indexes for the queries that matter
CREATE INDEX IF NOT EXISTS idx_ledger_normalized_email_time
  ON contact_send_ledger(normalized_email, created_at DESC)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_ledger_root_domain_time
  ON contact_send_ledger(root_domain, operator_id, created_at DESC)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_ledger_operator_daily
  ON contact_send_ledger(operator_id, created_at)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_ledger_send_id
  ON contact_send_ledger(send_id);

CREATE INDEX IF NOT EXISTS idx_ledger_bounce
  ON contact_send_ledger(normalized_email)
  WHERE status = 'bounced';

CREATE INDEX IF NOT EXISTS idx_ledger_stale_reserved
  ON contact_send_ledger(status, created_at)
  WHERE status = 'reserved';

-- =============================================================================
-- RPC: try_reserve_send — atomic pre-send gate (7 rules)
-- =============================================================================

CREATE OR REPLACE FUNCTION try_reserve_send(
  p_email TEXT,
  p_normalized_email TEXT,
  p_email_domain TEXT,
  p_root_domain TEXT,
  p_client_id TEXT,
  p_client_name TEXT,
  p_operator_id TEXT,
  p_job_id TEXT,
  p_eval_id TEXT,
  p_send_id TEXT,
  p_message_hash TEXT
) RETURNS TABLE(allowed BOOLEAN, reason TEXT, detail TEXT) AS $$
DECLARE
  v_last_same_client RECORD;
  v_last_any RECORD;
  v_active RECORD;
  v_declined RECORD;
  v_daily_count INTEGER;
  v_domain_recent RECORD;
BEGIN
  -- Advisory lock: serialize per root_domain + operator to prevent domain throttle race
  PERFORM pg_advisory_xact_lock(hashtext(p_root_domain || ':' || p_operator_id));

  -- Cleanup: expire stale reservations > 10 minutes
  UPDATE contact_send_ledger
  SET status = 'failed', failed_at = NOW()
  WHERE status = 'reserved'
    AND created_at < NOW() - INTERVAL '10 minutes';

  -- RULE 0: Idempotency
  PERFORM 1 FROM contact_send_ledger WHERE send_id = p_send_id AND status = 'sent';
  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'idempotent_replay'::TEXT, 'Already sent with this send_id'::TEXT;
    RETURN;
  END IF;
  DELETE FROM contact_send_ledger WHERE send_id = p_send_id AND status IN ('failed', 'blocked');

  -- RULE 0.5: Bounce suppression — permanent
  PERFORM 1 FROM contact_send_ledger
    WHERE normalized_email = p_normalized_email AND status = 'bounced';
  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'bounce_suppressed');
    RETURN QUERY SELECT FALSE, 'bounce_suppressed'::TEXT, 'Hard bounce recorded — permanently suppressed'::TEXT;
    RETURN;
  END IF;

  -- RULE 1: Active conversation — don't interrupt
  SELECT i.status, i.overlay_client_name, i.created_at
    INTO v_active
    FROM introductions i
   WHERE (i.demand_contact_email = p_normalized_email OR i.supply_contact_email = p_normalized_email)
     AND i.status IN ('replied', 'meeting')
   ORDER BY i.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'active_conversation');
    RETURN QUERY SELECT FALSE, 'active_conversation'::TEXT,
      format('Status: %s via %s (%s)', v_active.status, COALESCE(v_active.overlay_client_name, 'market'), v_active.created_at::date)::TEXT;
    RETURN;
  END IF;

  -- RULE 2: Declined / closed_lost — 180-day cooldown
  SELECT i.status, i.overlay_client_name, i.created_at
    INTO v_declined
    FROM introductions i
   WHERE (i.demand_contact_email = p_normalized_email OR i.supply_contact_email = p_normalized_email)
     AND i.status IN ('closed_lost', 'stale')
     AND i.created_at > NOW() - INTERVAL '180 days'
   ORDER BY i.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'declined_cooldown');
    RETURN QUERY SELECT FALSE, 'declined_cooldown'::TEXT,
      format('Previously %s via %s (%s) — 180-day cooldown', v_declined.status, COALESCE(v_declined.overlay_client_name, 'market'), v_declined.created_at::date)::TEXT;
    RETURN;
  END IF;

  -- RULE 3: Same-client cooldown — 30 days
  IF p_client_id IS NOT NULL THEN
    SELECT l.created_at, l.client_name
      INTO v_last_same_client
      FROM contact_send_ledger l
     WHERE l.normalized_email = p_normalized_email
       AND l.client_id = p_client_id
       AND l.status = 'sent'
       AND l.created_at > NOW() - INTERVAL '30 days'
     ORDER BY l.created_at DESC
     LIMIT 1;

    IF FOUND THEN
      INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
      VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'cooldown_same_client');
      RETURN QUERY SELECT FALSE, 'cooldown_same_client'::TEXT,
        format('Contacted %s days ago for %s', EXTRACT(day FROM NOW() - v_last_same_client.created_at)::int, COALESCE(v_last_same_client.client_name, 'same client'))::TEXT;
      RETURN;
    END IF;
  END IF;

  -- RULE 4: Cross-client / cross-run cooldown — 90 days
  SELECT l.created_at, l.client_name, l.client_id
    INTO v_last_any
    FROM contact_send_ledger l
   WHERE l.normalized_email = p_normalized_email
     AND l.status = 'sent'
     AND l.created_at > NOW() - INTERVAL '90 days'
   ORDER BY l.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'cooldown_cross_client');
    RETURN QUERY SELECT FALSE, 'cooldown_cross_client'::TEXT,
      format('Contacted %s days ago by %s', EXTRACT(day FROM NOW() - v_last_any.created_at)::int, COALESCE(v_last_any.client_name, 'market run'))::TEXT;
    RETURN;
  END IF;

  -- RULE 5: Domain throttle — max 1 per root domain per 24h (advisory lock prevents race)
  SELECT l.email, l.created_at
    INTO v_domain_recent
    FROM contact_send_ledger l
   WHERE l.root_domain = p_root_domain
     AND l.operator_id = p_operator_id
     AND l.status IN ('sent', 'reserved')
     AND l.created_at > NOW() - INTERVAL '24 hours'
   ORDER BY l.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'domain_throttle');
    RETURN QUERY SELECT FALSE, 'domain_throttle'::TEXT,
      format('Already sent to %s at @%s today', v_domain_recent.email, p_root_domain)::TEXT;
    RETURN;
  END IF;

  -- RULE 6: Daily send cap — 200 per operator
  SELECT COUNT(*) INTO v_daily_count
    FROM contact_send_ledger
   WHERE operator_id = p_operator_id
     AND status = 'sent'
     AND created_at > NOW() - INTERVAL '1 day';

  IF v_daily_count >= 200 THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'daily_cap');
    RETURN QUERY SELECT FALSE, 'daily_cap'::TEXT,
      format('%s sends today (cap: 200)', v_daily_count)::TEXT;
    RETURN;
  END IF;

  -- ALL CLEAR — reserve
  INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
  VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'reserved', NULL);

  RETURN QUERY SELECT TRUE, 'allowed'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RPC: confirm_send — Instantly API succeeded
-- =============================================================================

CREATE OR REPLACE FUNCTION confirm_send(p_send_id TEXT, p_introduction_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE contact_send_ledger
  SET status = 'sent', sent_at = NOW(), introduction_id = p_introduction_id
  WHERE send_id = p_send_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RPC: fail_send — Instantly API failed (cooldown NOT burned)
-- =============================================================================

CREATE OR REPLACE FUNCTION fail_send(p_send_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE contact_send_ledger
  SET status = 'failed', failed_at = NOW()
  WHERE send_id = p_send_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RPC: record_bounce — permanent suppression (future: Instantly webhook)
-- =============================================================================

CREATE OR REPLACE FUNCTION record_bounce(p_normalized_email TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE contact_send_ledger
  SET status = 'bounced', bounced_at = NOW()
  WHERE normalized_email = p_normalized_email
    AND status = 'sent'
    AND sent_at = (
      SELECT MAX(sent_at) FROM contact_send_ledger
      WHERE normalized_email = p_normalized_email AND status = 'sent'
    );
END;
$$ LANGUAGE plpgsql;
