import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * vsl-redirect
 *
 * Tracks VSL link clicks, then redirects to /vsl/watch.
 *
 * Accepts two modes:
 *
 * Mode A — slug (custom domain flow):
 *   GET /<slug>
 *   Looks up slug in vsl_links → verifies ownership → existing tracking logic
 *
 * Mode B — direct params (legacy / fallback):
 *   GET ?uid=...&cid=...&email=...&tid=...&url=...
 *
 * Flow:
 * 1. Resolve params (slug lookup or direct)
 * 2. Log click to vsl_events (idempotent)
 * 3. Parse provider + video_id from VSL URL
 * 4. Redirect to /vsl/watch?... (React route in frontend)
 */

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const APP_URL      = 'https://app.connector-os.com';

// ============================================================================
// VSL URL PARSER
// ============================================================================

function parseVslUrl(raw: string): { provider: 'loom' | 'youtube' | null; videoId: string | null } {
  try {
    if (raw.includes('loom.com')) {
      const m = raw.match(/(?:share\/|embed\/)([a-zA-Z0-9]+)/);
      return { provider: 'loom', videoId: m?.[1] || null };
    }
    if (raw.includes('youtube.com') || raw.includes('youtu.be')) {
      const long  = raw.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
      const short = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      return { provider: 'youtube', videoId: long?.[1] || short?.[1] || null };
    }
  } catch { /* ignore */ }
  return { provider: null, videoId: null };
}

// ============================================================================
// DB HELPER
// ============================================================================

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
// SLUG RESOLVER
// ============================================================================

async function resolveSlug(slug: string): Promise<{
  uid: string; cid: string; email: string; tid: string; rawUrl: string;
} | null> {
  const rows = await dbGet(
    `/vsl_links?slug=eq.${encodeURIComponent(slug)}&select=user_id,campaign_id,lead_email,thread_id,vsl_url,expires_at&limit=1`
  );
  const row = rows?.[0];
  if (!row) return null;

  // Reject expired links
  if (new Date(row.expires_at) < new Date()) {
    console.warn(`[vsl-redirect] Slug expired: ${slug}`);
    return null;
  }

  return {
    uid:    row.user_id    || '',
    cid:    row.campaign_id || '',
    email:  row.lead_email,
    tid:    row.thread_id  || '',
    rawUrl: row.vsl_url,
  };
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(req.url);

  let uid    = url.searchParams.get('uid')   || '';
  let cid    = url.searchParams.get('cid')   || '';
  let email  = url.searchParams.get('email') || '';
  let tid    = url.searchParams.get('tid')   || '';
  let rawUrl = decodeURIComponent(url.searchParams.get('url') || '');

  // Mode A: slug-based (custom domain flow)
  // Path is /<slug> — extract from pathname or ?slug= param
  const slugParam = url.searchParams.get('slug');
  const pathSlug  = url.pathname.replace(/^\/+/, '').split('/')[0];
  const slug      = slugParam || (pathSlug && !/^(vsl-redirect)$/.test(pathSlug) ? pathSlug : '');

  if (slug && !rawUrl) {
    const resolved = await resolveSlug(slug);
    if (!resolved) {
      return new Response('Link expired or not found', { status: 410 });
    }
    uid    = resolved.uid;
    cid    = resolved.cid;
    email  = resolved.email;
    tid    = resolved.tid;
    rawUrl = resolved.rawUrl;
  }

  if (!tid || !rawUrl) {
    return new Response('Missing tid or url', { status: 400 });
  }

  // Log click (idempotent — UNIQUE(thread_id, event_type) + ignore-duplicates)
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/vsl_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
          'Prefer': 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify({
          user_id:    uid   || null,
          thread_id:  tid,
          campaign_id: cid  || null,
          lead_email: email || null,
          event_type: 'click',
          vsl_url:    rawUrl,
        }),
      });
      console.log(`[vsl-redirect] Click logged: ${tid}`);
    } catch (err) {
      // Non-blocking — never fail the redirect over a log error
      console.error(`[vsl-redirect] Log failed (non-blocking): ${err}`);
    }
  }

  // Parse provider + video_id for VslWatch
  const { provider, videoId } = parseVslUrl(rawUrl);

  if (!provider || !videoId) {
    // Unknown provider — redirect directly to the VSL URL
    return Response.redirect(rawUrl, 302);
  }

  // Redirect to React /vsl/watch route
  const watchUrl = new URL(`${APP_URL}/vsl/watch`);
  watchUrl.searchParams.set('uid',      uid);
  watchUrl.searchParams.set('cid',      cid);
  watchUrl.searchParams.set('email',    email);
  watchUrl.searchParams.set('tid',      tid);
  watchUrl.searchParams.set('provider', provider);
  watchUrl.searchParams.set('video_id', videoId);

  return Response.redirect(watchUrl.toString(), 302);
});
