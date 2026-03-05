# Send Safety Layer — Pre-Send Gate + Audit Ledger

> The DB is the guardrail. App code is the UX. If the app has a bug, the DB still says no.

---

## Why This Exists

Fourteen failure modes identified across two audit rounds. All real, not theoretical.

### Round 1 (structural gaps)

| # | Failure | Consequence |
|---|---------|-------------|
| 1 | Same founder emailed in Run A + Run B | Looks like spam. Reputation damage. |
| 2 | No contact memory | Operators re-activate people who already replied or declined. |
| 3 | Two clients targeting same founder | Same person gets 2 eerily similar emails from the same operator. Credibility gone. |
| 4 | No send ceiling | Someone routes 200 emails at once. No "are you sure?" moment. |
| 5 | Network retry → double send | Classic: send → timeout → retry → person gets email twice. |
| 6 | 3 people at same company emailed simultaneously | Spam filters hate multiple emails to same domain in one burst. |
| 7 | Operator re-pitches someone who explicitly said no | `closed_lost` / declined should trigger long cooldown. |

### Round 2 (concurrency + normalization)

| # | Failure | Consequence |
|---|---------|-------------|
| 8 | Domain throttle race condition | Two concurrent calls both pass domain check (neither row exists yet) → 2 emails to same domain. |
| 9 | Reserved rows leak forever | Worker crashes between reserve and Instantly call → row stays `reserved` permanently. Messy audit trail. |
| 10 | Idempotent DELETE too aggressive | `DELETE WHERE status != 'sent'` can nuke another worker's live `reserved` row during concurrent retry. |
| 11 | Email normalization missing | `JOHN@startup.com` and `john+podcast@startup.com` bypass cooldown — same inbox, different strings. |
| 12 | Domain parsing misses subdomains | `sarah@mail.startup.com` treated as different domain from `john@startup.com`. Deliverability checks root domain. |
| 13 | No bounce suppression | Instantly returns hard bounce → system keeps retrying across runs. Deliverability death spiral. |
| 14 | Cooldown queries degrade at scale | `ORDER BY created_at DESC LIMIT 1` per send is fine at 10K rows, hot at 10M. |

Current state: within-run dedup exists (ComposePanel). Everything else is missing. The `introductions` table records sends but nobody reads it before sending.

---

## Architecture: DB-First, Not App-First

App-level checks race. Two browser tabs, two workers, two runs — all can pass the check simultaneously, then all insert. The DB must be the final word.

```
ComposePanel.handleSend()
    │
    ├── For each email:
    │     normalize email (lowercase, strip plus aliases, trim)
    │     extract root_domain (startup.com from mail.startup.com)
    │     generate send_id (deterministic from jobId + evalId + normalizedEmail + composeSessionId)
    │     ↓
    │     RPC: try_reserve_send(normalized_email, root_domain, client_id, operator_id, send_id, ...)
    │     ↓
    │     DB acquires advisory lock on root_domain → checks all rules → returns allowed/blocked
    │     ↓
    │     allowed → call Instantly API
    │               → success: confirm_send() → ledger row 'sent'
    │               → fail:   fail_send() → ledger row 'failed' (cooldown NOT burned)
    │     blocked → add to skip list with reason for UI
    │
    └── Show results: N sent, N skipped (with reasons), N errors
```

---

## Email Normalization (Bug #11)

Same inbox, different strings:
- `john@startup.com` = `JOHN@startup.com` = `John@Startup.com`
- `john+podcast@gmail.com` = `john@gmail.com` (Gmail ignores plus aliases)
- ` john@startup.com ` = `john@startup.com` (leading/trailing spaces)

**All lookups and inserts use `normalized_email`, never raw email.**

```typescript
function normalizeEmail(raw: string): string {
  let email = raw.trim().toLowerCase();

  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  // Gmail/Google: strip plus alias and dots in local part
  const gmailDomains = ['gmail.com', 'googlemail.com'];
  if (gmailDomains.includes(domain)) {
    const stripped = local.split('+')[0].replace(/\./g, '');
    return `${stripped}@${domain}`;
  }

  // All others: strip plus alias only (dots can be significant)
  const stripped = local.split('+')[0];
  return `${stripped}@${domain}`;
}
```

The ledger stores BOTH `email` (original, for audit readability) and `normalized_email` (for lookups). All WHERE clauses use `normalized_email`.

---

## Root Domain Extraction (Bug #12)

Deliverability systems look at the root domain, not subdomains:
- `john@mail.startup.com` → root: `startup.com`
- `sarah@hr.acme.co.uk` → root: `acme.co.uk`

```typescript
function extractRootDomain(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() || '';

  // Known two-part TLDs
  const twoPartTLDs = ['co.uk', 'co.nz', 'co.za', 'com.au', 'com.br', 'co.jp', 'co.in'];
  for (const tld of twoPartTLDs) {
    if (domain.endsWith(`.${tld}`)) {
      // e.g. "hr.acme.co.uk" → split by dot → take last 3 parts → "acme.co.uk"
      const parts = domain.split('.');
      return parts.slice(-3).join('.');
    }
  }

  // Standard: take last 2 parts
  const parts = domain.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
}
```

The ledger stores both `email_domain` (full domain after @) and `root_domain` (for throttle checks). Domain throttle checks `root_domain`.

---

## New Table: `contact_send_ledger`

Every send attempt — successful, blocked, or failed — gets a row. This is the audit trail and the enforcement mechanism in one table.

```sql
CREATE TABLE contact_send_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Who (global email dedup — side doesn't matter)
  email TEXT NOT NULL,                   -- original email (audit readability)
  normalized_email TEXT NOT NULL,        -- lowercase, plus-stripped, trimmed (all lookups use this)
  email_domain TEXT NOT NULL,            -- full domain after @
  root_domain TEXT NOT NULL,             -- root domain for throttle (startup.com from mail.startup.com)
  operator_id TEXT NOT NULL,

  -- Context
  client_id TEXT,                        -- null = market mode (no client)
  client_name TEXT,                      -- denormalized for audit readability
  job_id TEXT,                           -- which run triggered this
  eval_id TEXT,                          -- which match

  -- Idempotency
  send_id TEXT NOT NULL UNIQUE,          -- deterministic: hash(jobId + evalId + normalizedEmail + composeSessionId)
  message_hash TEXT,                     -- hash of intro text body

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'sent', 'failed', 'blocked', 'bounced')),
  block_reason TEXT,                     -- cooldown_same_client, cooldown_cross_client,
                                         -- active_conversation, declined_cooldown,
                                         -- daily_cap, domain_throttle, bounce_suppressed,
                                         -- manual_suppress
  introduction_id UUID,                  -- links to introductions table on success

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,                   -- set when status transitions to 'sent'
  failed_at TIMESTAMPTZ,                 -- set when status transitions to 'failed'
  bounced_at TIMESTAMPTZ                 -- set when Instantly reports hard bounce
);

-- The queries that matter (all use normalized_email, not email)
CREATE INDEX idx_ledger_normalized_email_time ON contact_send_ledger(normalized_email, created_at DESC)
  WHERE status = 'sent';
CREATE INDEX idx_ledger_root_domain_time ON contact_send_ledger(root_domain, operator_id, created_at DESC)
  WHERE status = 'sent';
CREATE INDEX idx_ledger_operator_daily ON contact_send_ledger(operator_id, created_at)
  WHERE status = 'sent';
CREATE INDEX idx_ledger_send_id ON contact_send_ledger(send_id);
CREATE INDEX idx_ledger_bounce ON contact_send_ledger(normalized_email)
  WHERE status = 'bounced';
CREATE INDEX idx_ledger_stale_reserved ON contact_send_ledger(status, created_at)
  WHERE status = 'reserved';
```

### Key design decisions:

**Global email dedup (no side filter).** Same person could be demand in run A, supply in run B. Cooldown checks `WHERE normalized_email = p_normalized_email`, not `AND side = p_side`. Humans don't care which side they were.

**Three-state lifecycle: `reserved` → `sent` | `failed` | `bounced`.** Only `status = 'sent'` rows count for cooldown windows. Reserved/failed don't burn cooldowns. `bounced` = permanent suppression.

**`normalized_email` for all lookups.** Raw `email` stored for audit display. All WHERE clauses, all cooldown checks, all dedup uses `normalized_email`.

**`root_domain` for throttle.** `mail.startup.com` and `startup.com` are the same root domain. Domain throttle checks `root_domain`, not `email_domain`.

**`blocked` rows also inserted.** Every decision is auditable. `"Why wasn't this email sent?"` → query the ledger.

---

## RPC: `try_reserve_send`

One atomic function. Advisory lock on domain prevents race. Checks all rules. Returns allowed/blocked + reason.

```sql
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
  v_bounced RECORD;
  v_daily_count INTEGER;
  v_domain_recent RECORD;
BEGIN
  -- ═══════════════════════════════════════════════════════════
  -- ADVISORY LOCK: serialize per root_domain to prevent race (Bug #8)
  -- Cheap, transaction-scoped, auto-released on commit/rollback
  -- ═══════════════════════════════════════════════════════════
  PERFORM pg_advisory_xact_lock(hashtext(p_root_domain || ':' || p_operator_id));

  -- ═══════════════════════════════════════════════════════════
  -- CLEANUP: expire stale reservations > 10 minutes (Bug #9)
  -- Worker crashed between reserve and Instantly call
  -- ═══════════════════════════════════════════════════════════
  UPDATE contact_send_ledger
  SET status = 'failed', failed_at = NOW()
  WHERE status = 'reserved'
    AND created_at < NOW() - INTERVAL '10 minutes';

  -- ═══════════════════════════════════════════════════════════
  -- RULE 0: Idempotency — same send_id = already processed
  -- ═══════════════════════════════════════════════════════════
  PERFORM 1 FROM contact_send_ledger WHERE send_id = p_send_id AND status = 'sent';
  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'idempotent_replay'::TEXT, 'Already sent with this send_id'::TEXT;
    RETURN;
  END IF;
  -- Clean up only failed/blocked rows for this send_id (Bug #10: never delete reserved)
  DELETE FROM contact_send_ledger WHERE send_id = p_send_id AND status IN ('failed', 'blocked');

  -- ═══════════════════════════════════════════════════════════
  -- RULE 0.5: Bounce suppression — permanent (Bug #13)
  -- ═══════════════════════════════════════════════════════════
  PERFORM 1 FROM contact_send_ledger
    WHERE normalized_email = p_normalized_email
      AND status = 'bounced';
  IF FOUND THEN
    INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
    VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'blocked', 'bounce_suppressed');
    RETURN QUERY SELECT FALSE, 'bounce_suppressed'::TEXT, 'Hard bounce recorded — permanently suppressed'::TEXT;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- RULE 1: Active conversation — don't interrupt
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- RULE 2: Declined / closed_lost — 180-day cooldown
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- RULE 3: Same-client cooldown — 30 days
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- RULE 4: Cross-client / cross-run cooldown — 90 days
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- RULE 5: Domain throttle — max 1 email per root domain per 24h
  -- Advisory lock above serializes this check — no race condition (Bug #8)
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- RULE 6: Daily send cap — 200 per operator per day
  -- ═══════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════
  -- ALL CLEAR — reserve the send (not yet 'sent')
  -- ═══════════════════════════════════════════════════════════
  INSERT INTO contact_send_ledger(email, normalized_email, email_domain, root_domain, operator_id, client_id, client_name, job_id, eval_id, send_id, message_hash, status, block_reason)
  VALUES (p_email, p_normalized_email, p_email_domain, p_root_domain, p_operator_id, p_client_id, p_client_name, p_job_id, p_eval_id, p_send_id, p_message_hash, 'reserved', NULL);

  RETURN QUERY SELECT TRUE, 'allowed'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;
```

### Key changes from v2:

1. **Advisory lock** (Bug #8): `pg_advisory_xact_lock(hashtext(root_domain || ':' || operator_id))` at the top. Transaction-scoped, auto-released. Serializes all sends to the same root domain for the same operator. Two concurrent calls cannot both pass the domain throttle check.

2. **Stale reservation cleanup** (Bug #9): At the top of every call, expire reservations > 10 minutes old to `failed`. Worker crashed? Row gets cleaned up on next invocation. No orphans.

3. **Safe DELETE scope** (Bug #10): `DELETE WHERE status IN ('failed', 'blocked')` — never deletes `reserved` rows. Another worker's live reservation stays intact during concurrent retries.

4. **All lookups use `normalized_email`** (Bug #11): Cooldown checks, active conversation checks, bounce checks — all against normalized form.

5. **Domain throttle uses `root_domain`** (Bug #12): `mail.startup.com` and `startup.com` are the same root. And domain throttle also checks `reserved` rows (not just `sent`) because the advisory lock ensures the reservation exists before the next call checks.

6. **Bounce suppression** (Bug #13): New Rule 0.5 — any `bounced` row for this normalized email = permanent block.

### Post-send status update:

```sql
-- Called after Instantly API succeeds:
CREATE OR REPLACE FUNCTION confirm_send(p_send_id TEXT, p_introduction_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE contact_send_ledger
  SET status = 'sent', sent_at = NOW(), introduction_id = p_introduction_id
  WHERE send_id = p_send_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql;

-- Called after Instantly API fails:
CREATE OR REPLACE FUNCTION fail_send(p_send_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE contact_send_ledger
  SET status = 'failed', failed_at = NOW()
  WHERE send_id = p_send_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql;

-- Called when Instantly reports a hard bounce (webhook, future):
CREATE OR REPLACE FUNCTION record_bounce(p_normalized_email TEXT)
RETURNS VOID AS $$
BEGIN
  -- Mark the most recent sent row as bounced
  UPDATE contact_send_ledger
  SET status = 'bounced', bounced_at = NOW()
  WHERE normalized_email = p_normalized_email
    AND status = 'sent'
  ORDER BY sent_at DESC
  LIMIT 1;
  -- Future sends to this normalized_email will be blocked by Rule 0.5
END;
$$ LANGUAGE plpgsql;
```

**Key behavior:** Only `status = 'sent'` rows count for cooldown checks. `reserved` rows that never transition (worker crash) get expired to `failed` within 10 minutes by the next invocation. `bounced` rows trigger permanent suppression.

---

## Cooldown Policy

| Scenario | Window | Rationale |
|----------|--------|-----------|
| Same email, same client | 30 days | Client re-activation cycle. Don't spam their prospects. |
| Same email, different client | 90 days | Operator credibility. Two similar emails = pattern recognition = block. |
| Same email, declined/closed_lost | 180 days | They explicitly said no. Respect it. |
| Active conversation (replied/meeting) | Permanent until status changes | Never interrupt a live deal. |
| Same root domain, same operator | 24 hours | Deliverability. Spam filters flag multi-send to same domain. |
| Daily operator cap | 200/day | Account warm-up protection. |
| Hard bounce | Permanent | Dead email. Sending again = deliverability suicide. |

All cooldown checks use `status = 'sent'` only. Reserved/failed/blocked rows don't count.
Domain throttle also checks `reserved` (serialized by advisory lock).

---

## Idempotent Send ID

The `send_id` uses `normalizedEmail` (not raw) and includes `composeSessionId`:

```typescript
function buildSendId(
  jobId: string,
  evalId: string,
  normalizedEmail: string,
  composeSessionId: string,
): string {
  const input = `${jobId}:${evalId}:${normalizedEmail}:${composeSessionId}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return `send_${(hash >>> 0).toString(36)}`;
}
```

**Why `normalizedEmail`:** `JOHN@startup.com` and `john@startup.com` must produce the same send_id. Normalization happens before hashing.

**Why `composeSessionId`:** Re-runs/backfills with same evalId would collide without it. Each compose session gets fresh IDs. Within a session, retries produce the same ID (idempotent).

---

## Client-Side Integration

### ComposePanel — New State

```typescript
// Generated once per mount — makes send_ids unique per compose session
const [composeSessionId] = useState(() => crypto.randomUUID());
```

### handleSend() — Normalize → Reserve → Send → Confirm/Fail

```typescript
for (const match of sendablePairs) {
  const rawEmail = enrichResults.get(match.evalId)?.demand?.email;
  if (!rawEmail) continue;

  const normalized = normalizeEmail(rawEmail);
  const rootDomain = extractRootDomain(normalized);
  const emailDomain = normalized.split('@')[1] || '';
  const sendId = buildSendId(jobId!, match.evalId, normalized, composeSessionId);
  const messageHash = hashText(draft.demandIntro);

  // Step 1: Reserve
  const { data } = await supabase.rpc('try_reserve_send', {
    p_email: rawEmail,
    p_normalized_email: normalized,
    p_email_domain: emailDomain,
    p_root_domain: rootDomain,
    p_client_id: fulfillmentClient?.id || null,
    p_client_name: fulfillmentClient?.name || null,
    p_operator_id: operatorId,
    p_job_id: jobId,
    p_eval_id: match.evalId,
    p_send_id: sendId,
    p_message_hash: messageHash,
  });

  if (!data?.[0]?.allowed) {
    skipped.push({ email: rawEmail, reason: data[0].reason, detail: data[0].detail });
    continue;
  }

  // Step 2: Send via Instantly
  try {
    const result = await limiter.sendLead(config, params);
    if (result.success) {
      // Step 3a: Confirm
      await supabase.rpc('confirm_send', { p_send_id: sendId, p_introduction_id: introId });
      sent++;
    } else {
      // Step 3b: Fail — cooldown NOT burned
      await supabase.rpc('fail_send', { p_send_id: sendId });
      errors++;
    }
  } catch {
    await supabase.rpc('fail_send', { p_send_id: sendId });
    errors++;
  }
}
```

### Send Results UX

```
Routing 80 contacts...

  72 sent
   3 skipped — cooldown (same client)
       jane@acme.com — contacted 14 days ago for Twin Focus
       bob@quantum.io — contacted 22 days ago for Twin Focus
       lisa@beacon.co — contacted 8 days ago for Twin Focus
   1 skipped — declined
       dave@techco.io — closed_lost 60 days ago via Redwood Family Office
   1 skipped — domain throttle
       sarah@startup.com — already sent to john@startup.com at @startup.com today
   1 skipped — different client contacted recently
       tom@startup.ai — contacted 45 days ago by Redwood Family Office
   1 skipped — bounced
       old@defunct.com — hard bounce recorded — permanently suppressed
   1 error — API failure (cooldown not burned, safe to retry)
```

**Not silent. Every skip has a name, a reason, and a date.**

---

## Pre-Send Preview (Recommended)

Before the operator clicks "Route Intros", show a dry-run preview:

```
Ready to send 80 intros

  71 will send
   5 blocked by cooldown
   1 declined — 180-day cooldown
   1 domain throttle
   1 bounced — permanently suppressed
   1 at daily cap

[Show details]     [Route 71 Intros]
```

Implementation: a `check_send_batch` RPC that runs the same logic but INSERTs nothing. Read-only check, returns array of `{ email, allowed, reason, detail }`.

---

## Instantly Considerations

Instantly has its own dedup at the campaign level — if the same email is added to the same campaign twice, it won't send again. But we can't rely on this because:

1. Different runs may use different campaigns
2. We need to dedup across clients, not just campaigns
3. Instantly's dedup is opaque — we can't query "was this email sent?"
4. We need the audit trail regardless

Instantly is a delivery mechanism. The safety layer lives in our DB.

---

## Future: Performance at Scale (Bug #14)

### Problem
Every send runs `ORDER BY created_at DESC LIMIT 1` against the ledger. Fine at 10K rows. Hot at 10M rows even with partial indexes.

### Solution: Single-Row Lookup Tables

```sql
-- Last contact per normalized email
CREATE TABLE email_last_contacted (
  normalized_email TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL,
  last_client_id TEXT,
  last_client_name TEXT,
  last_operator_id TEXT,
  send_count INTEGER NOT NULL DEFAULT 1
);

-- Last contact per root domain per operator
CREATE TABLE domain_last_contacted (
  root_domain TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL,
  last_email TEXT,
  PRIMARY KEY (root_domain, operator_id)
);
```

Updated atomically by `confirm_send()` via UPSERT. Cooldown checks become single-row lookups instead of index scans. Not urgent at current scale — add when ledger exceeds ~500K rows.

### Daily Stats Table

```sql
CREATE TABLE operator_daily_stats (
  operator_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (operator_id, date)
);
```

Atomically incremented by `confirm_send()` instead of counting rows. Replaces the daily cap COUNT query.

### Ledger Partitioning

At 200 sends/day = 73k rows/year/operator. Add when table exceeds ~1M rows:

```sql
CREATE TABLE contact_send_ledger (...)
  PARTITION BY RANGE (created_at);
```

---

## Migration

One migration file. Table + 4 RPCs + indexes.

```
supabase/migrations/20260304200000_contact_send_ledger.sql
```

---

## Files Changed

| File | What |
|------|------|
| `supabase/migrations/20260304200000_contact_send_ledger.sql` | New table + RPCs + indexes |
| `src/station/intro/components/ComposePanel.tsx` | Reserve → send → confirm/fail flow in handleSend |
| `src/station/intro/sendSafety.ts` | New: `normalizeEmail()`, `extractRootDomain()`, `buildSendId()`, `reserveSend()`, `confirmSend()`, `failSend()`, `checkBatchEligibility()` |

Existing files untouched: `IntroductionsService.ts`, `RateLimitedSender.ts`, `SenderAdapter.ts`.

---

## What This Does NOT Cover (future)

- **Manual suppression list** — operator adds email to "never contact" list. Add later as `manual_suppress` block_reason.
- **Unsubscribe handling** — if recipient clicks unsubscribe in Instantly. Needs webhook integration.
- **Warm-up schedule** — new Instantly accounts need gradual ramp (10/day → 50/day → 200/day). The daily cap could be dynamic based on account age.
- **Introductions table normalization** — The `introductions` table stores raw emails in `demand_contact_email` / `supply_contact_email`. Rules 1 and 2 query against these. Long-term: add `normalized_email` column to `introductions` too, or join through the ledger.
