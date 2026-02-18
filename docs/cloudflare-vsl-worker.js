/**
 * Connector OS — VSL Tracking Worker v2
 *
 * Serves the watch page directly from the Worker.
 * URL stays on go.introrelay.com — app.connector-os.com is never visible to the lead.
 *
 * Setup:
 * 1. Create a Cloudflare Worker
 * 2. Paste this code
 * 3. Add Custom Domain: go.introrelay.com → this worker
 *
 * Flow:
 *   Lead clicks: go.introrelay.com/x7k2mq
 *   Worker calls: vsl-redirect?slug=x7k2mq  (logs click, returns 302 with params)
 *   Worker parses: provider, video_id, uid, cid, email, tid from redirect URL
 *   Worker serves: full HTML watch page with embedded player + 80% tracking
 *   URL stays:    go.introrelay.com/x7k2mq  — connector-os.com never shown
 */

const VSL_REDIRECT_URL  = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-redirect';
const WATCH_CONFIRM_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-watch-confirm';

// ─── HTML escape (defence against malformed DB values) ────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ─── Shared page shell ────────────────────────────────────────────────────────
const SHELL_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .wrap{width:100%;max-width:1200px;padding:20px}
  .player{position:relative;padding-bottom:56.25%;height:0;background:#111;border-radius:12px;overflow:hidden}
  .player iframe,.player #yt{position:absolute;top:0;left:0;width:100%;height:100%;border:none}
`;

// ─── Loom page ────────────────────────────────────────────────────────────────
function loomPage({ videoId, uid, cid, email, tid }) {
  const vslUrl = `https://www.loom.com/share/${esc(videoId)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Overview</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<div class="wrap"><div class="player">
  <iframe
    src="https://www.loom.com/embed/${esc(videoId)}"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
</div></div>
<script>
(function(){
  var fired=false;
  var payload={
    user_id:"${esc(uid)}",
    campaign_id:"${esc(cid)}",
    lead_email:"${esc(email)}",
    thread_id:"${esc(tid)}",
    vsl_url:"${vslUrl}"
  };
  function fireWatched(){
    if(fired)return; fired=true;
    fetch("${WATCH_CONFIRM_URL}",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    }).catch(function(){});
  }
  window.addEventListener("message",function(e){
    if(!e.origin||!e.origin.includes("loom.com"))return;
    try{
      var d=typeof e.data==="string"?JSON.parse(e.data):e.data;
      if(d.type==="progress"||d.event==="progress"){
        var pct=(d.percent||d.progress||0)*100;
        if(pct>=80)fireWatched();
      }
      if(d.type==="ended"||d.event==="ended"||
         d.type==="finish"||d.type==="end"||
         d.event==="end"||d.type==="complete"){
        fireWatched();
      }
    }catch(err){}
  });
  setTimeout(fireWatched,45000);
})();
</script>
</body></html>`;
}

// ─── YouTube page ─────────────────────────────────────────────────────────────
function youtubePage({ videoId, uid, cid, email, tid }) {
  const vslUrl = `https://www.youtube.com/watch?v=${esc(videoId)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Overview</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<div class="wrap"><div class="player">
  <div id="yt"></div>
</div></div>
<script>
(function(){
  var fired=false;
  var timer=null;
  var payload={
    user_id:"${esc(uid)}",
    campaign_id:"${esc(cid)}",
    lead_email:"${esc(email)}",
    thread_id:"${esc(tid)}",
    vsl_url:"${vslUrl}"
  };
  function fireWatched(){
    if(fired)return; fired=true;
    if(timer)clearInterval(timer);
    fetch("${WATCH_CONFIRM_URL}",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    }).catch(function(){});
  }
  window.onYouTubeIframeAPIReady=function(){
    var p=new YT.Player("yt",{
      videoId:"${esc(videoId)}",
      playerVars:{autoplay:1,rel:0,modestbranding:1,playsinline:1},
      events:{
        onReady:function(){
          timer=setInterval(function(){
            try{
              var dur=p.getDuration();
              var cur=p.getCurrentTime();
              if(dur>0&&(cur/dur)*100>=80)fireWatched();
            }catch(e){}
          },1000);
        },
        onStateChange:function(e){
          if(e.data===0)fireWatched();
        }
      }
    });
  };
  var s=document.createElement("script");
  s.src="https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
  setTimeout(fireWatched,45000);
})();
</script>
</body></html>`;
}

// ─── Worker entry ─────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+/, '').split('/')[0];

    if (!slug) {
      return new Response('Not found', { status: 404 });
    }

    // Call vsl-redirect — click is logged there, returns 302 with watch params
    const target = `${VSL_REDIRECT_URL}?slug=${encodeURIComponent(slug)}`;
    let location;
    try {
      const res = await fetch(target, { redirect: 'manual' });
      location = res.headers.get('Location');
      if (!location) {
        // 410 expired / 400 bad slug — pass through as-is
        return new Response(await res.text(), { status: res.status });
      }
    } catch {
      return new Response('Service unavailable', { status: 503 });
    }

    // Parse watch params from redirect URL
    let params;
    try {
      const watchUrl = new URL(location);
      params = {
        provider: watchUrl.searchParams.get('provider') || '',
        videoId:  watchUrl.searchParams.get('video_id') || '',
        uid:      watchUrl.searchParams.get('uid')      || '',
        cid:      watchUrl.searchParams.get('cid')      || '',
        email:    watchUrl.searchParams.get('email')    || '',
        tid:      watchUrl.searchParams.get('tid')      || '',
      };
    } catch {
      // Unparseable redirect — fall back to redirect
      return Response.redirect(location, 302);
    }

    // Unknown provider — redirect to raw VSL URL (graceful degradation)
    if (!params.provider || !params.videoId) {
      return Response.redirect(location, 302);
    }

    // Serve watch page — URL stays on go.introrelay.com
    const html = params.provider === 'youtube'
      ? youtubePage(params)
      : loomPage(params);

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
