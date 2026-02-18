# VSL Flow — Deploy Checklist

Everything needed to go live. In order. Do not skip steps.

---

## STEP 1 — Run SQL Migration

Go to: **Supabase Dashboard → SQL Editor**
Run: `supabase/migrations/20260218100000_create_vsl_tables.sql`

This creates:
- `replies` table (inbound reply log, triggers intro correlation)
- `vsl_events` table (click + watched tracking)
- `pending_followups` table (scheduled followups)
- `vsl_engagement_by_thread` view (ReplyTracker + Introductions)

**Verify:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('replies', 'vsl_events', 'pending_followups');
-- Should return 3 rows
```

---

## STEP 2 — Add VSL Columns to operator_settings

Run this in SQL Editor (if not already present):

```sql
ALTER TABLE operator_settings
  ADD COLUMN IF NOT EXISTS vsl_url TEXT,
  ADD COLUMN IF NOT EXISTS vsl_followups_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vsl_watched_delay_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS vsl_not_watched_delay_hours INTEGER DEFAULT 48;
```

**Verify:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'operator_settings'
AND column_name IN ('vsl_url', 'vsl_followups_enabled', 'vsl_watched_delay_hours', 'vsl_not_watched_delay_hours');
-- Should return 4 rows
```

---

## STEP 3 — Deploy Edge Functions

Run from project root (one at a time, confirm each):

```bash
npx supabase functions deploy instantly-webhook --no-verify-jwt
npx supabase functions deploy vsl-redirect --no-verify-jwt
npx supabase functions deploy vsl-watch-confirm --no-verify-jwt
npx supabase functions deploy followup-dispatcher --no-verify-jwt
```

**Verify** (each should return 200):
```bash
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-webhook
# → 204

curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-watch-confirm
# → 204

curl -s -o /dev/null -w "%{http_code}" \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/followup-dispatcher
# → 200 (cron runs on POST, GET returns method not allowed — just check it's alive)
```

---

## STEP 4 — Configure Instantly Webhook

In Instantly: **Settings → Integrations → Webhooks → Create webhook**

| Field | Value |
|-------|-------|
| Target URL | `https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-webhook` |
| Event type | `reply_received` |
| Campaign | (optional) your demand campaign to filter |
| Name | `Connector OS — Reply Received` |

**After creating**, click **Test** (or use the API):
```bash
curl -X POST \
  https://api.instantly.ai/api/v2/webhooks/YOUR_WEBHOOK_ID/test \
  -H "Authorization: Bearer YOUR_INSTANTLY_API_KEY"
```

Check Supabase logs to see the exact payload format:
`https://supabase.com/dashboard/project/dqqchgvwqrqnthnbrfkp/logs/edge-functions`

---

## STEP 5 — Setup pg_cron (followup-dispatcher)

In Supabase SQL Editor:

```sql
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly dispatch
SELECT cron.schedule(
  'vsl-followup-dispatcher',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/followup-dispatcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

**Verify it registered:**
```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'vsl-followup-dispatcher';
```

**Manual trigger test** (runs it now without waiting for the hour):
```bash
curl -s -X POST \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/followup-dispatcher \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"ok":true,"sent":0,"failed":0,"total":0}
# total=0 is correct if no followups are due yet
```

---

## STEP 6 — Configure Operator Settings (VSL)

In the app: **Settings → Outreach**

Or directly in DB for your user:
```sql
UPDATE operator_settings
SET
  vsl_url = 'https://www.loom.com/share/YOUR_VIDEO_ID',
  vsl_followups_enabled = TRUE,
  vsl_watched_delay_hours = 24,
  vsl_not_watched_delay_hours = 48,
  instantly_api_key = 'YOUR_INSTANTLY_API_KEY'
WHERE user_id = 'YOUR_USER_ID';
```

---

## STEP 7 — Run Test Suite

```bash
npx vitest run tests/instantly-webhook.test.ts
```

With Instantly-native test (requires webhook ID from Step 4):
```bash
INSTANTLY_API_KEY=xxx \
INSTANTLY_WEBHOOK_ID=yyy \
INSTANTLY_CAMPAIGN_ID=zzz \
npx vitest run tests/instantly-webhook.test.ts
```

**Expected output:**
- All classifier unit tests pass
- Edge function integration tests all 200
- INTEREST test shows `vsl_sent: false` (no operator configured for test campaign)

---

## STEP 8 — Smoke Test End-to-End

### 8a. Trigger a fake reply (INTEREST)

```bash
curl -s -X POST \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "reply_received",
    "campaign_id": "YOUR_REAL_CAMPAIGN_ID",
    "lead_email": "smoke-test@example.com",
    "reply_body": "sounds good, happy to chat",
    "email_id": "fake-email-uuid-001",
    "eaccount": "you@yourdomain.com",
    "subject": "Quick intro",
    "thread_id": "smoke-thread-001",
    "personalization": { "_thread_id": "smoke-thread-001" }
  }'
```

**Expected response:**
```json
{"ok":true,"stage":"INTEREST","vsl_sent":true}
```

### 8b. Verify DB state

```sql
-- Reply was logged
SELECT stage, lead_email, replied_at FROM replies
WHERE lead_email = 'smoke-test@example.com'
ORDER BY replied_at DESC LIMIT 1;

-- not_watched followup was scheduled
SELECT followup_type, due_at, sent, cancelled FROM pending_followups
WHERE lead_email = 'smoke-test@example.com';

-- No click or watch events yet (correct)
SELECT * FROM vsl_events WHERE lead_email = 'smoke-test@example.com';
```

### 8c. Test the VSL redirect link

The AI reply should have contained a link like:
```
https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-redirect?uid=...&cid=...&email=smoke-test@example.com&tid=smoke-thread-001&url=...
```

Visit it — it should redirect to `https://app.connector-os.com/vsl/watch?...`

Verify click was logged:
```sql
SELECT event_type, created_at FROM vsl_events WHERE thread_id = 'smoke-thread-001';
-- → click | timestamp
```

### 8d. Test watch confirm

```bash
curl -s -X POST \
  https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-watch-confirm \
  -H "Content-Type: application/json" \
  -d '{
    "lead_email": "smoke-test@example.com",
    "thread_id": "smoke-thread-001"
  }'
# → {"ok":true}
```

Verify:
```sql
-- watched event logged
SELECT event_type FROM vsl_events WHERE thread_id = 'smoke-thread-001';
-- → click, watched

-- not_watched followup cancelled, watched followup scheduled
SELECT followup_type, sent, cancelled, due_at FROM pending_followups
WHERE thread_id = 'smoke-thread-001';
-- → not_watched | false | true  | ...
-- → watched     | false | false | <now + 24h>
```

---

## WHAT TO WATCH IN LOGS

**Function logs:** `https://supabase.com/dashboard/project/dqqchgvwqrqnthnbrfkp/logs/edge-functions`

| Log line | Means |
|----------|-------|
| `[instantly-webhook] Event: reply_received` | Payload received |
| `[instantly-webhook] lead@x.com → stage=INTEREST` | Classified correctly |
| `[instantly-webhook] VSL reply sent to lead@x.com` | Auto-reply fired |
| `[instantly-webhook] not_watched followup scheduled at ...` | Followup queued |
| `[instantly-webhook] Missing email_id or eaccount` | ⚠️ Payload incomplete — check Instantly webhook fields |
| `[followup-dispatcher] X followups due` | Cron running |
| `[followup-dispatcher] Sent watched to lead@x.com` | Followup delivered |

---

## OPEN UNKNOWNS (verify after first real reply)

1. **Does Instantly `reply_received` include `eaccount`?**
   Check logs for: `eaccount=none` → field name is different → update extraction fallbacks

2. **Do personalization vars come back in `personalization._thread_id`?**
   Check if `thread_id` is correct in the `replies` row, or check logs for `thread=none`

If either is missing, the fix is a 1-line update to the extraction logic in `instantly-webhook/index.ts`.
