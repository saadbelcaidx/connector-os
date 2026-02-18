import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * instantly-webhook
 *
 * Receives reply_received events from Instantly.
 *
 * Flow:
 * 1. Parse payload — extract: campaign_id, lead_email, reply_body, email_id, thread_id
 * 2. Classify reply stage (inline — no cold start)
 * 3. Write to replies table → Postgres trigger auto-updates introductions status
 * 4. If INTEREST + operator has vsl_followups_enabled + vsl_url:
 *    a. Call reply-brain for AI-generated reply
 *    b. Append tracked VSL URL (via vsl-redirect)
 *    c. Auto-send reply via Instantly API
 *    d. Schedule not_watched followup in pending_followups
 *
 * Idempotent: duplicate webhook events write same reply row (no unique constraint
 * on replies — acceptable, Postgres trigger handles correlation safely).
 */

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').trim();
const SERVICE_KEY  = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-instantly-webhook-secret',
};

// ============================================================================
// INLINE STAGE CLASSIFIER (avoids cold-start latency of calling reply-brain)
// ============================================================================

const PATTERNS = {
  BOUNCE:   /undeliverable|address not found|mailbox not found|user unknown|does not exist|550 /i,
  OOO:      /out of (the )?office|on (vacation|holiday|leave|pto)|auto.?reply|automatic reply/i,
  HOSTILE:  /\b(fuck|shit|spam|scam|stop spamming|reported|blocking)\b/i,
  NEGATIVE: /\b(not interested|no thanks|no thank you|pass|remove me|take me off|unsubscribe|stop emailing|don't contact|not for me)\b/i,
  INTEREST: /\b(interested|i'm interested|sure|yes|yeah|yep|sounds good|happy to|open to|that works|works for me|i'm in|absolutely|definitely|perfect|alright|go ahead|intro me|let's do it|sounds interesting|tell me more|curious)\b/i,
};

function classifyStage(text: string): string {
  if (PATTERNS.BOUNCE.test(text))   return 'BOUNCE';
  if (PATTERNS.OOO.test(text))      return 'OOO';
  if (PATTERNS.HOSTILE.test(text))  return 'HOSTILE';
  if (PATTERNS.NEGATIVE.test(text)) return 'NEGATIVE';
  if (PATTERNS.INTEREST.test(text)) return 'INTEREST';
  return 'UNKNOWN';
}

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
// REPLY-BRAIN CALLER
// ============================================================================

async function generateAIReply(
  inbound: string,
  aiConfig: Record<string, string>,
  calendarLink?: string
): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reply-brain`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        inbound,
        outbound: '',
        aiConfig,
        operatorContext: { calendarLink: calendarLink || '' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response || null;
  } catch {
    return null;
  }
}

// ============================================================================
// INSTANTLY REPLY SENDER
// ============================================================================

async function sendInstantlyReply(
  apiKey: string,
  emailId: string,
  eaccount: string,
  body: string,
  subject: string
): Promise<boolean> {
  try {
    const replySubject = subject
      ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`)
      : 'Re: your message';

    const payload = {
      reply_to_uuid: emailId,
      eaccount,
      subject: replySubject,
      body: { text: body },
    };

    const res = await fetch('https://api.instantly.ai/api/v2/emails/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[instantly-webhook] Instantly reply API ${res.status}: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[instantly-webhook] Instantly reply API exception: ${err}`);
    return false;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = String(payload.event_type || '');
  console.log(`[instantly-webhook] Event: ${eventType}`);

  // Only process reply_received events
  if (eventType !== 'reply_received') {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, event: eventType }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Extract fields — handle multiple Instantly payload formats
  const campaignId  = String(payload.campaign_id  || payload.campaignId  || '');
  const leadEmail   = String(payload.lead_email   || payload.leadEmail   || payload.from_email || '');
  const replyBody   = String(payload.reply_body   || payload.replyBody   || payload.body       || '');
  const emailId     = String(payload.email_id     || payload.emailId     || payload.id         || '');
  const eaccount    = String(payload.eaccount     || payload.email_account || payload.from_account || payload.sending_account || '');
  const subject     = String(payload.subject      || '');
  const fromEmail   = leadEmail;

  // Our custom variables come back in personalization
  const personalization = (payload.personalization || {}) as Record<string, string>;
  const threadId = personalization._thread_id || String(payload.thread_id || '');

  if (!campaignId || !leadEmail) {
    console.error('[instantly-webhook] Missing campaign_id or lead_email');
    return new Response('Missing required fields', { status: 400 });
  }

  // Classify the reply
  const stage = classifyStage(replyBody);
  console.log(`[instantly-webhook] ${leadEmail} → stage=${stage} (thread=${threadId || 'none'})`);

  // Look up operator by campaign_id
  const settings = await dbGet(
    `/operator_settings?or=(instantly_campaign_demand.eq.${encodeURIComponent(campaignId)},instantly_campaign_supply.eq.${encodeURIComponent(campaignId)},instantly_campaign_id.eq.${encodeURIComponent(campaignId)})&limit=1`
  );
  const operator = settings?.[0] || null;

  // Write to replies table
  // Postgres trigger (intro_reply_trigger) auto-correlates to introductions
  await dbPost('/replies', {
    user_id:    operator?.user_id || null,
    lead_email: leadEmail,
    from_email: fromEmail,
    campaign_id: campaignId,
    thread_id:  threadId || null,
    direction:  'inbound',
    reply_body: replyBody,
    stage,
    replied_at: new Date().toISOString(),
  });

  console.log(`[instantly-webhook] Reply logged (${stage}) for ${leadEmail}`);

  // Stop here if not INTEREST or no operator found
  if (stage !== 'INTEREST' || !operator) {
    return new Response(
      JSON.stringify({ ok: true, stage }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const {
    user_id,
    vsl_url,
    vsl_followups_enabled,
    vsl_not_watched_delay_hours = 48,
    instantly_api_key,
    ai_provider,
    ai_openai_api_key,
    ai_anthropic_api_key,
    ai_azure_api_key,
    ai_azure_endpoint,
    ai_azure_deployment,
    ai_model,
    calendar_link,
    custom_vsl_domain,
  } = operator;

  // VSL flow requires: enabled flag + VSL URL + Instantly API key + custom domain
  if (!vsl_followups_enabled || !vsl_url || !instantly_api_key) {
    console.log(`[instantly-webhook] VSL disabled or not configured for user ${user_id}`);
    return new Response(
      JSON.stringify({ ok: true, stage, vsl: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!custom_vsl_domain) {
    console.error(`[instantly-webhook] No custom_vsl_domain set for user ${user_id} — VSL send blocked. Set a tracking domain in Settings.`);
    return new Response(
      JSON.stringify({ ok: true, stage, vsl: false, error: 'custom_vsl_domain_missing' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate unique 6-char slug + store in vsl_links
  const slug = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6);

  const tid = threadId || leadEmail;

  await fetch(`${SUPABASE_URL}/rest/v1/vsl_links`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey':        SERVICE_KEY,
      'Prefer':        'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      slug,
      user_id,
      campaign_id: campaignId,
      lead_email:  leadEmail,
      thread_id:   tid || null,
      vsl_url,
    }),
  });

  // Clean domain (strip protocol if user pasted it)
  const domain = custom_vsl_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const trackedVslUrl = `https://${domain}/${slug}`;

  // Build AI config from operator settings
  const aiConfig: Record<string, string> = {};
  if (ai_provider)          aiConfig.provider       = ai_provider;
  if (ai_openai_api_key)    aiConfig.openaiApiKey   = ai_openai_api_key;
  if (ai_anthropic_api_key) aiConfig.anthropicApiKey = ai_anthropic_api_key;
  if (ai_azure_api_key)     aiConfig.azureApiKey    = ai_azure_api_key;
  if (ai_azure_endpoint)    aiConfig.azureEndpoint  = ai_azure_endpoint;
  if (ai_azure_deployment)  aiConfig.azureDeployment = ai_azure_deployment;
  if (ai_model)             aiConfig.model          = ai_model;

  // Generate AI reply
  let replyText = await generateAIReply(replyBody, aiConfig, calendar_link);

  if (!replyText) {
    replyText = `thanks for getting back — here's a quick overview: ${trackedVslUrl}`;
  } else {
    replyText = `${replyText}\n\nHere's a quick overview: ${trackedVslUrl}`;
  }

  // Auto-send reply via Instantly (requires emailId + eaccount from payload)
  let vslSent = false;
  if (emailId && eaccount) {
    vslSent = await sendInstantlyReply(
      instantly_api_key, emailId, eaccount, replyText,
      subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : 'Re: your message'
    );

    if (vslSent) {
      console.log(`[instantly-webhook] VSL reply sent to ${leadEmail} via ${eaccount}`);

      // Schedule not_watched followup
      const notWatchedDelayHours = Number(vsl_not_watched_delay_hours) || 48;
      const dueAt = new Date(Date.now() + notWatchedDelayHours * 3_600_000).toISOString();
      const replySubject = subject
        ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`)
        : 'Re: your message';

      await dbPost('/pending_followups', {
        user_id,
        thread_id:         threadId   || null,
        campaign_id:       campaignId,
        lead_email:        leadEmail,
        original_email_id: emailId,
        eaccount,
        original_subject:  replySubject,
        followup_type:     'not_watched',
        scheduled_at:      dueAt,
      }, 'resolution=ignore-duplicates,return=minimal');

      console.log(`[instantly-webhook] not_watched followup scheduled at ${dueAt}`);
    }
  } else {
    console.warn(`[instantly-webhook] Missing email_id or eaccount — cannot auto-reply for ${leadEmail} (email_id=${emailId || 'none'}, eaccount=${eaccount || 'none'})`);
  }

  return new Response(
    JSON.stringify({ ok: true, stage, vsl_sent: vslSent }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
