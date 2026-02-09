/**
 * Provider Intelligence — Combined Resolution
 *
 * Merges MX, SPF, and Autodiscover signals to determine
 * the actual mailbox provider behind a domain.
 *
 * Priority:
 *   1. Autodiscover (strongest — explicit Microsoft 365)
 *   2. SPF (reveals real provider behind gateways)
 *   3. MX (direct provider or gateway)
 *   4. Unknown
 */

const {
  isDomainLive,
  getMxProvider,
  inferMailboxProviderFromSpf,
  inferProviderFromAutodiscover,
  GATEWAY_PROVIDERS,
} = require('./dnsIntel');

// Overall DNS intel budget per request
const DNS_INTEL_BUDGET_MS = 2500;

// SMTP-blocking providers — code=mb from these is expected, not risky
const SMTP_BLOCKING_PROVIDERS = new Set(['google', 'proton']);

/**
 * Resolve the actual mailbox provider for a domain.
 *
 * Runs DNS lookups in parallel with a hard 2.5s budget.
 * If budget exceeded, returns partial results + continues existing behavior.
 *
 * @param {string} domain
 * @param {string} cid  Correlation ID for structured logging
 * @returns {Promise<{
 *   provider: string,
 *   smtpBlocking: boolean,
 *   gatewayMx: string|null,
 *   evidence: { mx: string, spf: string, autodiscover: string },
 *   live: boolean|'unknown',
 *   ms: number
 * }>}
 */
async function resolveMailboxProvider(domain, cid = '-') {
  const start = Date.now();

  // Run all DNS lookups in parallel with overall budget
  let liveness, mx, spf, autodiscover;

  try {
    const results = await Promise.race([
      Promise.allSettled([
        isDomainLive(domain, cid),
        getMxProvider(domain, cid),
        inferMailboxProviderFromSpf(domain, cid),
        inferProviderFromAutodiscover(domain, cid),
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DNS_BUDGET_EXCEEDED')), DNS_INTEL_BUDGET_MS)
      ),
    ]);

    liveness = results[0].status === 'fulfilled' ? results[0].value : { live: 'unknown' };
    mx = results[1].status === 'fulfilled' ? results[1].value : { provider: 'unknown', smtpBlocking: false, mxHosts: [], isGateway: false };
    spf = results[2].status === 'fulfilled' ? results[2].value : { inferred: 'unknown', spfPresent: false };
    autodiscover = results[3].status === 'fulfilled' ? results[3].value : { inferred: 'unknown', hit: false };
  } catch (err) {
    // Budget exceeded — proceed with whatever we have
    const ms = Date.now() - start;
    console.log(`[DNS] cid=${cid} step=RESOLVE domain=${domain} ms=${ms} ok=0 reason=BUDGET_EXCEEDED`);
    return {
      provider: 'unknown',
      smtpBlocking: false,
      gatewayMx: null,
      evidence: { mx: 'unknown', spf: 'unknown', autodiscover: 'unknown' },
      live: 'unknown',
      ms,
    };
  }

  const ms = Date.now() - start;

  // Resolution priority:
  // 1. Autodiscover says microsoft → microsoft
  // 2. SPF says google/microsoft/zoho → that
  // 3. MX says provider (and not a gateway) → that
  // 4. MX is gateway + SPF reveals real provider → real provider
  // 5. Unknown

  let provider = 'unknown';
  let decidedBy = 'none';

  if (autodiscover.inferred !== 'unknown') {
    provider = autodiscover.inferred;
    decidedBy = 'autodiscover';
  } else if (spf.inferred !== 'unknown') {
    provider = spf.inferred;
    decidedBy = 'spf';
  } else if (mx.provider !== 'unknown') {
    provider = mx.provider;
    decidedBy = 'mx';
  }

  // Gateway detection: MX is a security layer (mimecast/proofpoint/barracuda)
  // but the real mailbox provider is behind it (revealed by SPF or autodiscover)
  const gatewayMx = mx.isGateway ? mx.provider : null;

  // If MX is a gateway and SPF/autodiscover revealed the real provider,
  // the gateway's smtpBlocking status is irrelevant — use the real provider's
  const smtpBlocking = SMTP_BLOCKING_PROVIDERS.has(provider);

  const evidence = {
    mx: mx.provider,
    spf: spf.inferred,
    autodiscover: autodiscover.inferred,
  };

  console.log(
    `[DNS] cid=${cid} step=RESOLVE domain=${domain} ms=${ms} ` +
    `provider=${provider} decided_by=${decidedBy} ` +
    `gateway_mx=${gatewayMx || 'none'} smtp_blocking=${smtpBlocking} ` +
    `evidence=${JSON.stringify(evidence)}`
  );

  return {
    provider,
    smtpBlocking,
    gatewayMx,
    evidence,
    live: liveness.live,
    ms,
  };
}

module.exports = {
  resolveMailboxProvider,
  SMTP_BLOCKING_PROVIDERS,
  DNS_INTEL_BUDGET_MS,
};
