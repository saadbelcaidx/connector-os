/**
 * Catch-All Confidence Probing
 *
 * When SMTP returns RISKY (catch-all domain), run zero-cost probes
 * to compute a confidence score. Upgrade to VALID when >= 80.
 *
 * Four probes (all free, all parallel, 3s budget):
 * 1. Microsoft 365 account enumeration (+50 exists / -20 not found)
 * 2. Gravatar hash check (+40 exists)
 * 3. Provider pattern match (+25 match)
 * 4. Cross-provider pattern stats (+15 for 10+ wins)
 */

const crypto = require('crypto');
const { LruTtlCache } = require('./dnsIntel');

const CONFIDENCE_BUDGET_MS = 3000;
const UPGRADE_THRESHOLD = 80;

// In-memory probe caches (24h TTL)
const m365Cache = new LruTtlCache(5000);
const gravatarCache = new LruTtlCache(5000);
const PROBE_TTL = 24 * 60 * 60 * 1000;

// ============================================================
// PROBE 1: Microsoft 365 Account Enumeration
// ============================================================

async function probeMicrosoft365(email, domain, provider) {
  // Google/Proton domains will never have M365 accounts
  if (provider === 'google' || provider === 'proton') {
    return { checked: false, exists: null, ms: 0, reason: 'wrong_provider' };
  }

  const cacheKey = `m365:${email.toLowerCase()}`;
  const cached = m365Cache.get(cacheKey);
  if (cached) return cached;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch('https://login.microsoftonline.com/common/GetCredentialType', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: email }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await resp.json();
    const ms = Date.now() - start;

    // IfExistsResult: 0 = exists, 1 = doesn't exist, 5 = exists in different tenant, 6 = domain not found
    const exists = data.IfExistsResult === 0 || data.IfExistsResult === 5;
    const notExists = data.IfExistsResult === 1;

    const result = {
      checked: true,
      exists: exists ? true : (notExists ? false : null),
      ifExistsResult: data.IfExistsResult,
      ms,
    };

    m365Cache.set(cacheKey, result, PROBE_TTL);
    console.log(`[CatchAllConf] M365 probe ${email}: exists=${result.exists} (code=${data.IfExistsResult}) ms=${ms}`);
    return result;
  } catch (err) {
    return { checked: false, exists: null, ms: Date.now() - start, error: err.message };
  }
}

// ============================================================
// PROBE 2: Gravatar Hash Check
// ============================================================

async function probeGravatar(email) {
  const cacheKey = `gravatar:${email.toLowerCase()}`;
  const cached = gravatarCache.get(cacheKey);
  if (cached) return cached;

  const start = Date.now();
  try {
    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const resp = await fetch(`https://gravatar.com/avatar/${hash}?d=404`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const ms = Date.now() - start;
    const exists = resp.status === 200;

    const result = { checked: true, exists, ms };
    gravatarCache.set(cacheKey, result, PROBE_TTL);
    console.log(`[CatchAllConf] Gravatar probe ${email}: exists=${exists} ms=${ms}`);
    return result;
  } catch (err) {
    return { checked: false, exists: false, ms: Date.now() - start, error: err.message };
  }
}

// ============================================================
// PROBE 3: Provider Pattern Match (local, instant)
// ============================================================

function probeProviderPattern(email, domain, provider, db) {
  const local = email.split('@')[0].toLowerCase();

  // Provider-dominant pattern weights
  const PROVIDER_WEIGHTS = {
    google: 25,
    microsoft: 20,
    zoho: 20,
    unknown: 10,
  };

  const weight = PROVIDER_WEIGHTS[provider] || PROVIDER_WEIGHTS.unknown;
  let matches = false;
  let pattern = null;

  // Check if local part matches provider's dominant patterns
  if (provider === 'google' && /^[a-z]+\.[a-z]+$/.test(local)) {
    matches = true;
    pattern = 'first.last';
  } else if (provider === 'microsoft') {
    if (/^[a-z]+\.[a-z]+$/.test(local) || /^[a-z][a-z]+$/.test(local) || /^[a-z]\.[a-z]+$/.test(local)) {
      matches = true;
      pattern = 'microsoft_common';
    }
  } else if (/^[a-z]+\.[a-z]+$/.test(local) || /^[a-z]+$/.test(local)) {
    // Generic: first.last or firstname are most common
    matches = true;
    pattern = /\./.test(local) ? 'first.last' : 'firstname';
  }

  // Also check domain-specific learned pattern (2-win gate)
  try {
    const domainPattern = db.prepare(
      `SELECT pattern, wins FROM domain_patterns WHERE domain = ? AND wins >= 2`
    ).get(domain.toLowerCase());

    if (domainPattern) {
      matches = true;
      pattern = domainPattern.pattern;
    }
  } catch (_) { /* domain_patterns table may not exist yet */ }

  return {
    checked: true,
    matches,
    pattern,
    providerWeight: matches ? weight : 0,
  };
}

// ============================================================
// PROBE 4: Cross-Provider Pattern Stats (local, instant)
// ============================================================

function probeCrossProviderStats(email, domain, provider, db) {
  const local = email.split('@')[0].toLowerCase();

  // Classify structural pattern
  let structuralPattern = 'unknown';
  if (/^[a-z]+\.[a-z]+$/.test(local)) structuralPattern = 'firstname.lastname';
  else if (/^[a-z]+$/.test(local)) structuralPattern = 'firstname';
  else if (/^[a-z][a-z]+$/.test(local) && local.length <= 8) structuralPattern = 'firstinitiallastname';
  else if (/^[a-z]+_[a-z]+$/.test(local)) structuralPattern = 'firstname_lastname';

  try {
    const result = db.prepare(`
      SELECT SUM(wins) as total_wins, COUNT(*) as domain_count
      FROM domain_patterns WHERE pattern = ?
    `).get(structuralPattern);

    return {
      checked: true,
      patternWins: result?.total_wins || 0,
      totalDomains: result?.domain_count || 0,
    };
  } catch (_) {
    return { checked: true, patternWins: 0, totalDomains: 0 };
  }
}

// ============================================================
// MAIN: Confidence Scoring
// ============================================================

async function probeCatchAllConfidence(email, domain, provider, db) {
  const start = Date.now();
  let confidence = 0;
  const signals = [];
  const probes = {};

  // Run external probes in parallel with budget
  let m365Result, gravatarResult;
  try {
    const results = await Promise.race([
      Promise.allSettled([
        probeMicrosoft365(email, domain, provider),
        probeGravatar(email),
      ]),
      new Promise((resolve) => {
        setTimeout(() => resolve([
          { status: 'rejected', reason: 'budget_exceeded' },
          { status: 'rejected', reason: 'budget_exceeded' },
        ]), CONFIDENCE_BUDGET_MS);
      }),
    ]);
    m365Result = results[0];
    gravatarResult = results[1];
  } catch (_) {
    m365Result = { status: 'rejected' };
    gravatarResult = { status: 'rejected' };
  }

  // --- Score: Microsoft 365 ---
  if (m365Result?.status === 'fulfilled' && m365Result.value?.checked) {
    probes.microsoft365 = m365Result.value;
    if (m365Result.value.exists === true) {
      confidence += 50;
      signals.push('Microsoft 365 account exists');
    } else if (m365Result.value.exists === false) {
      confidence -= 20;
      signals.push('Microsoft 365 account not found');
    }
  } else {
    probes.microsoft365 = { checked: false, exists: null, ms: 0 };
  }

  // --- Score: Gravatar ---
  if (gravatarResult?.status === 'fulfilled' && gravatarResult.value?.checked) {
    probes.gravatar = gravatarResult.value;
    if (gravatarResult.value.exists) {
      confidence += 40;
      signals.push('Gravatar profile exists');
    }
  } else {
    probes.gravatar = { checked: false, exists: false, ms: 0 };
  }

  // --- Score: Provider Pattern (local, instant) ---
  const patternResult = probeProviderPattern(email, domain, provider, db);
  probes.patternMatch = patternResult;
  if (patternResult.matches) {
    confidence += patternResult.providerWeight;
    signals.push(`Matches ${provider} pattern (${patternResult.pattern})`);
  }

  // --- Score: Cross-Provider Stats (local, instant) ---
  const crossResult = probeCrossProviderStats(email, domain, provider, db);
  probes.crossProvider = crossResult;
  if (crossResult.patternWins >= 10) {
    confidence += 15;
    signals.push(`Pattern verified ${crossResult.patternWins}x across ${crossResult.totalDomains} domains`);
  } else if (crossResult.patternWins >= 3) {
    confidence += 8;
    signals.push(`Pattern verified ${crossResult.patternWins}x across ${crossResult.totalDomains} domains`);
  }

  // --- Bonus: Domain has mixed stats (not pure catch-all) ---
  try {
    const stats = db.prepare(`SELECT * FROM domain_stats WHERE domain = ?`).get(domain.toLowerCase());
    if (stats && stats.ok_count > 0) {
      confidence += 10;
      signals.push(`Domain has ${stats.ok_count} confirmed valid emails`);
    }
  } catch (_) { /* table may not exist */ }

  // Clamp 0-100
  confidence = Math.max(0, Math.min(100, confidence));

  const ms = Date.now() - start;
  console.log(`[CatchAllConf] ${email}: confidence=${confidence} shouldUpgrade=${confidence >= UPGRADE_THRESHOLD} signals=[${signals.join(', ')}] ms=${ms}`);

  return {
    confidence,
    signals,
    shouldUpgrade: confidence >= UPGRADE_THRESHOLD,
    probes,
    ms,
  };
}

module.exports = {
  probeCatchAllConfidence,
  UPGRADE_THRESHOLD,
};
