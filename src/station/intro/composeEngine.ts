/**
 * Compose Engine V2 — Operator writes first, AI adapts
 *
 * Pure logic, no React. Extracted from validated TestComposeV2.tsx.
 *
 * Flow:
 * 1. Operator writes one perfect intro pair for a reference match
 * 2. AI analyzes the voice/structure itself (no hardcoded patterns)
 * 3. AI rebuilds for remaining matches with match-specific context
 */

import type { ComposedDraft } from './types';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import type { IntroAIConfig } from '../../services/IntroAI';
import type { ClientProfile } from '../../types/station';
import { callAI } from '../../services/IntroAI';

// =============================================================================
// MATCH CONTEXT
// =============================================================================

/**
 * Build a human-readable context string for a single match.
 * Used in the AI prompt so it understands each pair's specifics.
 */
export function buildMatchContext(
  match: MatchResult,
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResult?: any,
): string {
  const d = canonicals.get(match.demandKey);
  const s = canonicals.get(match.supplyKey);

  // Enrich with contact names if available
  let supplyEnrich: { firstName?: string; lastName?: string; title?: string } | undefined;
  let demandEnrich: { firstName?: string; lastName?: string; title?: string } | undefined;
  if (enrichResult && typeof enrichResult === 'object' && 'supply' in enrichResult) {
    const se = enrichResult.supply;
    if (se && typeof se === 'object' && se.outcome === 'ENRICHED') supplyEnrich = se;
    const de = enrichResult.demand;
    if (de && typeof de === 'object' && de.outcome === 'ENRICHED') demandEnrich = de;
  }

  const demandContact = demandEnrich
    ? `${demandEnrich.firstName || ''} ${demandEnrich.lastName || ''}`.trim() + (demandEnrich.title ? `, ${demandEnrich.title}` : '')
    : d?.who || 'unknown';

  const supplyContact = supplyEnrich
    ? `${supplyEnrich.firstName || ''} ${supplyEnrich.lastName || ''}`.trim() + (supplyEnrich.title ? `, ${supplyEnrich.title}` : '')
    : s?.who || 'unknown';

  const lines = [
    `Demand: ${d?.company || match.demandKey} (contact: ${demandContact}) — industry: ${d?.industry || 'n/a'} — wants: ${d?.wants || 'n/a'} — whyNow: ${d?.whyNow || 'n/a'}`,
    `Supply: ${s?.company || match.supplyKey} (contact: ${supplyContact}) — industry: ${s?.industry || 'n/a'} — offers: ${s?.offers || 'n/a'}`,
    `Framing: ${match.framing || 'n/a'}`,
  ];
  if (match.reasoning) {
    lines.push(`Reasoning: ${match.reasoning}`);
  }
  return lines.join('\n');
}

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build the validated V2 compose prompt.
 * Steps 1/2/3 — give reference + context, tell AI to analyze pattern itself, reconstruct per match.
 */
export function buildComposePrompt(
  reference: {
    match: MatchResult;
    supplyDraft: string;
    demandDraft: string;
  },
  remaining: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): string {
  const refD = canonicals.get(reference.match.demandKey);
  const refS = canonicals.get(reference.match.supplyKey);
  const refEnrich = enrichResults.get(reference.match.evalId);
  const refContext = buildMatchContext(reference.match, canonicals, refEnrich);

  // Contact names for reference
  let refSupplyContact = refS?.who || '?';
  let refDemandContact = refD?.who || '?';
  if (refEnrich && typeof refEnrich === 'object' && 'supply' in refEnrich) {
    const se = refEnrich.supply;
    if (se && typeof se === 'object' && se.outcome === 'ENRICHED' && se.firstName) {
      refSupplyContact = `${se.firstName} ${se.lastName || ''}`.trim();
    }
    const de = refEnrich.demand;
    if (de && typeof de === 'object' && de.outcome === 'ENRICHED' && de.firstName) {
      refDemandContact = `${de.firstName} ${de.lastName || ''}`.trim();
    }
  }

  const matchesBlock = remaining.map((m, i) => {
    const enrichResult = enrichResults.get(m.evalId);
    const ctx = buildMatchContext(m, canonicals, enrichResult);
    return `[${i + 1}] id: ${m.evalId}\n${ctx}`;
  }).join('\n\n');

  return `You are ghostwriting outreach intros for a market operator. Below is ONE example pair the operator wrote by hand for a specific match. Your job: figure out the operator's voice, structure, and style yourself — then write NEW intros for each remaining match.

STEP 1 — THE REFERENCE:
The operator wrote these intros for this specific match:

Match context:
${refContext}
Supply contact: ${refSupplyContact} at ${refS?.company || '?'}
Demand contact: ${refDemandContact} at ${refD?.company || '?'}

Supply intro (sent to ${refSupplyContact}):
${reference.supplyDraft}

Demand intro (sent to ${refDemandContact}):
${reference.demandDraft}

STEP 2 — ANALYZE IT YOURSELF:
Look at the reference intros and figure out:
- How many paragraphs? What role does each one play?
- Which parts are this operator's STYLE (reusable across any match)?
- Which parts are SPECIFIC to the reference match's context (industry, signal, timing, capability)?

STEP 3 — WRITE NEW INTROS:
Soft language only. 3rd grade reading level. No corporate buzzwords.

For each match below, write a supply intro and demand intro that:
- Follow the SAME structure, paragraph count, and approximate length as the reference
- Replace all match-specific content with details from the NEW match's context
- Supply intro is SENT TO the supply contact — pitch DEMAND-SIDE opportunities/signals to them. NEVER pitch the supplier's own company back to them.
- Demand intro is SENT TO the demand contact — pitch the SUPPLY company's capabilities to them.
- NEVER copy full sentences from the reference. Reconstruct from pattern + new context.
- If the reference names companies or contacts, do the same with the new match's real names. If it doesn't, don't.

Return ONLY a JSON array: [{ "id": "eval_id", "supplyIntro": "...", "demandIntro": "..." }]

MATCHES:
${matchesBlock}`;
}

// =============================================================================
// RESPONSE PARSER
// =============================================================================

/** Strip markdown fences, JSON.parse, validate shape */
export function parseComposedDrafts(raw: string): ComposedDraft[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array from AI response');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    evalId: String(item.id || item.evalId || ''),
    supplyIntro: String(item.supplyIntro || ''),
    demandIntro: String(item.demandIntro || ''),
  }));
}

// =============================================================================
// GROUPED PROMPT BUILDER (Supply = one-to-many, Demand = one-to-one)
// =============================================================================

/**
 * Build a compose prompt that groups matches by supplier.
 * Supply intros see ALL demand contexts for that supplier.
 * Demand intros remain one per match.
 */
export function buildGroupedComposePrompt(
  reference: {
    match: MatchResult;
    supplyDraft: string;
    demandDraft: string;
  },
  remaining: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): string {
  const refD = canonicals.get(reference.match.demandKey);
  const refS = canonicals.get(reference.match.supplyKey);
  const refEnrich = enrichResults.get(reference.match.evalId);
  const refContext = buildMatchContext(reference.match, canonicals, refEnrich);

  // Contact names for reference
  let refSupplyContact = refS?.who || '?';
  let refDemandContact = refD?.who || '?';
  if (refEnrich && typeof refEnrich === 'object' && 'supply' in refEnrich) {
    const se = refEnrich.supply;
    if (se && typeof se === 'object' && se.outcome === 'ENRICHED' && se.firstName) {
      refSupplyContact = `${se.firstName} ${se.lastName || ''}`.trim();
    }
    const de = refEnrich.demand;
    if (de && typeof de === 'object' && de.outcome === 'ENRICHED' && de.firstName) {
      refDemandContact = `${de.firstName} ${de.lastName || ''}`.trim();
    }
  }

  // Group remaining matches by supplyKey
  const supplyGroups = new Map<string, MatchResult[]>();
  for (const m of remaining) {
    const group = supplyGroups.get(m.supplyKey) || [];
    group.push(m);
    supplyGroups.set(m.supplyKey, group);
  }

  // Build supply intros section — one per unique supplier with full demand landscape
  let sIdx = 0;
  const supplyBlocks: string[] = [];
  for (const [supplyKey, matches] of supplyGroups) {
    sIdx++;
    const s = canonicals.get(supplyKey);
    const firstMatch = matches[0];
    const firstEnrich = enrichResults.get(firstMatch.evalId);

    let supplyContact = s?.who || 'unknown';
    let supplyTitle = '';
    if (firstEnrich && typeof firstEnrich === 'object' && 'supply' in firstEnrich) {
      const se = firstEnrich.supply;
      if (se && typeof se === 'object' && se.outcome === 'ENRICHED') {
        if (se.firstName) supplyContact = `${se.firstName} ${se.lastName || ''}`.trim();
        if (se.title) supplyTitle = se.title;
      }
    }

    const demandLines = matches.map(m => {
      const d = canonicals.get(m.demandKey);
      const enrichResult = enrichResults.get(m.evalId);
      let dContact = d?.who || 'unknown';
      if (enrichResult && typeof enrichResult === 'object' && 'demand' in enrichResult) {
        const de = enrichResult.demand;
        if (de && typeof de === 'object' && de.outcome === 'ENRICHED' && de.firstName) {
          dContact = `${de.firstName} ${de.lastName || ''}`.trim();
        }
      }
      return `  - ${d?.company || m.demandKey} (${dContact}) — wants: ${d?.wants || 'n/a'} — whyNow: ${d?.whyNow || 'n/a'}`;
    }).join('\n');

    const framings = matches.map(m => m.framing).filter(Boolean);
    const framingLine = framings.length > 0 ? `  Framing themes: ${framings.join(' | ')}` : '';

    supplyBlocks.push(
      `[S${sIdx}] Supply: ${s?.company || supplyKey} (contact: ${supplyContact}${supplyTitle ? `, ${supplyTitle}` : ''}) — offers: ${s?.offers || 'n/a'}\n  Demand landscape:\n${demandLines}${framingLine ? '\n' + framingLine : ''}`
    );
  }

  // Build demand intros section — one per match
  const demandBlocks = remaining.map((m, i) => {
    const d = canonicals.get(m.demandKey);
    const s = canonicals.get(m.supplyKey);
    const enrichResult = enrichResults.get(m.evalId);
    const ctx = buildMatchContext(m, canonicals, enrichResult);
    return `[D${i + 1}] id: ${m.evalId} — Demand: ${d?.company || m.demandKey} matched with ${s?.company || m.supplyKey}\n${ctx}`;
  }).join('\n\n');

  return `You are ghostwriting outreach intros for a market operator. Below is ONE example pair the operator wrote by hand for a specific match. Your job: figure out the operator's voice, structure, and style yourself — then write NEW intros for each remaining match.

STEP 1 — THE REFERENCE:
The operator wrote these intros for this specific match:

Match context:
${refContext}
Supply contact: ${refSupplyContact} at ${refS?.company || '?'}
Demand contact: ${refDemandContact} at ${refD?.company || '?'}

Supply intro (sent to ${refSupplyContact}):
${reference.supplyDraft}

Demand intro (sent to ${refDemandContact}):
${reference.demandDraft}

STEP 2 — ANALYZE IT YOURSELF:
Look at the reference intros and figure out:
- How many paragraphs? What role does each one play?
- Which parts are this operator's STYLE (reusable across any match)?
- Which parts are SPECIFIC to the reference match's context (industry, signal, timing, capability)?

STEP 3 — WRITE NEW INTROS:
Soft language only. 3rd grade reading level. No corporate buzzwords.

SUPPLY INTROS — Write ONE per unique supplier. Each supplier sees ALL their demand contexts so you can frame strategically around the full demand landscape (multiple segments, broader opportunity). Do NOT just pick one demand and ignore the rest.

${supplyBlocks.join('\n\n')}

DEMAND INTROS — Write ONE per match. Each demand contact gets an intro specific to their pairing with the supplier.

${demandBlocks}

Rules:
- Follow the SAME structure, paragraph count, and approximate length as the reference
- Replace all match-specific content with details from the NEW context
- Supply intro is SENT TO the supply contact — it should pitch DEMAND-SIDE opportunities/signals to them. NEVER pitch the supplier's own company back to them. The supply person already knows what they do. Show them the demand landscape.
- Demand intro is SENT TO the demand contact — it should pitch the SUPPLY company's capabilities to them. Show the demand person what the supplier can do for them.
- NEVER copy full sentences from the reference. Reconstruct from pattern + new context.
- If the reference names companies or contacts, do the same with the new match's real names. If it doesn't, don't.

Return ONLY JSON in this exact format:
{
  "supplyIntros": [
    { "key": "S1", "intro": "..." },
    { "key": "S2", "intro": "..." }
  ],
  "demandIntros": [
    { "id": "eval_id", "intro": "..." },
    { "id": "eval_id", "intro": "..." }
  ]
}`;
}

// =============================================================================
// GROUPED RESPONSE PARSER
// =============================================================================

interface GroupedAIResponse {
  supplyIntros: { key: string; intro: string }[];
  demandIntros: { id: string; intro: string }[];
}

/** Parse the grouped AI response format */
export function parseGroupedResponse(raw: string): GroupedAIResponse {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected JSON object from AI response');
  }
  if (!Array.isArray(parsed.supplyIntros)) {
    throw new Error('Missing supplyIntros array in AI response');
  }
  if (!Array.isArray(parsed.demandIntros)) {
    throw new Error('Missing demandIntros array in AI response');
  }

  return {
    supplyIntros: parsed.supplyIntros.map((item: Record<string, unknown>) => ({
      key: String(item.key || ''),
      intro: String(item.intro || ''),
    })),
    demandIntros: parsed.demandIntros.map((item: Record<string, unknown>) => ({
      id: String(item.id || ''),
      intro: String(item.intro || ''),
    })),
  };
}

// =============================================================================
// GROUPED ORCHESTRATOR
// =============================================================================

/**
 * Generate composed intros with supply dedup.
 * Groups matches by supplyKey, AI writes one supply intro per supplier.
 * Returns ComposedDraft[] — same shape, but supply intros are shared across
 * all evalIds for the same supplier.
 */
export async function generateGroupedIntros(
  aiConfig: IntroAIConfig,
  reference: {
    match: MatchResult;
    supplyDraft: string;
    demandDraft: string;
  },
  remaining: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): Promise<ComposedDraft[]> {
  // Build supply groups for mapping response back
  const supplyGroups = new Map<string, MatchResult[]>();
  for (const m of remaining) {
    const group = supplyGroups.get(m.supplyKey) || [];
    group.push(m);
    supplyGroups.set(m.supplyKey, group);
  }

  // Build ordered key list so we can map S1, S2 etc back to supplyKey
  const supplyKeyOrder = [...supplyGroups.keys()];

  const BATCH_SIZE = 10;
  const allDrafts: ComposedDraft[] = [];

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const prompt = buildGroupedComposePrompt(reference, batch, canonicals, enrichResults);

    // Token budget: supply intros + demand intros
    const batchSupplyKeys = new Set(batch.map(m => m.supplyKey));
    const maxTokens = Math.min(300 * (batch.length + batchSupplyKeys.size), 8000);

    console.log(`[ComposeEngine] Grouped batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} matches, ${batchSupplyKeys.size} unique suppliers`);
    const raw = await callAI(aiConfig, prompt, maxTokens);
    const grouped = parseGroupedResponse(raw);

    // Build batch-local supply key order for this batch
    const batchSupplyGroups = new Map<string, MatchResult[]>();
    for (const m of batch) {
      const group = batchSupplyGroups.get(m.supplyKey) || [];
      group.push(m);
      batchSupplyGroups.set(m.supplyKey, group);
    }
    const batchSupplyKeyOrder = [...batchSupplyGroups.keys()];

    // Map supply intros by S-key index back to supplyKey
    const supplyIntroByKey = new Map<string, string>();
    for (const si of grouped.supplyIntros) {
      const idx = parseInt(si.key.replace('S', ''), 10) - 1;
      if (idx >= 0 && idx < batchSupplyKeyOrder.length) {
        supplyIntroByKey.set(batchSupplyKeyOrder[idx], si.intro);
      }
    }

    // Map demand intros by evalId
    const demandIntroById = new Map<string, string>();
    for (const di of grouped.demandIntros) {
      demandIntroById.set(di.id, di.intro);
    }

    // Assemble ComposedDraft[] — each evalId gets its supplier's shared supply intro
    for (const m of batch) {
      allDrafts.push({
        evalId: m.evalId,
        supplyIntro: supplyIntroByKey.get(m.supplyKey) || '',
        demandIntro: demandIntroById.get(m.evalId) || '',
      });
    }
  }

  return allDrafts;
}

// =============================================================================
// ORCHESTRATOR (original — kept for TestComposeV2 compatibility)
// =============================================================================

/**
 * Generate composed intros for all remaining matches.
 * Chunks into batches of 10 if >10 remaining.
 */
export async function generateComposedIntros(
  aiConfig: IntroAIConfig,
  reference: {
    match: MatchResult;
    supplyDraft: string;
    demandDraft: string;
  },
  remaining: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): Promise<ComposedDraft[]> {
  const BATCH_SIZE = 10;
  const allDrafts: ComposedDraft[] = [];

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const prompt = buildComposePrompt(reference, batch, canonicals, enrichResults);
    const maxTokens = Math.min(300 * batch.length, 6000);

    console.log(`[ComposeEngine] Generating batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} matches)`);
    const raw = await callAI(aiConfig, prompt, maxTokens);
    const drafts = parseComposedDrafts(raw);
    allDrafts.push(...drafts);
  }

  return allDrafts;
}

// =============================================================================
// FULFILLMENT MODE — Demand-only compose (client IS the supply)
// =============================================================================

/**
 * Build match context for fulfillment mode.
 * Supply company is replaced with anonymized client profile fields.
 * Client name is NEVER exposed.
 */
export function buildFulfillmentMatchContext(
  match: MatchResult,
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResult?: any,
  clientProfile?: ClientProfile,
): string {
  const d = canonicals.get(match.demandKey);

  // Demand contact from enrichment
  let demandContact = d?.who || 'unknown';
  if (enrichResult && typeof enrichResult === 'object' && 'demand' in enrichResult) {
    const de = enrichResult.demand;
    if (de && typeof de === 'object' && de.outcome === 'ENRICHED' && de.firstName) {
      demandContact = `${de.firstName} ${de.lastName || ''}`.trim();
    }
  }

  // Supply capability — anonymous but rich
  const capParts = [
    clientProfile?.companyDescription ? `description: ${clientProfile.companyDescription}` : null,
    clientProfile?.specialization ? `specialization: ${clientProfile.specialization}` : null,
    (clientProfile?.differentiators?.length) ? `differentiators: ${clientProfile.differentiators.join(', ')}` : null,
  ].filter(Boolean).join(' — ');

  const keywordsStr = d?.keywords?.length ? d.keywords.join(', ') : '';
  const signalStr = [d?.signalLabel, d?.signalGroup, d?.signalType].filter(Boolean).join(' / ');
  const demandLine = [
    `Demand: ${d?.company || match.demandKey} (contact: ${demandContact})`,
    `industry: ${d?.industry || 'n/a'}`,
    `wants: ${d?.wants || 'n/a'}`,
    `whyNow: ${d?.whyNow || 'n/a'}`,
    keywordsStr ? `focus areas: ${keywordsStr}` : null,
    signalStr ? `signal: ${signalStr}` : null,
  ].filter(Boolean).join(' — ');

  const lines = [
    demandLine,
    `Supply capability (anonymous): ${capParts || 'n/a'}`,
    `Framing (USE THIS AS THE INTRO ANGLE): ${match.framing || 'n/a'}`,
    `Reasoning (WHY this person is relevant): ${match.reasoning || 'n/a'}`,
  ];
  return lines.join('\n');
}

/**
 * Build prompt for fulfillment compose — demand-only intros.
 * Client profile is provided anonymously. Client name is never mentioned.
 */
export function buildFulfillmentComposePrompt(
  reference: {
    match: MatchResult;
    demandDraft: string;
  },
  remaining: { demandKey: string; evalIds: string[]; match: MatchResult }[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
  clientProfile: ClientProfile,
): string {
  const refD = canonicals.get(reference.match.demandKey);
  const refEnrich = enrichResults.get(reference.match.evalId);
  const refContext = buildFulfillmentMatchContext(reference.match, canonicals, refEnrich, clientProfile);

  let refDemandContact = refD?.who || '?';
  if (refEnrich && typeof refEnrich === 'object' && 'demand' in refEnrich) {
    const de = refEnrich.demand;
    if (de && typeof de === 'object' && de.outcome === 'ENRICHED' && de.firstName) {
      refDemandContact = `${de.firstName} ${de.lastName || ''}`.trim();
    }
  }

  const matchesBlock = remaining.map((entry, i) => {
    // Scan all evalIds for best enrichment — same logic as UI demandGroups
    let enrichResult = null;
    for (const eid of entry.evalIds) {
      const er = enrichResults.get(eid);
      if (er?.demand?.outcome === 'ENRICHED' && er.demand.firstName) {
        enrichResult = er;
        break;
      }
    }
    if (!enrichResult) enrichResult = enrichResults.get(entry.evalIds[0]);
    const ctx = buildFulfillmentMatchContext(entry.match, canonicals, enrichResult, clientProfile);
    return `[${i + 1}] demandKey: ${entry.demandKey}\n${ctx}`;
  }).join('\n\n');

  // Build full client profile block — include every field that has data
  const profileLines: string[] = [];
  if (clientProfile.companyDescription) profileLines.push(`  What they do: ${clientProfile.companyDescription}`);
  if (clientProfile.specialization) profileLines.push(`  Specialization: ${clientProfile.specialization}`);
  if (clientProfile.differentiators?.length) profileLines.push(`  Differentiators: ${clientProfile.differentiators.join(', ')}`);
  if (clientProfile.painPoints?.length) profileLines.push(`  Problems they solve: ${clientProfile.painPoints.join(', ')}`);
  if (clientProfile.desiredOutcomes?.length) profileLines.push(`  Outcomes they deliver: ${clientProfile.desiredOutcomes.join(', ')}`);
  if (clientProfile.caseStudy) profileLines.push(`  Proof / case study: ${clientProfile.caseStudy}`);
  if (clientProfile.icpDescription) profileLines.push(`  Ideal client: ${clientProfile.icpDescription}`);
  if (clientProfile.icpTitles?.length) profileLines.push(`  Target titles: ${clientProfile.icpTitles.join(', ')}`);
  if (clientProfile.icpIndustries?.length) profileLines.push(`  Target industries: ${clientProfile.icpIndustries.join(', ')}`);
  if (clientProfile.icpCompanySize) profileLines.push(`  Target size: ${clientProfile.icpCompanySize}`);
  if (clientProfile.icpGeography) profileLines.push(`  Geography: ${clientProfile.icpGeography}`);
  if (clientProfile.messagingTone) profileLines.push(`  Tone: ${clientProfile.messagingTone}`);
  if (clientProfile.prospectingQuestions?.length) profileLines.push(`  Prospecting angles: ${clientProfile.prospectingQuestions.join(' | ')}`);
  if (clientProfile.fullBrief) profileLines.push(`  Full brief:\n${clientProfile.fullBrief}`);
  const profileBlock = profileLines.length > 0 ? profileLines.join('\n') : '  (no profile data provided)';

  return `You are ghostwriting demand-side outreach intros for a market operator. The operator's client is the supply side — they have ALREADY paid and do NOT get cold outreach. You are writing intros to DEMAND contacts only.

CRITICAL RULES:
- Demand-side outreach ONLY
- NEVER name the client company — describe their capability generically (e.g., "a firm specializing in..." or "a team that...")
- DIFFERENTIATION IS MANDATORY — every intro MUST be unique to that contact's specific situation
- If a contact has a "Framing" field (not "n/a") — use it as the INTRO ANGLE
- If a contact has a "Reasoning" field (not "n/a") — use it to personalize why you're reaching out
- If framing/reasoning are "n/a" or empty — use the contact's INDUSTRY, WANTS, and WHY NOW as the angle instead. These are ALWAYS different per contact. Build the hook around their specific situation.
- Two contacts in different industries with different needs MUST get completely different intros. Never write a generic pitch.

CLIENT PROFILE (anonymous — NEVER name this company):
${profileBlock}

STEP 1 — THE REFERENCE:
The operator wrote this demand intro for a specific match:

Match context:
${refContext}
Demand contact: ${refDemandContact} at ${refD?.company || '?'}

Demand intro (sent to ${refDemandContact}):
${reference.demandDraft}

STEP 2 — ANALYZE IT YOURSELF:
Look at the reference intro and figure out:
- How many paragraphs? What role does each one play?
- Which parts are this operator's STYLE (reusable across any contact)?
- Which parts are SPECIFIC to this demand contact's context (industry, signal, timing, framing)?
- How does the reference USE the framing angle to open / hook?

STEP 3 — WRITE NEW INTROS:
Soft language only. 3rd grade reading level. No corporate buzzwords.

For each demand contact below, write ONE intro that:
- Opens with a hook SPECIFIC to that contact's industry/situation (not a generic opener)
- If FRAMING is available: use it as the core angle
- If FRAMING is "n/a": build the angle from their INDUSTRY + WANTS + WHY NOW instead
- If REASONING is available: use it to personalize. If "n/a": personalize using their company context
- Follows the SAME structure, paragraph count, and approximate length as the reference
- Replaces all contact-specific content with details from the NEW context
- References the supply capability generically (NEVER name the client)
- NEVER copy full sentences from the reference. Reconstruct from pattern + new context
- Each intro MUST read as if written specifically for that one person — no two intros should share the same opening line or hook

Return ONLY a JSON array: [{ "demandKey": "key", "demandIntro": "..." }]

DEMAND CONTACTS:
${matchesBlock}`;
}

/**
 * Parse fulfillment AI response — demand-only JSON.
 * Sets supplyIntro to empty string on every draft.
 */
export function parseFulfillmentResponse(raw: string): { demandKey: string; demandIntro: string }[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array from AI response');
  }

  return parsed.map((item: Record<string, unknown>) => ({
    demandKey: String(item.demandKey || ''),
    demandIntro: String(item.demandIntro || ''),
  }));
}

/**
 * Generate fulfillment intros — demand-only compose with 3-layer dedup.
 *
 * Layer 1 (Prompt): Dedup by demandKey — same founder × N supply firms = 1 AI call
 * Layer 2 (Draft mapping): Map single AI draft back to all evalIds sharing that demandKey
 * Layer 3 (Send): Handled by ComposePanel.handleSend
 */
export async function generateFulfillmentIntros(
  aiConfig: IntroAIConfig,
  reference: {
    match: MatchResult;
    demandDraft: string;
  },
  remaining: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
  clientProfile: ClientProfile,
): Promise<ComposedDraft[]> {
  // Layer 1: Dedup by demandKey — same founder matched via multiple supply firms gets ONE intro
  const demandGroups = new Map<string, { evalIds: string[]; match: MatchResult }>();
  for (const m of remaining) {
    const existing = demandGroups.get(m.demandKey);
    if (existing) {
      existing.evalIds.push(m.evalId);
    } else {
      demandGroups.set(m.demandKey, { evalIds: [m.evalId], match: m });
    }
  }

  const uniqueDemands = [...demandGroups.entries()].map(([demandKey, v]) => ({
    demandKey,
    evalIds: v.evalIds,
    match: v.match,
  }));

  const BATCH_SIZE = 10;
  const allDrafts: ComposedDraft[] = [];

  for (let i = 0; i < uniqueDemands.length; i += BATCH_SIZE) {
    const batch = uniqueDemands.slice(i, i + BATCH_SIZE);
    const prompt = buildFulfillmentComposePrompt(reference, batch, canonicals, enrichResults, clientProfile);
    const maxTokens = Math.min(300 * batch.length, 6000);

    console.log(`[ComposeEngine] Fulfillment batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} unique demand contacts`);
    const raw = await callAI(aiConfig, prompt, maxTokens);
    const parsed = parseFulfillmentResponse(raw);

    // Layer 2: Map deduped drafts back to all evalIds sharing the same demandKey
    const introByDemandKey = new Map<string, string>();
    for (const p of parsed) {
      introByDemandKey.set(p.demandKey, p.demandIntro);
    }

    for (const entry of batch) {
      const intro = introByDemandKey.get(entry.demandKey) || '';
      for (const evalId of entry.evalIds) {
        allDrafts.push({
          evalId,
          supplyIntro: '',
          demandIntro: intro,
        });
      }
    }
  }

  return allDrafts;
}
