/**
 * SignalIntelligence - Pre-computed semantic understanding of signals
 *
 * Purpose:
 * - AI runs ONCE when signal is ingested (not at match time)
 * - Results cached in database
 * - Matching uses cached intelligence (no AI calls)
 *
 * Works for any niche:
 * - Hiring companies ↔ Recruiters
 * - Wealth management ↔ HNW individuals
 * - Biotech ↔ Pharma partners
 * - Any demand ↔ supply pairing
 */

import { supabase } from '../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Pre-computed intelligence for a DEMAND signal
 * (company/entity with a need)
 */
export interface DemandIntelligence {
  domain: string;
  companyName: string;

  // What they actually need (semantic understanding)
  needSummary: string;           // "Scaling engineering team for ML infrastructure"
  needCategory: string;          // "engineering" | "sales" | "marketing" | etc.
  needSpecificity: 'high' | 'medium' | 'low';  // How clear/specific is the need

  // Intent signals
  urgencyLevel: 'high' | 'medium' | 'low';
  intentSignals: string[];       // ["multiple roles", "senior hires", "fast growth"]

  // Context
  companyContext: string;        // "Series B fintech, 50-200 employees, NYC"
  idealProviderProfile: string;  // "Recruiter specializing in ML/AI at growth-stage"

  // Matching hints
  keywords: string[];            // Extracted keywords for matching
  antiKeywords: string[];        // What they're NOT looking for

  // Metadata
  analyzedAt: string;
  signalCount: number;
  confidence: number;            // 0-1 confidence in analysis
}

/**
 * Pre-computed intelligence for a SUPPLY entity
 * (provider who can fulfill needs)
 */
export interface SupplyIntelligence {
  domain: string;
  companyName: string;

  // What they actually do (semantic understanding)
  capabilitySummary: string;     // "Places senior ML engineers at Series A-C startups"
  serviceCategory: string;       // "recruiting" | "consulting" | "agency" | etc.
  specialization: string;        // Their specific niche/differentiator

  // Who they serve best
  idealClientProfile: string;    // "Growth-stage tech companies hiring engineers"
  clientStage: string[];         // ["seed", "series-a", "series-b"]
  clientIndustries: string[];    // ["fintech", "saas", "healthtech"]

  // Capacity/fit signals
  capacityLevel: 'high' | 'medium' | 'low';
  geographyServed: string[];

  // Matching hints
  keywords: string[];
  antiKeywords: string[];        // What they DON'T do

  // Metadata
  analyzedAt: string;
  confidence: number;
}

/**
 * Match quality assessment (computed from intelligence comparison)
 */
export interface IntelligentMatch {
  demandDomain: string;
  supplyDomain: string;

  // Match quality
  matchScore: number;            // 0-100
  matchReason: string;           // Human-readable explanation
  matchType: 'exact' | 'related' | 'weak';

  // Breakdown
  needsAlignment: number;        // How well supply meets demand needs
  specificityFit: number;        // Specificity match
  contextFit: number;            // Company stage, industry, geography fit

  // Warnings
  warnings: string[];            // Potential issues with this match
}

// =============================================================================
// ANALYSIS PROMPTS
// =============================================================================

const DEMAND_ANALYSIS_PROMPT = `Analyze this company's hiring/need signals and extract structured intelligence.

SIGNALS:
{signals}

COMPANY: {companyName}
DOMAIN: {domain}

Extract:
1. needSummary: One sentence describing what they actually need (be specific, not generic)
2. needCategory: Primary category (engineering/sales/marketing/operations/finance/executive/other)
3. needSpecificity: How clear is the need? (high/medium/low)
4. urgencyLevel: How urgent based on signals? (high/medium/low)
5. intentSignals: List of signals indicating intent (e.g., "multiple roles", "senior hires")
6. companyContext: Brief context about the company
7. idealProviderProfile: What kind of provider would best serve this need
8. keywords: Key terms for matching
9. antiKeywords: What they're NOT looking for

Respond in JSON format only.`;

const SUPPLY_ANALYSIS_PROMPT = `Analyze this provider/company and extract structured intelligence about their capabilities.

PROFILE:
{profile}

COMPANY: {companyName}
DOMAIN: {domain}

Extract:
1. capabilitySummary: One sentence describing what they actually do (be specific)
2. serviceCategory: Primary category (recruiting/consulting/agency/saas/services/other)
3. specialization: Their specific niche or differentiator
4. idealClientProfile: What kind of client they serve best
5. clientStage: Company stages they work with (seed/series-a/series-b/growth/enterprise)
6. clientIndustries: Industries they specialize in
7. capacityLevel: Current capacity (high/medium/low)
8. geographyServed: Regions they serve
9. keywords: Key terms for matching
10. antiKeywords: What they DON'T do

Respond in JSON format only.`;

// =============================================================================
// STORAGE
// =============================================================================

/**
 * Check if we have cached intelligence for a domain
 */
export async function getCachedDemandIntelligence(
  domain: string,
  userId: string
): Promise<DemandIntelligence | null> {
  try {
    const { data, error } = await supabase
      .from('signal_intelligence')
      .select('*')
      .eq('domain', domain)
      .eq('user_id', userId)
      .eq('signal_type', 'demand')
      .maybeSingle();

    if (error || !data) return null;

    // Check if stale (older than 7 days)
    const analyzedAt = new Date(data.analyzed_at);
    const daysSinceAnalysis = (Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAnalysis > 7) return null;

    return data.intelligence as DemandIntelligence;
  } catch (err) {
    console.error('[SignalIntelligence] Error fetching cached demand:', err);
    return null;
  }
}

export async function getCachedSupplyIntelligence(
  domain: string,
  userId: string
): Promise<SupplyIntelligence | null> {
  try {
    const { data, error } = await supabase
      .from('signal_intelligence')
      .select('*')
      .eq('domain', domain)
      .eq('user_id', userId)
      .eq('signal_type', 'supply')
      .maybeSingle();

    if (error || !data) return null;

    const analyzedAt = new Date(data.analyzed_at);
    const daysSinceAnalysis = (Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAnalysis > 7) return null;

    return data.intelligence as SupplyIntelligence;
  } catch (err) {
    console.error('[SignalIntelligence] Error fetching cached supply:', err);
    return null;
  }
}

/**
 * Bulk load all cached demand intelligence for a user
 * Returns a map of domain -> DemandIntelligence
 */
export async function loadAllCachedDemandIntelligence(
  userId: string
): Promise<Record<string, DemandIntelligence>> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('signal_intelligence')
      .select('*')
      .eq('user_id', userId)
      .eq('signal_type', 'demand')
      .gte('analyzed_at', sevenDaysAgo);

    if (error || !data) {
      console.log('[SignalIntelligence] No cached intelligence found');
      return {};
    }

    const result: Record<string, DemandIntelligence> = {};
    for (const row of data) {
      result[row.domain] = row.intelligence as DemandIntelligence;
    }

    console.log(`[SignalIntelligence] Loaded ${Object.keys(result).length} cached entries`);
    return result;
  } catch (err) {
    console.error('[SignalIntelligence] Error loading cached intelligence:', err);
    return {};
  }
}

/**
 * Store intelligence in database
 */
export async function cacheDemandIntelligence(
  userId: string,
  intelligence: DemandIntelligence
): Promise<void> {
  try {
    await supabase
      .from('signal_intelligence')
      .upsert({
        user_id: userId,
        domain: intelligence.domain,
        signal_type: 'demand',
        intelligence: intelligence,
        analyzed_at: intelligence.analyzedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,domain,signal_type' });
  } catch (err) {
    console.error('[SignalIntelligence] Error caching demand:', err);
  }
}

export async function cacheSupplyIntelligence(
  userId: string,
  intelligence: SupplyIntelligence
): Promise<void> {
  try {
    await supabase
      .from('signal_intelligence')
      .upsert({
        user_id: userId,
        domain: intelligence.domain,
        signal_type: 'supply',
        intelligence: intelligence,
        analyzed_at: intelligence.analyzedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,domain,signal_type' });
  } catch (err) {
    console.error('[SignalIntelligence] Error caching supply:', err);
  }
}

// =============================================================================
// ANALYSIS (calls AI)
// =============================================================================

/**
 * Analyze demand signals using AI
 * Call this ONCE when signals are ingested, not at match time
 */
export async function analyzeDemandSignals(
  domain: string,
  companyName: string,
  signals: { title: string; raw?: any }[],
  aiConfig: { provider: string; apiKey: string; endpoint?: string }
): Promise<DemandIntelligence | null> {
  try {
    // Build signals text
    const signalsText = signals
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join('\n');

    const prompt = DEMAND_ANALYSIS_PROMPT
      .replace('{signals}', signalsText)
      .replace('{companyName}', companyName)
      .replace('{domain}', domain);

    // Call AI (using existing AI service pattern)
    const response = await callAI(prompt, aiConfig);
    if (!response) return null;

    // Parse response
    const parsed = parseJSONResponse(response);
    if (!parsed) return null;

    const intelligence: DemandIntelligence = {
      domain,
      companyName,
      needSummary: parsed.needSummary || `${companyName} has open positions`,
      needCategory: parsed.needCategory || 'other',
      needSpecificity: parsed.needSpecificity || 'medium',
      urgencyLevel: parsed.urgencyLevel || 'medium',
      intentSignals: parsed.intentSignals || [],
      companyContext: parsed.companyContext || '',
      idealProviderProfile: parsed.idealProviderProfile || '',
      keywords: parsed.keywords || [],
      antiKeywords: parsed.antiKeywords || [],
      analyzedAt: new Date().toISOString(),
      signalCount: signals.length,
      confidence: 0.8,
    };

    return intelligence;
  } catch (err) {
    console.error('[SignalIntelligence] Error analyzing demand:', err);
    return null;
  }
}

/**
 * Analyze supply entity using AI
 */
export async function analyzeSupplyEntity(
  domain: string,
  companyName: string,
  profile: { description?: string; services?: string[]; raw?: any },
  aiConfig: { provider: string; apiKey: string; endpoint?: string }
): Promise<SupplyIntelligence | null> {
  try {
    const profileText = [
      profile.description,
      profile.services?.join(', '),
      JSON.stringify(profile.raw || {}).slice(0, 500),
    ].filter(Boolean).join('\n');

    const prompt = SUPPLY_ANALYSIS_PROMPT
      .replace('{profile}', profileText)
      .replace('{companyName}', companyName)
      .replace('{domain}', domain);

    const response = await callAI(prompt, aiConfig);
    if (!response) return null;

    const parsed = parseJSONResponse(response);
    if (!parsed) return null;

    const intelligence: SupplyIntelligence = {
      domain,
      companyName,
      capabilitySummary: parsed.capabilitySummary || `${companyName} provides services`,
      serviceCategory: parsed.serviceCategory || 'services',
      specialization: parsed.specialization || '',
      idealClientProfile: parsed.idealClientProfile || '',
      clientStage: parsed.clientStage || [],
      clientIndustries: parsed.clientIndustries || [],
      capacityLevel: parsed.capacityLevel || 'medium',
      geographyServed: parsed.geographyServed || [],
      keywords: parsed.keywords || [],
      antiKeywords: parsed.antiKeywords || [],
      analyzedAt: new Date().toISOString(),
      confidence: 0.8,
    };

    return intelligence;
  } catch (err) {
    console.error('[SignalIntelligence] Error analyzing supply:', err);
    return null;
  }
}

// =============================================================================
// INTELLIGENT MATCHING
// =============================================================================

/**
 * Compare demand and supply intelligence to assess match quality
 * No AI calls - uses pre-computed intelligence
 */
export function assessMatch(
  demand: DemandIntelligence,
  supply: SupplyIntelligence
): IntelligentMatch {
  let score = 0;
  const warnings: string[] = [];

  // 1. Category alignment (40 points max)
  const categoryScore = scoreCategoryAlignment(demand.needCategory, supply.serviceCategory);
  score += categoryScore;

  // 2. Keyword overlap (30 points max)
  const keywordScore = scoreKeywordOverlap(demand.keywords, supply.keywords);
  score += keywordScore;

  // 3. Anti-keyword check (can reduce score)
  const antiKeywordPenalty = checkAntiKeywords(demand, supply);
  score -= antiKeywordPenalty;
  if (antiKeywordPenalty > 0) {
    warnings.push('Potential mismatch: some exclusions detected');
  }

  // 4. Specificity fit (15 points max)
  const specificityScore = scoreSpecificityFit(demand.needSpecificity, supply.specialization);
  score += specificityScore;

  // 5. Context fit (15 points max)
  const contextScore = scoreContextFit(demand.companyContext, supply.idealClientProfile);
  score += contextScore;

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine match type
  let matchType: 'exact' | 'related' | 'weak';
  if (score >= 70) matchType = 'exact';
  else if (score >= 45) matchType = 'related';
  else matchType = 'weak';

  // Generate reason
  const matchReason = generateMatchReason(demand, supply, matchType);

  return {
    demandDomain: demand.domain,
    supplyDomain: supply.domain,
    matchScore: score,
    matchReason,
    matchType,
    needsAlignment: categoryScore + keywordScore,
    specificityFit: specificityScore,
    contextFit: contextScore,
    warnings,
  };
}

// =============================================================================
// SCORING HELPERS
// =============================================================================

function scoreCategoryAlignment(demandCategory: string, supplyCategory: string): number {
  // Direct category mappings
  const alignmentMap: Record<string, string[]> = {
    engineering: ['recruiting', 'staffing', 'consulting', 'agency'],
    sales: ['recruiting', 'staffing', 'consulting', 'agency'],
    marketing: ['recruiting', 'agency', 'consulting'],
    operations: ['recruiting', 'consulting', 'services'],
    finance: ['recruiting', 'consulting', 'services'],
    executive: ['recruiting', 'executive-search', 'consulting'],
  };

  const demandLower = demandCategory.toLowerCase();
  const supplyLower = supplyCategory.toLowerCase();

  // Exact match of need to service type
  if (alignmentMap[demandLower]?.includes(supplyLower)) {
    return 40;
  }

  // Partial alignment
  if (supplyLower.includes('recruit') || supplyLower.includes('staffing')) {
    return 30; // Recruiters can serve many needs
  }

  if (supplyLower.includes('consult') || supplyLower.includes('agency')) {
    return 20; // Generic service providers
  }

  return 10; // Weak alignment
}

function scoreKeywordOverlap(demandKeywords: string[], supplyKeywords: string[]): number {
  if (!demandKeywords.length || !supplyKeywords.length) return 10;

  const demandSet = new Set(demandKeywords.map(k => k.toLowerCase()));
  const supplySet = new Set(supplyKeywords.map(k => k.toLowerCase()));

  let matches = 0;
  demandSet.forEach(k => {
    if (supplySet.has(k)) matches++;
    // Also check partial matches
    supplySet.forEach(sk => {
      if (sk.includes(k) || k.includes(sk)) matches += 0.5;
    });
  });

  const overlapRatio = matches / Math.max(demandSet.size, 1);
  return Math.min(30, Math.round(overlapRatio * 30));
}

function checkAntiKeywords(demand: DemandIntelligence, supply: SupplyIntelligence): number {
  let penalty = 0;

  // Check if supply's anti-keywords match demand's needs
  const demandLower = demand.needSummary.toLowerCase();
  for (const anti of supply.antiKeywords) {
    if (demandLower.includes(anti.toLowerCase())) {
      penalty += 10;
    }
  }

  // Check if demand's anti-keywords match supply's capabilities
  const supplyLower = supply.capabilitySummary.toLowerCase();
  for (const anti of demand.antiKeywords) {
    if (supplyLower.includes(anti.toLowerCase())) {
      penalty += 10;
    }
  }

  return Math.min(30, penalty);
}

function scoreSpecificityFit(needSpecificity: string, specialization: string): number {
  // High specificity need + specialized provider = good
  // Low specificity need = any provider works
  if (needSpecificity === 'high' && specialization && specialization.length > 10) {
    return 15;
  }
  if (needSpecificity === 'medium') {
    return 10;
  }
  return 5;
}

function scoreContextFit(companyContext: string, idealClientProfile: string): number {
  if (!companyContext || !idealClientProfile) return 5;

  const contextLower = companyContext.toLowerCase();
  const profileLower = idealClientProfile.toLowerCase();

  // Check for stage matches
  const stages = ['seed', 'series', 'growth', 'enterprise', 'startup'];
  let stageMatch = false;
  for (const stage of stages) {
    if (contextLower.includes(stage) && profileLower.includes(stage)) {
      stageMatch = true;
      break;
    }
  }

  // Check for industry matches
  const industries = ['tech', 'fintech', 'health', 'saas', 'b2b', 'enterprise'];
  let industryMatch = false;
  for (const ind of industries) {
    if (contextLower.includes(ind) && profileLower.includes(ind)) {
      industryMatch = true;
      break;
    }
  }

  let score = 5;
  if (stageMatch) score += 5;
  if (industryMatch) score += 5;

  return score;
}

function generateMatchReason(
  demand: DemandIntelligence,
  supply: SupplyIntelligence,
  matchType: 'exact' | 'related' | 'weak'
): string {
  if (matchType === 'exact') {
    return `${supply.companyName} specializes in exactly what ${demand.companyName} needs: ${demand.needSummary.toLowerCase()}`;
  }
  if (matchType === 'related') {
    return `${supply.companyName} serves similar needs to ${demand.companyName}'s requirements`;
  }
  return `${supply.companyName} may be able to help ${demand.companyName}`;
}

// =============================================================================
// AI CALL HELPER
// =============================================================================

async function callAI(
  prompt: string,
  config: { provider: string; apiKey: string; endpoint?: string }
): Promise<string | null> {
  try {
    // Build provider-specific payload
    const payload: Record<string, any> = {
      provider: config.provider,
      messages: [
        { role: 'system', content: 'You are an analyst extracting structured intelligence from business signals. Respond only in valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    };

    // Add provider-specific keys
    if (config.provider === 'openai') {
      payload.openaiApiKey = config.apiKey;
    } else if (config.provider === 'azure') {
      payload.azureApiKey = config.apiKey;
      payload.azureEndpoint = config.endpoint;
    } else if (config.provider === 'anthropic') {
      payload.anthropicApiKey = config.apiKey;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      console.error('[SignalIntelligence] AI call failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.content || data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[SignalIntelligence] AI call error:', err);
    return null;
  }
}

function parseJSONResponse(text: string): any {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}

// =============================================================================
// BATCH ANALYSIS
// =============================================================================

/**
 * Analyze multiple demand signals in batch (for background processing)
 */
export async function batchAnalyzeDemand(
  signals: { domain: string; companyName: string; items: { title: string; raw?: any }[] }[],
  userId: string,
  aiConfig: { provider: string; apiKey: string; endpoint?: string },
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];

    // Check cache first
    const cached = await getCachedDemandIntelligence(signal.domain, userId);
    if (cached) {
      success++;
      onProgress?.(i + 1, signals.length);
      continue;
    }

    // Analyze
    const intelligence = await analyzeDemandSignals(
      signal.domain,
      signal.companyName,
      signal.items,
      aiConfig
    );

    if (intelligence) {
      await cacheDemandIntelligence(userId, intelligence);
      success++;
    } else {
      failed++;
    }

    onProgress?.(i + 1, signals.length);

    // Rate limiting - don't hammer the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { success, failed };
}
