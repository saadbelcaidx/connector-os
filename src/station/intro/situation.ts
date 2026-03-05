/**
 * Situation Layer — Relational Messaging Primitive
 *
 * Computes relational context between two parties from evaluation outputs
 * (framing, reasoning, scores) OR canonical data when evaluation text is missing.
 * Templates receive only Identity + Situation.
 * Canonical entity properties have no path to templates.
 */

import { callAI, type IntroAIConfig } from '../../services/IntroAI';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';

// =============================================================================
// TYPES
// =============================================================================

export interface Situation {
  momentum: string;     // what's happening NOW — 4-8 word noun phrase
  bridge: string;       // what connects these parties — 4-8 word noun phrase
  opportunity: string;  // what a conversation could unlock — 6-12 word clause
  urgency: 'hot' | 'warm' | 'ambient';
  fitLevel: 'exact' | 'adjacent' | 'stretch';
}

export const SITUATION_FALLBACKS: Situation = {
  momentum: '',
  bridge: '',
  opportunity: '',
  urgency: 'ambient',
  fitLevel: 'stretch',
};

// =============================================================================
// DETERMINISTIC METADATA
// =============================================================================

function deriveUrgency(timing: number): Situation['urgency'] {
  if (timing > 0.8) return 'hot';
  if (timing > 0.5) return 'warm';
  return 'ambient';
}

function deriveFitLevel(fit: number): Situation['fitLevel'] {
  if (fit > 0.8) return 'exact';
  if (fit > 0.5) return 'adjacent';
  return 'stretch';
}

// =============================================================================
// BATCH AI DERIVATION
// =============================================================================

const SITUATION_PROMPT = `You compute relational context between two parties for an operator's introduction.

For each match, you receive context about both parties. Extract 3 situational primitives.

RULES:
- momentum: 3-6 words. Present-tense action. No conjunctions. No stacked nouns.
- bridge: 2-5 words. Single capability or friction. No "and". No compound phrases.
- opportunity: 4-8 words. Casual, clear outcome. Active voice. No filler.

Each primitive must be able to stand alone as a sentence fragment.

GOOD EXAMPLES:
  momentum: "rebuilding their sales team"
  bridge: "pipeline automation"
  opportunity: "skip two months of sourcing"

  momentum: "expanding into new markets"
  bridge: "compliance tooling"
  opportunity: "avoid the usual regulatory mess"

BAD EXAMPLES (never produce these):
  momentum: "Building growth partnerships" — stacked nouns, corporate
  bridge: "Infrastructure expertise" — compound noun, vague
  opportunity: "Enhance scalability with robust systems" — corporate speak, filler

CONSTRAINTS:
- No entity names. These describe the SITUATION, not the parties.
- No corporate speak. Conversational.
- Derive from whatever context is provided (framing, reasoning, or company descriptions).

MATCHES:
`;

/**
 * Build a context string for the AI from whatever data is available.
 * Priority: framing/reasoning (rich eval text) > canonical data (company descriptions).
 */
function buildMatchContext(
  m: MatchResult,
  canonicals?: Map<string, CanonicalInfo>,
): string | null {
  // Best case: evaluation has framing or reasoning
  if (m.framing || m.reasoning) {
    return JSON.stringify({
      id: m.evalId,
      framing: m.framing || '',
      reasoning: m.reasoning || '',
      fit: m.scores.fit,
      timing: m.scores.timing,
    });
  }

  // Fallback: build context from canonical data
  if (!canonicals) return null;

  const dc = canonicals.get(m.demandKey);
  const sc = canonicals.get(m.supplyKey);
  if (!dc && !sc) return null;

  const parts: string[] = [];
  if (dc) {
    if (dc.wants) parts.push(`Demand needs: ${dc.wants}`);
    if (dc.whyNow) parts.push(`Demand timing: ${dc.whyNow}`);
    if (dc.industry) parts.push(`Demand industry: ${dc.industry}`);
  }
  if (sc) {
    if (sc.offers) parts.push(`Supply offers: ${sc.offers}`);
    if (sc.wants) parts.push(`Supply seeks: ${sc.wants}`);
    if (sc.industry) parts.push(`Supply industry: ${sc.industry}`);
  }

  if (parts.length === 0) return null;

  return JSON.stringify({
    id: m.evalId,
    context: parts.join('. '),
    fit: m.scores.fit,
    timing: m.scores.timing,
  });
}

/**
 * Derive Situation objects from evaluation outputs in a single batch AI call.
 *
 * Uses framing/reasoning when available. Falls back to canonical data
 * (company descriptions) when evaluation text is empty.
 *
 * ~500 tokens for 50 matches. ~$0.002 with Haiku.
 */
export async function deriveSituationBatch(
  matches: MatchResult[],
  aiConfig: IntroAIConfig | null,
  canonicals?: Map<string, CanonicalInfo>,
): Promise<Map<string, Situation>> {
  const result = new Map<string, Situation>();

  // Always compute deterministic metadata
  for (const m of matches) {
    result.set(m.evalId, {
      ...SITUATION_FALLBACKS,
      urgency: deriveUrgency(m.scores.timing),
      fitLevel: deriveFitLevel(m.scores.fit),
    });
  }

  if (!aiConfig || matches.length === 0) {
    console.log('[Situation] EARLY EXIT — aiConfig:', !!aiConfig, 'matches:', matches.length);
    return result;
  }

  // Build context for each match from best available data
  const payloads: string[] = [];
  const derivableIds: string[] = [];
  for (const m of matches) {
    const ctx = buildMatchContext(m, canonicals);
    if (ctx) {
      payloads.push(ctx);
      derivableIds.push(m.evalId);
    }
  }

  console.log('[Situation] derivable:', derivableIds.length, '/', matches.length);
  if (payloads.length === 0) {
    console.log('[Situation] EARLY EXIT — no context available for any match');
    return result;
  }

  const prompt = SITUATION_PROMPT + '[' + payloads.join(',') + ']' +
    '\n\nReturn JSON array: [{"id":"...","momentum":"...","bridge":"...","opportunity":"..."}, ...]';

  try {
    // ~80 tokens per match (id + 3 fields). Default 200 truncates at ~2 matches.
    const tokenBudget = Math.max(400, derivableIds.length * 100);
    const raw = await callAI(aiConfig, prompt, tokenBudget);
    console.log('[Situation] AI raw response (first 500):', raw?.slice(0, 500));
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed: Array<{ id: string; momentum: string; bridge: string; opportunity: string }> = JSON.parse(cleaned);
    console.log('[Situation] Parsed', parsed.length, 'items');

    for (const item of parsed) {
      const existing = result.get(item.id);
      if (existing) {
        result.set(item.id, {
          momentum: (item.momentum || '').trim(),
          bridge: (item.bridge || '').trim(),
          opportunity: (item.opportunity || '').trim(),
          urgency: existing.urgency,
          fitLevel: existing.fitLevel,
        });
      }
    }
  } catch (err) {
    console.error('[Situation] Batch AI call failed, falling back:', err);
    // Fallback: use framing as momentum where available
    for (const m of matches) {
      const existing = result.get(m.evalId);
      if (existing && m.framing) {
        result.set(m.evalId, {
          ...existing,
          momentum: m.framing,
        });
      }
    }
  }

  return result;
}
