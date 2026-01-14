/**
 * INTRO GENERATOR — PHASE 4 CANONICALIZED
 *
 * This file is now a thin orchestrator consuming introDoctrine.ts.
 * NO prompts defined here. NO templates defined here. NO examples defined here.
 *
 * All intro generation flows through canonical doctrine.
 */

import type { AIConfig } from './AIService';
import type { NormalizedRecord } from '../schemas';
import {
  buildCanonicalPrompt,
  validateIntro,
  composeIntro,
  ConnectorMode,
  IntroSide,
  IntroContext,
} from '../copy/introDoctrine';

// =============================================================================
// TYPES
// =============================================================================

interface DemandContext {
  firstName: string;
  company: string;
  signal: string;
  // Rich context - all available data
  companyDescription: string | null;
  companyFunding: string | null;
  companyRevenue: string | null;
  industry: string | null;
  size: string | null;
  headline: string | null;
  signalDetail: string | null;
  city: string | null;
  country: string | null;
  seniorityLevel: string | null;
  // Enriched contact info (from Apollo)
  contactTitle: string | null;
  // Role count (if multiple roles at same company)
  roleCount: number;
  // Operator-written pre-signal context (optional, never fabricated)
  preSignalContext?: string;
  // CANONICAL: Connector mode for mode-specific language
  connectorMode?: string;
  // Wellfound data presence flag
  hasWellfoundData?: boolean;
  // COS (Connector Overlap Statement) — relational copy from matching
  connectorOverlap?: string;
  supplyRole?: string;
}

interface SupplyContext {
  firstName: string;
  exampleCompany: string;
  commonSignal: string;
  matchCount: number;
  // Rich context - supply side data
  supplierCompany: string;
  supplierTitle: string | null;
  supplierHeadline: string | null;
  supplierIndustry: string | null;
  // Rich context - demand company data (the example company)
  demandCompanyStage: string | null;
  demandCompanyIndustry: string | null;
  demandCompanyFunding: string | null;
  demandRoleCount: number;
  demandDecisionMakerTitle: string | null;
  demandSpecificSignal: string | null;
  // CANONICAL: Presignal and mode enforcement
  preSignalContext?: string;
  connectorMode?: string;
  // Wellfound data presence flag
  hasWellfoundData?: boolean;
  // COS (Connector Overlap Statement) — relational copy from matching
  connectorOverlap?: string;
  supplyRole?: string;
}

interface IntroResult {
  intro: string;
  validated: boolean;
  regenerated: boolean;
  attempts: number;
}

// =============================================================================
// AI PROXY
// =============================================================================

async function callAI(config: AIConfig, prompt: string, maxTokens: number = 200): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const proxyUrl = `${supabaseUrl}/functions/v1/ai-proxy`;

  const body: Record<string, unknown> = {
    provider: config.provider,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  if (config.provider === 'azure') {
    body.azureEndpoint = config.endpoint;
    body.azureApiKey = config.apiKey;
    body.azureDeployment = config.deployment || config.model;
  } else if (config.provider === 'openai') {
    body.openaiApiKey = config.apiKey;
    body.model = config.model || 'gpt-4o-mini';
  } else if (config.provider === 'anthropic') {
    body.anthropicApiKey = config.apiKey;
    body.model = config.model || 'claude-3-haiku-20240307';
  }

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AI proxy failed: ${response.status}`);
  }

  const data = await response.json();
  return data.content || '';
}

// =============================================================================
// CANONICAL FALLBACK — Routes through introDoctrine
// =============================================================================

function canonicalFallback(side: IntroSide, ctx: DemandContext | SupplyContext): string {
  const introCtx: IntroContext = {
    firstName: ctx.firstName || 'there',
    company: side === 'demand' ? (ctx as DemandContext).company : (ctx as SupplyContext).exampleCompany,
    contactTitle: side === 'demand' ? (ctx as DemandContext).contactTitle || undefined : undefined,
    preSignalContext: ctx.preSignalContext,
    hasWellfoundData: ctx.hasWellfoundData,
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap: ctx.connectorOverlap,
    supplyRole: ctx.supplyRole,
  };

  return composeIntro({
    side,
    mode: (ctx.connectorMode as ConnectorMode) || 'b2b_general',
    ctx: introCtx,
  });
}

// =============================================================================
// DEMAND INTRO GENERATOR — PHASE 4: Thin Orchestrator
// =============================================================================

export async function generateDemandIntro(
  config: AIConfig | null,
  ctx: DemandContext
): Promise<IntroResult> {
  // Gate 1: AI not configured — use canonical fallback
  if (!config?.enabled || !config.apiKey) {
    return {
      intro: canonicalFallback('demand', ctx),
      validated: true,
      regenerated: false,
      attempts: 1,
    };
  }

  // Build canonical context for prompt
  const introCtx: IntroContext = {
    firstName: ctx.firstName || 'there',
    company: ctx.company || 'a company',
    contactTitle: ctx.contactTitle || undefined,
    preSignalContext: ctx.preSignalContext,
    hasWellfoundData: ctx.hasWellfoundData,
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap: ctx.connectorOverlap,
    supplyRole: ctx.supplyRole,
  };

  // PHASE 4: Use canonical prompt from introDoctrine
  const prompt = buildCanonicalPrompt({
    side: 'demand',
    ctx: introCtx,
    mode: (ctx.connectorMode as ConnectorMode) || 'b2b_general',
  });

  let intro = '';
  let attempts = 0;
  let validated = false;

  // Try up to 3 times
  while (attempts < 3 && !validated) {
    attempts++;
    try {
      intro = (await callAI(config, prompt)).trim().replace(/^["']|["']$/g, '');

      // PHASE 4: Validate AI output against doctrine
      const validation = validateIntro(intro, introCtx);
      if (validation.valid) {
        validated = true;
      } else {
        console.warn(`[IntroGenerator] Demand intro failed validation (attempt ${attempts}):`, validation.reason);
        if (attempts < 3) {
          intro = '';
        }
      }
    } catch (err) {
      console.error(`[IntroGenerator] Demand intro generation failed (attempt ${attempts}):`, err);
    }
  }

  // If all attempts failed, use canonical fallback
  if (!intro || !validated) {
    return {
      intro: canonicalFallback('demand', ctx),
      validated: true,
      regenerated: attempts > 1,
      attempts,
    };
  }

  return { intro, validated: true, regenerated: attempts > 1, attempts };
}

// =============================================================================
// SUPPLY INTRO GENERATOR — PHASE 4: Thin Orchestrator
// =============================================================================

export async function generateSupplyIntro(
  config: AIConfig | null,
  ctx: SupplyContext
): Promise<IntroResult> {
  // Gate 1: AI not configured — use canonical fallback
  if (!config?.enabled || !config.apiKey) {
    return {
      intro: canonicalFallback('supply', ctx),
      validated: true,
      regenerated: false,
      attempts: 1,
    };
  }

  // Build canonical context for prompt
  const introCtx: IntroContext = {
    firstName: ctx.firstName || 'there',
    company: ctx.exampleCompany || 'a company',
    preSignalContext: ctx.preSignalContext,
    hasWellfoundData: ctx.hasWellfoundData,
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap: ctx.connectorOverlap,
    supplyRole: ctx.supplyRole,
  };

  // PHASE 4: Use canonical prompt from introDoctrine
  const prompt = buildCanonicalPrompt({
    side: 'supply',
    ctx: introCtx,
    mode: (ctx.connectorMode as ConnectorMode) || 'b2b_general',
  });

  let intro = '';
  let attempts = 0;
  let validated = false;

  // Try up to 3 times
  while (attempts < 3 && !validated) {
    attempts++;
    try {
      intro = (await callAI(config, prompt)).trim().replace(/^["']|["']$/g, '');

      // PHASE 4: Validate AI output against doctrine
      const validation = validateIntro(intro, introCtx);
      if (validation.valid) {
        validated = true;
      } else {
        console.warn(`[IntroGenerator] Supply intro failed validation (attempt ${attempts}):`, validation.reason);
        if (attempts < 3) {
          intro = '';
        }
      }
    } catch (err) {
      console.error(`[IntroGenerator] Supply intro generation failed (attempt ${attempts}):`, err);
    }
  }

  // If all attempts failed, use canonical fallback
  if (!intro || !validated) {
    return {
      intro: canonicalFallback('supply', ctx),
      validated: true,
      regenerated: attempts > 1,
      attempts,
    };
  }

  return { intro, validated: true, regenerated: attempts > 1, attempts };
}

// =============================================================================
// HELPER: Build context from NormalizedRecord
// =============================================================================

/**
 * Build rich demand context for intro generation.
 * PHASE 4: No timing defaults, context only.
 */
export function buildDemandContext(
  record: NormalizedRecord,
  enrichedFirstName?: string,
  enrichedTitle?: string,
  roleCount: number = 1,
  preSignalContext?: string,
  connectorMode?: string,
  hasWellfoundData?: boolean,
  connectorOverlap?: string,
  supplyRole?: string
): DemandContext {
  return {
    firstName: enrichedFirstName || record.firstName,
    company: record.company,
    signal: record.signal || '',
    companyDescription: record.companyDescription,
    companyFunding: record.companyFunding,
    companyRevenue: record.companyRevenue,
    industry: Array.isArray(record.industry) ? record.industry[0] : record.industry,
    size: Array.isArray(record.size) ? record.size[0] : record.size,
    headline: record.headline,
    signalDetail: record.signalDetail,
    city: record.city,
    country: record.country,
    seniorityLevel: record.seniorityLevel,
    contactTitle: enrichedTitle || null,
    roleCount,
    preSignalContext,
    connectorMode,
    hasWellfoundData,
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap,
    supplyRole,
  };
}

export function buildSupplyContext(
  supplyRecord: NormalizedRecord,
  exampleDemandCompany: string,
  commonSignal: string,
  matchCount: number,
  enrichedFirstName?: string,
  demandRecord?: NormalizedRecord | null,
  demandEnrichedTitle?: string | null,
  demandRoleCount?: number,
  preSignalContext?: string,
  connectorMode?: string,
  hasWellfoundData?: boolean,
  connectorOverlap?: string,
  supplyRole?: string
): SupplyContext {
  return {
    firstName: enrichedFirstName || supplyRecord.firstName,
    exampleCompany: exampleDemandCompany,
    commonSignal,
    matchCount,
    supplierCompany: supplyRecord.company,
    supplierTitle: supplyRecord.title,
    supplierHeadline: supplyRecord.headline,
    supplierIndustry: Array.isArray(supplyRecord.industry) ? supplyRecord.industry[0] : supplyRecord.industry,
    demandCompanyStage: demandRecord?.companyFunding ? extractCompanyStage(demandRecord.companyFunding) : null,
    demandCompanyIndustry: demandRecord?.industry
      ? (Array.isArray(demandRecord.industry) ? demandRecord.industry[0] : demandRecord.industry)
      : null,
    demandCompanyFunding: demandRecord?.companyFunding ? extractFundingSignal(demandRecord.companyFunding) : null,
    demandRoleCount: demandRoleCount || 1,
    demandDecisionMakerTitle: demandEnrichedTitle || null,
    demandSpecificSignal: demandRecord?.signal || null,
    preSignalContext,
    connectorMode,
    hasWellfoundData,
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap,
    supplyRole,
  };
}

// =============================================================================
// HELPER: Stage/Funding extraction (data only, no generation logic)
// =============================================================================

function extractCompanyStage(funding: string): string | null {
  if (!funding) return null;
  const lower = funding.toLowerCase();

  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('series d')) return 'Series D';
  if (lower.includes('series e')) return 'Series E';
  if (lower.includes('series f')) return 'Series F';
  if (lower.includes('seed')) return 'Seed';
  if (lower.includes('ipo') || lower.includes('public')) return 'Public';

  return null;
}

function extractFundingSignal(funding: string): string | null {
  if (!funding) return null;

  const amountMatch = funding.match(/\$[\d,.]+\s*[MBK]?/i);
  if (amountMatch) {
    return `just raised ${amountMatch[0]}`;
  }

  return null;
}
