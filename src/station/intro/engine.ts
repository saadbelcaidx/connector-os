/**
 * Intro Builder — Core Template Engine
 *
 * 5 core functions + batch generation.
 * Built-in vars resolve deterministically (no AI call).
 * AI vars use callAI() from IntroAI.ts.
 */

import type { TemplateVariable, IntroTemplate, PairContext, GeneratedIntro } from './types';
import { callAI, type IntroAIConfig } from '../../services/IntroAI';

// =============================================================================
// HELPERS (reused from IntroAI.ts patterns)
// =============================================================================

export function cleanCompanyName(name: string): string {
  if (!name) return name;
  let cleaned = name.trim();

  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  const isAllCaps = lettersOnly.length > 3 && uppercaseCount / lettersOnly.length > 0.8;

  if (isAllCaps) {
    const acronyms = new Set(['LP', 'LLC', 'LLP', 'GP', 'INC', 'CORP', 'LTD', 'CO', 'USA', 'UK', 'AI', 'ML', 'IT', 'HR', 'VP', 'CEO', 'CFO', 'CTO', 'COO', 'RIA', 'PE', 'VC']);
    cleaned = cleaned
      .toLowerCase()
      .split(/(\s+)/)
      .map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  cleaned = cleaned.replace(/,?\s*(llc|l\.l\.c\.|inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i, '').trim();
  return cleaned;
}

export function extractFirstName(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'there';
  const stripped = trimmed.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s+/i, '');
  return stripped.split(/\s+/)[0] || trimmed;
}

export function aOrAn(word: string): string {
  if (!word) return 'a';
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

// =============================================================================
// 1. EXTRACT PLACEHOLDERS
// =============================================================================

export function extractPlaceholders(body: string): string[] {
  const matches = body.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  const keys = matches.map(m => m.slice(2, -2).trim());
  return [...new Set(keys)];
}

// =============================================================================
// 2. BUILD AI PROMPT
// =============================================================================

export function buildAIPrompt(vars: TemplateVariable[], ctx: PairContext): string {
  const aiVars = vars.filter(v => !v.builtIn && v.instruction);
  if (aiVars.length === 0) return '';

  const varInstructions = aiVars.map(v =>
    `"${v.key}": ${v.instruction} (fallback: "${v.fallback}")`
  ).join('\n');

  return `Fill these variables. Return JSON only.

VARIABLES:
${varInstructions}

SITUATION:
Momentum: ${ctx.situation.momentum || 'unknown'}
Bridge: ${ctx.situation.bridge || 'unknown'}
Opportunity: ${ctx.situation.opportunity || 'unknown'}

MATCH FRAMING: ${ctx.match.framing || 'none'}
MATCH REASONING: ${ctx.match.reasoning || 'none'}

Return ONLY:
{${aiVars.map(v => `"${v.key}": ""`).join(', ')}}`;
}

// =============================================================================
// 3. PARSE AND FALLBACK
// =============================================================================

export function parseAndFallback(raw: string, vars: TemplateVariable[]): Record<string, string> {
  const result: Record<string, string> = {};

  // Initialize with fallbacks
  for (const v of vars) {
    result[v.key] = v.fallback;
  }

  if (!raw) return result;

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    for (const v of vars) {
      if (parsed[v.key] && typeof parsed[v.key] === 'string' && parsed[v.key].trim()) {
        result[v.key] = parsed[v.key].trim();
      }
    }
  } catch {
    console.warn('[IntroEngine] JSON parse failed, using fallbacks');
  }

  return result;
}

// =============================================================================
// 4. INTERPOLATE
// =============================================================================

export function interpolate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    return vars[trimmed] ?? `{{${trimmed}}}`;
  });
}

// =============================================================================
// 5. RESOLVE VARIABLES
// =============================================================================

/** Hard whitelist. If a key isn't here, it cannot resolve. */
const ALLOWED_TEMPLATE_VARS = new Set([
  // Identity (proper nouns)
  'supply.firstName', 'supply.company',
  'demand.firstName', 'demand.company',
  'article',
  // Situation (relational)
  'momentum', 'bridge', 'opportunity',
  // Backward compat (all resolve from Situation)
  'supply.offers', 'demand.wants', 'demand.whyNow',
  'signalObservation', 'painTheySolve',
]);

/** Built-in resolvers — deterministic, no AI call needed */
const BUILTIN_RESOLVERS: Record<string, (ctx: PairContext) => string> = {
  // Identity (proper nouns only)
  'demand.firstName': (ctx) => ctx.demand.firstName || 'there',
  'demand.company': (ctx) => ctx.demand.company,
  'supply.firstName': (ctx) => ctx.supply.firstName || 'there',
  'supply.company': (ctx) => ctx.supply.company,
  'article': (ctx) => aOrAn(ctx.supply.company),

  // Situation (relational)
  'momentum': (ctx) => ctx.situation.momentum,
  'bridge': (ctx) => ctx.situation.bridge,
  'opportunity': (ctx) => ctx.situation.opportunity,

  // Backward compat — resolve from Situation, never from canonicals
  'supply.offers': (ctx) => ctx.situation.bridge || 'their expertise',
  'demand.wants': (ctx) => ctx.situation.bridge || 'what they need',
  'demand.whyNow': (ctx) => ctx.situation.momentum || 'timing is right',
  'signalObservation': (ctx) => ctx.situation.momentum || 'making moves',
  'painTheySolve': (ctx) => ctx.situation.bridge || 'what they need right now',
};

export async function resolveVariables(
  template: IntroTemplate,
  context: PairContext,
  aiConfig: IntroAIConfig | null,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  // Step 1: Resolve built-in vars deterministically
  console.log('[IntroEngine] resolveVariables — template vars:', template.variables.map(v => ({ key: v.key, builtIn: v.builtIn })));
  console.log('[IntroEngine] context.situation:', JSON.stringify(context.situation));
  for (const v of template.variables) {
    // Whitelist enforcement: block vars that aren't allowed
    if (!ALLOWED_TEMPLATE_VARS.has(v.key) && !v.instruction) {
      console.warn(`[IntroEngine] BLOCKED: "${v.key}" is not a whitelisted variable`);
      continue;
    }
    if (BUILTIN_RESOLVERS[v.key]) {
      const val = BUILTIN_RESOLVERS[v.key](context);
      console.log(`[IntroEngine] RESOLVED: ${v.key} = "${val}"`);
      resolved[v.key] = val;
    }
  }

  // Step 2: Resolve AI vars
  const aiVars = template.variables.filter(v => !v.builtIn && v.instruction);

  if (aiVars.length > 0 && aiConfig) {
    const prompt = buildAIPrompt(aiVars, context);
    try {
      const raw = await callAI(aiConfig, prompt);
      const aiResults = parseAndFallback(raw, aiVars);
      Object.assign(resolved, aiResults);
    } catch (err) {
      console.error('[IntroEngine] AI call failed, using fallbacks:', err);
      for (const v of aiVars) {
        resolved[v.key] = v.fallback;
      }
    }
  } else {
    // No AI config — use fallbacks
    for (const v of template.variables) {
      if (!v.builtIn && !(v.key in resolved)) {
        resolved[v.key] = v.fallback;
      }
    }
  }

  return resolved;
}

// =============================================================================
// 6. BATCH GENERATION
// =============================================================================

export async function generateIntrosBatch(
  template: IntroTemplate,
  pairs: { evalId: string; context: PairContext }[],
  aiConfig: IntroAIConfig | null,
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void,
): Promise<GeneratedIntro[]> {
  const results: GeneratedIntro[] = new Array(pairs.length);
  let completed = 0;

  for (let i = 0; i < pairs.length; i += concurrency) {
    const chunk = pairs.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map(async (pair, idx) => {
        try {
          const vars = await resolveVariables(template, pair.context, aiConfig);
          const supplyIntro = interpolate(template.supplyBody, vars);
          const demandIntro = interpolate(template.demandBody, vars);
          return {
            index: i + idx,
            result: {
              evalId: pair.evalId,
              supplyIntro,
              demandIntro,
              variables: vars,
            } as GeneratedIntro,
          };
        } catch (err) {
          console.error(`[IntroEngine] Failed for ${pair.evalId}:`, err);
          return {
            index: i + idx,
            result: {
              evalId: pair.evalId,
              supplyIntro: '',
              demandIntro: '',
              variables: {},
              error: err instanceof Error ? err.message : 'Generation failed',
            } as GeneratedIntro,
          };
        }
      }),
    );

    for (const { index, result } of chunkResults) {
      results[index] = result;
      completed++;
      onProgress?.(completed, pairs.length);
    }
  }

  return results;
}
