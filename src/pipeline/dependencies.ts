/**
 * PIPELINE DEPENDENCIES
 *
 * Wires pipeline to existing services:
 * - AI matching (AIService)
 * - Cache (Supabase)
 * - Validation (Anymail)
 * - Enrichment (Apollo + Anymail)
 * - Intro generation (AIService)
 * - Send (Instantly)
 */

import type {
  RawInput,
  MatchResult,
  CacheEntry,
  ValidationResult,
  EnrichmentResult,
  Intro,
  SendResult,
  PipelineItem,
  PipelineDependencies,
} from './contract';
import { supabase } from '../lib/supabase';
import { composeIntro } from '../copy/introDoctrine';

// =============================================================================
// TYPES FROM EXISTING SERVICES
// =============================================================================

interface AIConfig {
  provider: 'openai' | 'azure' | 'anthropic';
  apiKey: string;
  endpoint?: string;
  deploymentId?: string;
}

interface EnrichmentConfig {
  apolloApiKey?: string;
  anymailFinderApiKey?: string;
}

interface InstantlyConfig {
  apiKey: string;
  demandCampaignId: string;
  supplyCampaignId: string;
}

// =============================================================================
// AI MATCHING
// =============================================================================

export function createAIMatchFn(aiConfig: AIConfig | null) {
  return async (demand: RawInput, supply: RawInput): Promise<MatchResult | null> => {
    if (!aiConfig?.apiKey) {
      // Fallback: simple domain-based matching
      if (!demand.domain || !supply.domain) return null;
      return {
        demandId: demand.id,
        supplyId: supply.id,
        confidence: 0.5,
        reason: `${demand.companyName || demand.domain} → ${supply.companyName || supply.domain}`,
      };
    }

    try {
      // Call AI to determine match
      const prompt = `Analyze if there's a business match:

DEMAND:
- Company: ${demand.companyName || demand.domain}
- Signals: ${(demand.signals || []).join(', ') || 'none'}

SUPPLY:
- Company: ${supply.companyName || supply.domain}
- Capabilities: ${supply.title || 'unknown'}

Is there a match? If yes, explain why in one sentence.
Response format: { "match": true/false, "confidence": 0-1, "reason": "..." }`;

      const response = await callAI(aiConfig, prompt);
      const parsed = JSON.parse(response);

      if (!parsed.match) return null;

      return {
        demandId: demand.id,
        supplyId: supply.id,
        confidence: parsed.confidence || 0.7,
        reason: parsed.reason || `${demand.companyName} needs → ${supply.companyName} provides`,
      };
    } catch (err) {
      console.error('[Pipeline:match] AI error:', err);
      return null;
    }
  };
}

// =============================================================================
// CACHE (Supabase)
// =============================================================================

export function createCacheFn(userId: string | null) {
  return async (domain: string): Promise<CacheEntry | null> => {
    if (!domain || !userId) return null;

    try {
      const { data } = await supabase
        .from('enrichment_cache')
        .select('*')
        .eq('domain', domain)
        .single();

      if (!data) return null;

      return {
        id: data.id,
        domain: data.domain,
        email: data.email,
        name: data.name,
        title: data.title,
        validated: data.validated,
        enrichedAt: data.enriched_at,
        source: data.source,
      };
    } catch {
      return null;
    }
  };
}

export function createStoreFn(userId: string | null) {
  return async (entry: CacheEntry): Promise<void> => {
    if (!userId) return;

    try {
      await supabase
        .from('enrichment_cache')
        .upsert({
          id: entry.id,
          domain: entry.domain,
          email: entry.email,
          name: entry.name,
          title: entry.title,
          validated: entry.validated,
          enriched_at: entry.enrichedAt,
          source: entry.source,
          user_id: userId,
        }, { onConflict: 'domain,user_id' });
    } catch (err) {
      console.error('[Pipeline:store] Cache error:', err);
    }
  };
}

// =============================================================================
// VALIDATION (Anymail)
// =============================================================================

export function createValidateFn(anymailKey: string | null) {
  return async (email: string): Promise<ValidationResult> => {
    if (!anymailKey || !email) {
      return { email, valid: false, status: 'unknown' };
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anymail-finder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: anymailKey,
            email,
            action: 'validate',
          }),
        }
      );

      const data = await response.json();

      return {
        email,
        valid: data.valid === true,
        status: data.status || 'unknown',
      };
    } catch {
      return { email, valid: false, status: 'unknown' };
    }
  };
}

// =============================================================================
// ENRICHMENT (Apollo + Anymail fallback)
// =============================================================================

export function createEnrichFn(config: EnrichmentConfig) {
  return async (domain: string, name?: string): Promise<EnrichmentResult> => {
    // Try Apollo first
    if (config.apolloApiKey) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apollo-enrichment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.apolloApiKey,
              domain,
              name,
            }),
          }
        );

        const data = await response.json();

        if (data.email) {
          return {
            success: true,
            email: data.email,
            name: data.name || name,
            title: data.title,
            linkedin: data.linkedin,
            source: 'apollo',
            endpoint: 'person',
          };
        }
      } catch (err) {
        console.error('[Pipeline:enrich] Apollo error:', err);
      }
    }

    // Fallback to Anymail
    if (config.anymailFinderApiKey) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anymail-finder`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.anymailFinderApiKey,
              domain,
              action: 'find',
            }),
          }
        );

        const data = await response.json();

        if (data.email) {
          return {
            success: true,
            email: data.email,
            name: data.name || name,
            title: data.title,
            source: 'anymail',
            endpoint: 'company_emails',
          };
        }
      } catch (err) {
        console.error('[Pipeline:enrich] Anymail error:', err);
      }
    }

    return {
      success: false,
      source: 'apollo',
      endpoint: 'person',
    };
  };
}

// =============================================================================
// INTRO GENERATION (AI)
// =============================================================================

export function createIntroFn(aiConfig: AIConfig | null) {
  return async (demand: RawInput, supply: RawInput, match: MatchResult): Promise<Intro> => {
    const demandName = demand.companyName || demand.domain || 'Company';
    const supplyName = supply.companyName || supply.domain || 'Provider';
    const signals = (demand.signals || []).join(', ') || 'showing activity';

    if (!aiConfig?.apiKey) {
      // PHASE 6: Route fallbacks through introDoctrine
      return {
        demandId: demand.id,
        supplyId: supply.id,
        demandIntro: composeIntro({ side: 'demand', mode: 'b2b_general', ctx: { firstName: demandName, company: demand.companyName || demand.domain || 'your company' } }),
        supplyIntro: composeIntro({ side: 'supply', mode: 'b2b_general', ctx: { firstName: supplyName, company: demand.companyName || demand.domain || 'a company' } }),
        matchContext: match.reason,
      };
    }

    try {
      const prompt = `Generate two short email intros (2 sentences max each):

1. DEMAND INTRO (to ${demandName}):
They are ${signals}. Write a casual, helpful opener.

2. SUPPLY INTRO (to ${supplyName}):
There's a company ${signals}. Write a casual intro connecting them.

Response format: { "demandIntro": "...", "supplyIntro": "..." }`;

      const response = await callAI(aiConfig, prompt);
      const parsed = JSON.parse(response);

      // PHASE 6: Use doctrine fallbacks if AI output missing
      const doctrineDemand = composeIntro({ side: 'demand', mode: 'b2b_general', ctx: { firstName: demandName, company: demand.companyName || demand.domain || 'your company' } });
      const doctrineSupply = composeIntro({ side: 'supply', mode: 'b2b_general', ctx: { firstName: supplyName, company: demand.companyName || demand.domain || 'a company' } });

      return {
        demandId: demand.id,
        supplyId: supply.id,
        demandIntro: parsed.demandIntro || doctrineDemand,
        supplyIntro: parsed.supplyIntro || doctrineSupply,
        matchContext: match.reason,
      };
    } catch {
      // PHASE 6: Route through introDoctrine on error
      return {
        demandId: demand.id,
        supplyId: supply.id,
        demandIntro: composeIntro({ side: 'demand', mode: 'b2b_general', ctx: { firstName: demandName, company: demand.companyName || demand.domain || 'your company' } }),
        supplyIntro: composeIntro({ side: 'supply', mode: 'b2b_general', ctx: { firstName: supplyName, company: demand.companyName || demand.domain || 'a company' } }),
        matchContext: match.reason,
      };
    }
  };
}

// =============================================================================
// SEND (Instantly)
// =============================================================================

export function createSendFn(config: InstantlyConfig | null) {
  return async (item: PipelineItem): Promise<SendResult> => {
    if (!config?.apiKey) {
      return {
        demandId: item.demand.id,
        supplyId: item.supply.id,
        demandSent: false,
        supplySent: false,
        error: 'Instantly not configured',
      };
    }

    const demandEmail = item.demandEnrichment?.email || item.demandCache?.email || item.demand.email;
    const supplyEmail = item.supplyEnrichment?.email || item.supplyCache?.email || item.supply.email;

    let demandSent = false;
    let supplySent = false;
    let error: string | undefined;

    // Send demand
    if (demandEmail && config.demandCampaignId) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instantly-proxy`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.apiKey,
              campaignId: config.demandCampaignId,
              action: 'add_lead',
              lead: {
                email: demandEmail,
                firstName: item.demand.name?.split(' ')[0] || '',
                lastName: item.demand.name?.split(' ').slice(1).join(' ') || '',
                companyName: item.demand.companyName,
                personalization: item.intro?.demandIntro || '',
              },
            }),
          }
        );

        if (response.ok) {
          demandSent = true;
        } else {
          const data = await response.json();
          error = data.error || 'Demand send failed';
        }
      } catch (err) {
        error = 'Demand send error';
      }
    }

    // Send supply
    if (supplyEmail && config.supplyCampaignId) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instantly-proxy`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: config.apiKey,
              campaignId: config.supplyCampaignId,
              action: 'add_lead',
              lead: {
                email: supplyEmail,
                firstName: item.supply.name?.split(' ')[0] || '',
                lastName: item.supply.name?.split(' ').slice(1).join(' ') || '',
                companyName: item.supply.companyName,
                personalization: item.intro?.supplyIntro || '',
              },
            }),
          }
        );

        if (response.ok) {
          supplySent = true;
        } else {
          const data = await response.json();
          error = error ? `${error}; ${data.error}` : data.error;
        }
      } catch (err) {
        error = error ? `${error}; Supply send error` : 'Supply send error';
      }
    }

    return {
      demandId: item.demand.id,
      supplyId: item.supply.id,
      demandSent,
      supplySent,
      demandCampaignId: config.demandCampaignId,
      supplyCampaignId: config.supplyCampaignId,
      error,
    };
  };
}

// =============================================================================
// HELPER: Call AI
// =============================================================================

async function callAI(config: AIConfig, prompt: string): Promise<string> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        deploymentId: config.deploymentId,
        prompt,
      }),
    }
  );

  const data = await response.json();
  return data.response || data.text || '';
}

// =============================================================================
// CREATE ALL DEPENDENCIES
// =============================================================================

export interface PipelineConfig {
  aiConfig: AIConfig | null;
  enrichmentConfig: EnrichmentConfig;
  instantlyConfig: InstantlyConfig | null;
  userId: string | null;
}

export function createPipelineDependencies(config: PipelineConfig): PipelineDependencies {
  return {
    matchFn: createAIMatchFn(config.aiConfig),
    getCacheFn: createCacheFn(config.userId),
    validateFn: createValidateFn(config.enrichmentConfig.anymailFinderApiKey || null),
    enrichFn: createEnrichFn(config.enrichmentConfig),
    storeFn: createStoreFn(config.userId),
    introFn: createIntroFn(config.aiConfig),
    sendFn: createSendFn(config.instantlyConfig),
  };
}
