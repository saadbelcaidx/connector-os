import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * vsl-watch-confirm
 *
 * Called by VslWatch.tsx when lead watches >=80% of the VSL (or video ends).
 *
 * POST body: { user_id, campaign_id, lead_email, thread_id, vsl_url }
 *
 * Actions:
 * 1. Log watched event to vsl_events (idempotent)
 * 2. Cancel pending not_watched followup for this thread
 * 3. Schedule watched followup (delay from operator settings, default 24h)
 */

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================================================
// DB HELPERS
// ============================================================================

function dbPost(path: string, body: unknown, prefer = 'return=minimal') {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey':        SERVICE_KEY,
      'Prefer':        prefer,
    },
    body: JSON.stringify(body),
  });
}

function dbPatch(path: string, body: unknown) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey':        SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
}

async function dbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey':        SERVICE_KEY,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  let body: {
    user_id?:    string;
    campaign_id?: string;
    lead_email:  string;
    thread_id:   string;
    vsl_url?:    string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_json' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const { user_id, campaign_id, lead_email, thread_id, vsl_url } = body;

  if (!thread_id || !lead_email) {
    return new Response(
      JSON.stringify({ error: 'thread_id and lead_email required' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[vsl-watch-confirm] Watched: ${thread_id} (${lead_email})`);

  // 1. Log watched event (idempotent via UNIQUE(thread_id, event_type))
  await dbPost('/vsl_events', {
    user_id:    user_id    || null,
    thread_id,
    campaign_id: campaign_id || null,
    lead_email,
    event_type: 'watched',
    vsl_url:    vsl_url   || null,
  }, 'resolution=ignore-duplicates,return=minimal');

  // 2. Cancel pending not_watched followup for this thread
  await dbPatch(
    `/pending_followups?thread_id=eq.${encodeURIComponent(thread_id)}&followup_type=eq.not_watched&sent=eq.false&canceled=eq.false`,
    { canceled: true, canceled_at: new Date().toISOString() }
  );

  // 3. Get operator delay config (default 24h)
  let watchedDelayHours = 24;
  if (user_id) {
    try {
      const rows = await dbGet(`/operator_settings?user_id=eq.${user_id}&select=vsl_watched_delay_hours`);
      if (rows?.[0]?.vsl_watched_delay_hours) {
        watchedDelayHours = Number(rows[0].vsl_watched_delay_hours);
      }
    } catch { /* use default */ }
  }

  // 4. Schedule watched followup (idempotent via UNIQUE(thread_id, followup_type))
  const dueAt = new Date(Date.now() + watchedDelayHours * 3_600_000).toISOString();

  await dbPost('/pending_followups', {
    user_id:    user_id    || null,
    thread_id,
    campaign_id: campaign_id || null,
    lead_email,
    followup_type: 'watched',
    scheduled_at: dueAt,
  }, 'resolution=ignore-duplicates,return=minimal');

  console.log(`[vsl-watch-confirm] Watched followup scheduled at ${dueAt} for ${thread_id}`);

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
