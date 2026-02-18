import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * followup-dispatcher
 *
 * Hourly cron that sends pending VSL followup emails via Instantly.
 *
 * Triggered by pg_cron every hour:
 *   SELECT cron.schedule(
 *     'vsl-followup-dispatcher',
 *     '0 * * * *',
 *     $$ SELECT net.http_post(
 *       url := 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/followup-dispatcher',
 *       headers := '{"Content-Type":"application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     ); $$
 *   );
 *
 * For each due followup:
 * 1. Look up operator Instantly API key
 * 2. Send reply to original email thread via Instantly
 * 3. Mark sent = true
 *
 * Followup types:
 *   watched     — lead watched VSL  → "saw you had a chance to check it out..."
 *   not_watched — lead clicked but didn't watch → "sent something over..."
 *
 * Guards:
 * - Never sends if already sent or cancelled
 * - Never sends if original_email_id is missing (can't thread reply)
 * - Max 100 followups per run (prevents runaway on backlog)
 */

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================================
// FOLLOWUP TEMPLATES
// ============================================================================

const TEMPLATES: Record<string, string> = {
  watched:     "saw you had a chance to check it out. worth a quick 10-15 to see if there's a fit?",
  not_watched: "sent something over a bit ago — might be worth 2 min if you get a chance.",
};

// ============================================================================
// DB HELPERS
// ============================================================================

function db(path: string, method = 'GET', body?: unknown, prefer?: string) {
  const headers: Record<string, string> = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
  };
  if (prefer) headers['Prefer'] = prefer;
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ============================================================================
// INSTANTLY REPLY SENDER
// ============================================================================

async function sendReply(
  apiKey: string,
  emailId: string,
  eaccount: string,
  subject: string,
  bodyText: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.instantly.ai/api/v2/emails/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        reply_to_uuid: emailId,
        eaccount,
        subject,
        body: { text: bodyText },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[followup-dispatcher] Instantly API ${res.status}: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[followup-dispatcher] Instantly API exception: ${err}`);
    return false;
  }
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  console.log('[followup-dispatcher] Starting run...');

  // Query followups due now (not sent, not canceled, scheduled_at <= now)
  const nowIso = new Date().toISOString();
  const res = await db(
    `/pending_followups?sent=eq.false&canceled=eq.false&scheduled_at=lte.${encodeURIComponent(nowIso)}&select=id,user_id,thread_id,campaign_id,lead_email,original_email_id,eaccount,original_subject,followup_type&limit=100`
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[followup-dispatcher] Query failed: ${err}`);
    return new Response(
      JSON.stringify({ ok: false, error: 'query_failed' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const followups = await res.json() as Array<{
    id:                string;
    user_id:           string;
    thread_id:         string;
    campaign_id:       string;
    lead_email:        string;
    original_email_id: string;
    eaccount:          string;
    original_subject:  string;
    followup_type:     'watched' | 'not_watched';
  }>;

  console.log(`[followup-dispatcher] ${followups.length} followups due`);

  let sent   = 0;
  let failed = 0;

  for (const followup of followups) {
    // Guard: need original_email_id + eaccount to reply in thread
    if (!followup.original_email_id || !followup.eaccount) {
      console.warn(`[followup-dispatcher] Skipping ${followup.id} — missing original_email_id or eaccount`);
      failed++;
      continue;
    }

    // Look up Instantly API key for this operator
    const settingsRes = await db(
      `/operator_settings?user_id=eq.${followup.user_id}&select=instantly_api_key`
    );

    if (!settingsRes.ok) {
      console.error(`[followup-dispatcher] Settings lookup failed for user ${followup.user_id}`);
      failed++;
      continue;
    }

    const settings = await settingsRes.json();
    const apiKey   = settings?.[0]?.instantly_api_key;

    if (!apiKey) {
      console.warn(`[followup-dispatcher] No Instantly API key for user ${followup.user_id}`);
      failed++;
      continue;
    }

    const bodyText = TEMPLATES[followup.followup_type] || TEMPLATES.not_watched;
    const subject  = followup.original_subject || 'Re: your message';
    const success  = await sendReply(apiKey, followup.original_email_id, followup.eaccount, subject, bodyText);

    if (success) {
      // Mark sent
      await db(
        `/pending_followups?id=eq.${followup.id}`,
        'PATCH',
        { sent: true, sent_at: new Date().toISOString() }
      );
      console.log(`[followup-dispatcher] Sent ${followup.followup_type} to ${followup.lead_email}`);
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[followup-dispatcher] Done — sent=${sent} failed=${failed} total=${followups.length}`);

  return new Response(
    JSON.stringify({ ok: true, sent, failed, total: followups.length }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
