/**
 * Connector OS — VSL Tracking Worker
 *
 * Deploy this to Cloudflare Workers on your custom domain.
 * One worker handles all operators.
 *
 * Setup:
 * 1. Create a Cloudflare Worker (workers.dev dashboard)
 * 2. Paste this code
 * 3. Add a Custom Domain: watch.yourbrand.com → this worker
 * 4. Add a DNS CNAME in Cloudflare:
 *      watch  CNAME  <your-worker>.workers.dev  (proxied ✓)
 * 5. Enter "watch.yourbrand.com" in Connector OS Settings → Sending → Tracking Domain
 *
 * How it works:
 *   Lead clicks: watch.yourbrand.com/x7k2mq
 *   Worker proxies: vsl-redirect?slug=x7k2mq
 *   vsl-redirect: looks up slug → logs click → redirects to /vsl/watch
 *
 * Your brand stays visible. Connector OS infra stays invisible.
 */

const VSL_REDIRECT_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-redirect';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Extract slug from path: /x7k2mq → x7k2mq
    const slug = url.pathname.replace(/^\/+/, '').split('/')[0];

    if (!slug) {
      return new Response('Not found', { status: 404 });
    }

    // Proxy to vsl-redirect with slug param
    const target = `${VSL_REDIRECT_URL}?slug=${encodeURIComponent(slug)}`;
    return fetch(target, { redirect: 'follow' });
  },
};
