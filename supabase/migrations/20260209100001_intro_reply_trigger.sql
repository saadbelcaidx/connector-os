-- ============================================================================
-- REPLY TRIGGER — Auto-update introductions when replies arrive
--
-- When a row is inserted into `replies`, this trigger looks for a matching
-- introduction by thread_id and updates its status to 'replied'.
--
-- This avoids modifying the deployed webhook edge functions.
-- The webhook inserts into `replies` → trigger fires → intro updated.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_intro_on_reply()
RETURNS TRIGGER AS $$
DECLARE
  v_intro RECORD;
BEGIN
  -- Only process if the reply has a thread_id to correlate
  IF NEW.thread_id IS NULL OR NEW.thread_id = '' THEN
    RETURN NEW;
  END IF;

  -- Find matching introduction (most recent, still in sent/delivered status)
  SELECT id, status, demand_contact_email, supply_contact_email
  INTO v_intro
  FROM introductions
  WHERE thread_id = NEW.thread_id
    AND status IN ('sent', 'delivered')
  ORDER BY created_at DESC
  LIMIT 1;

  -- No matching intro found — nothing to update
  IF v_intro.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine which side replied (demand or supply) based on sender email
  IF NEW.from_email IS NOT NULL AND NEW.from_email = v_intro.demand_contact_email THEN
    -- Demand side replied
    UPDATE introductions SET
      status = 'replied',
      demand_replied_at = COALESCE(NEW.received_at, now()),
      demand_reply_stage = NEW.stage,
      first_reply_at = COALESCE(first_reply_at, COALESCE(NEW.received_at, now()))
    WHERE id = v_intro.id;
  ELSIF NEW.from_email IS NOT NULL AND NEW.from_email = v_intro.supply_contact_email THEN
    -- Supply side replied
    UPDATE introductions SET
      status = 'replied',
      supply_replied_at = COALESCE(NEW.received_at, now()),
      supply_reply_stage = NEW.stage,
      first_reply_at = COALESCE(first_reply_at, COALESCE(NEW.received_at, now()))
    WHERE id = v_intro.id;
  ELSE
    -- Can't determine side — still mark as replied
    UPDATE introductions SET
      status = 'replied',
      first_reply_at = COALESCE(first_reply_at, COALESCE(NEW.received_at, now()))
    WHERE id = v_intro.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to replies table (AFTER INSERT so it doesn't block webhook)
DROP TRIGGER IF EXISTS intro_reply_correlation ON replies;
CREATE TRIGGER intro_reply_correlation
  AFTER INSERT ON replies
  FOR EACH ROW EXECUTE FUNCTION update_intro_on_reply();
