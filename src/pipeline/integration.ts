/**
 * PIPELINE INTEGRATION
 *
 * Bridges pipeline to MatchingEngineV3's UI state.
 * Stage 5: Pipeline is the system - no feature flags.
 *
 * This file maps pipeline outputs to existing state variables
 * so the UI renders identically.
 */

import { useCallback, useRef } from 'react';
import type { PipelineItem, PipelineStage, RawInput } from './contract';
import { runPipeline, getMetrics, PipelineDependencies, resetMetrics } from './orchestrator';
import { normalizeInput } from './adapter';
import { createPipelineDependencies, PipelineConfig } from './dependencies';
import {
  pipelineStageToUIState,
  pipelineItemToUIMatch,
  extractDemandContact,
  extractSupplyContact,
  calculateProgress,
  getReadyToRouteCount,
  UIVisualState,
} from './bridge';
import { itemize, createRawEnvelope } from './itemize';
import { deriveSchema, generateDraftMapping, logSchemaProfile, checkSchemaForBlocks, itemsToEntities } from './schema';
import { stageMatch, stageMatchDeterministic } from './match';
import { stageContactCompletion, isRoutable } from './contact';
import { stageIntroGeneration } from './intro';
// Domain discovery uses Apollo proxy directly (not these services)
// import { findDemandContact } from '../services/ApolloDemandEnrichmentService';
// import { findSupplyContact } from '../services/ApolloSupplyEnrichmentService';
import { verifyEmail, findDecisionMaker } from '../services/AnymailFinderService';
import { ssmVerifyEmail } from '../services/SSMVerifyService'; // SSM = verify only, not find
import { buildSnapshot, storeSnapshot, type PipelineRunSnapshot } from './snapshot';
import { snapshotToUIState } from './uiAdapter';
import {
  computeParityReport,
  logParityReport,
  trackParityRun,
  getParityStability,
  normalizeDomainForParity,
  type LegacyStageData,
  type PipelineStageData,
} from './parity';
import type { RawEnvelope, BlockReason, SchemaProfile, CanonicalEntity, ExecutionMode } from './types';

// =============================================================================
// Stage 5: Feature flags removed - pipeline is the system
// =============================================================================

// =============================================================================
// EXECUTION MODE DETECTION
// =============================================================================

/**
 * Determine execution mode based on entity completeness.
 *
 * MATCHING_ONLY: Both sides complete (all entities have domain + email)
 * ACTION: Either side needs enrichment (missing domain or email)
 *
 * APPLIES TO BOTH SUPPLY AND DEMAND.
 */
export function detectExecutionMode(
  demandEntities: CanonicalEntity[],
  supplyEntities: CanonicalEntity[]
): { mode: ExecutionMode; stats: { demandComplete: number; demandNeedsEnrich: number; supplyComplete: number; supplyNeedsEnrich: number } } {
  const demandComplete = demandEntities.filter(e => !e.needsEnrichment).length;
  const demandNeedsEnrich = demandEntities.filter(e => e.needsEnrichment).length;
  const supplyComplete = supplyEntities.filter(e => !e.needsEnrichment).length;
  const supplyNeedsEnrich = supplyEntities.filter(e => e.needsEnrichment).length;

  // If ANY entity on EITHER side needs enrichment → ACTION mode
  const mode: ExecutionMode = (demandNeedsEnrich > 0 || supplyNeedsEnrich > 0)
    ? 'ACTION'
    : 'MATCHING_ONLY';

  console.log('[Pipeline:Mode]', mode, {
    demandComplete,
    demandNeedsEnrich,
    supplyComplete,
    supplyNeedsEnrich,
  });

  return {
    mode,
    stats: { demandComplete, demandNeedsEnrich, supplyComplete, supplyNeedsEnrich },
  };
}

// =============================================================================
// ENRICHMENT STAGE (ACTION MODE ONLY)
// =============================================================================

// Get Supabase URL for Apollo proxy
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const APOLLO_PROXY_URL = `${SUPABASE_URL}/functions/v1/apollo-enrichment`;

/**
 * Discover domain from company name using Apollo organization search.
 * Returns domain if found, null otherwise.
 */
async function discoverDomainFromCompanyName(
  apolloApiKey: string,
  companyName: string
): Promise<{ domain: string; name?: string; email?: string; title?: string } | null> {
  try {
    console.log(`[Pipeline:DiscoverDomain] Searching for "${companyName}"`);

    // Use Apollo people search with organization_name (not domain)
    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'people_search',
        apiKey: apolloApiKey,
        organization_name: companyName,
        seniorities: ['c_suite', 'vp', 'director', 'manager'],
      }),
    });

    if (!response.ok) {
      console.error(`[Pipeline:DiscoverDomain] Apollo error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const people = data.people || [];

    if (people.length === 0) {
      console.log(`[Pipeline:DiscoverDomain] No people found for "${companyName}"`);
      return null;
    }

    // Get domain from first person's organization
    const firstPerson = people[0];
    const domain = firstPerson.organization?.primary_domain;

    if (!domain) {
      console.log(`[Pipeline:DiscoverDomain] No domain in organization for "${companyName}"`);
      return null;
    }

    console.log(`[Pipeline:DiscoverDomain] ✓ Found domain: ${domain}`);

    return {
      domain,
      name: firstPerson.name || `${firstPerson.first_name} ${firstPerson.last_name}`,
      email: firstPerson.email,
      title: firstPerson.title,
    };
  } catch (err) {
    console.error(`[Pipeline:DiscoverDomain] Error:`, err);
    return null;
  }
}

/**
 * Enrich entities that need it (no domain but have company name).
 * Uses Apollo to DISCOVER domain from company name, then get decision maker.
 * APPLIES TO BOTH SIDES.
 */
export async function stageEnrichment(
  entities: CanonicalEntity[],
  side: 'demand' | 'supply',
  apolloApiKey: string | undefined
): Promise<{ entities: CanonicalEntity[]; enriched: number; failed: number }> {
  if (!apolloApiKey) {
    console.log(`[Pipeline:Enrich:${side}] No Apollo API key, skipping enrichment`);
    return { entities, enriched: 0, failed: 0 };
  }

  const needsEnrichment = entities.filter(e => e.needsEnrichment);
  const alreadyComplete = entities.filter(e => !e.needsEnrichment);

  console.log(`[Pipeline:Enrich:${side}] Enriching ${needsEnrichment.length} entities (${alreadyComplete.length} already complete)`);

  let enriched = 0;
  let failed = 0;
  const enrichedEntities: CanonicalEntity[] = [...alreadyComplete];

  for (const entity of needsEnrichment) {
    const companyName = entity.company.name || '';

    try {
      // STEP 1: Discover domain from company name
      const discovered = await discoverDomainFromCompanyName(apolloApiKey, companyName);

      if (discovered && discovered.domain) {
        // STEP 2: Update entity with discovered data
        const updatedEntity: CanonicalEntity = {
          ...entity,
          company: {
            ...entity.company,
            domain: discovered.domain,
          },
          person: {
            ...entity.person,
            fullName: discovered.name || entity.person?.fullName,
            title: discovered.title || entity.person?.title,
          },
          contacts: {
            ...entity.contacts,
            emails: discovered.email ? [discovered.email, ...entity.contacts.emails] : entity.contacts.emails,
          },
          needsEnrichment: false, // Now complete
        };
        enrichedEntities.push(updatedEntity);
        enriched++;
        console.log(`[Pipeline:Enrich:${side}] ✓ ${companyName} → ${discovered.domain}`);
      } else {
        // Enrichment failed, keep original entity
        enrichedEntities.push(entity);
        failed++;
        console.log(`[Pipeline:Enrich:${side}] ✗ ${companyName} - no domain found`);
      }
    } catch (err) {
      console.error(`[Pipeline:Enrich:${side}] Error enriching ${companyName}:`, err);
      enrichedEntities.push(entity);
      failed++;
    }
  }

  console.log(`[Pipeline:Enrich:${side}] Complete: ${enriched} enriched, ${failed} failed`);
  return { entities: enrichedEntities, enriched, failed };
}

// =============================================================================
// EMAIL VERIFICATION STAGE (BOTH MODES)
// =============================================================================

/**
 * Verify emails for all entities using Anymail Finder + SSM fallback.
 * If entity has domain but no email, attempts to find decision maker.
 * APPLIES TO BOTH SIDES.
 */
export async function stageEmailVerification(
  entities: CanonicalEntity[],
  side: 'demand' | 'supply',
  anymailApiKey: string | undefined,
  ssmApiKey?: string | undefined
): Promise<{ entities: CanonicalEntity[]; verified: number; found: number; failed: number }> {
  const hasAnymail = !!anymailApiKey;
  const hasSSM = !!ssmApiKey;

  if (!hasAnymail && !hasSSM) {
    console.log(`[Pipeline:Verify:${side}] No verification API keys, skipping`);
    return { entities, verified: 0, found: 0, failed: 0 };
  }

  console.log(`[Pipeline:Verify:${side}] Verifying ${entities.length} entities (Anymail: ${hasAnymail}, SSM: ${hasSSM})`);

  let verified = 0;
  let found = 0;
  let failed = 0;
  const verifiedEntities: CanonicalEntity[] = [];

  for (const entity of entities) {
    const domain = entity.company.domain;
    const existingEmail = entity.contacts.emails[0];

    try {
      if (existingEmail) {
        // Verify existing email - try Anymail first, then SSM
        let verificationStatus: 'verified' | 'risky' | 'invalid' | 'error' = 'error';

        if (hasAnymail) {
          const result = await verifyEmail(anymailApiKey!, existingEmail);
          verificationStatus = result.status === 'verified' ? 'verified' :
                              result.status === 'risky' ? 'risky' : 'invalid';
        }

        // Fallback to SSM if Anymail failed or not configured
        if (verificationStatus !== 'verified' && hasSSM) {
          console.log(`[Pipeline:Verify:${side}] Anymail failed, trying SSM for ${existingEmail}`);
          const ssmResult = await ssmVerifyEmail(ssmApiKey!, existingEmail);
          if (ssmResult.success) {
            verificationStatus = ssmResult.status;
          }
        }

        if (verificationStatus === 'verified') {
          verifiedEntities.push(entity);
          verified++;
        } else {
          // Email invalid, try to find a new one
          if (domain) {
            const newEmail = await findEmailWithFallback(domain, entity.person?.firstName, entity.person?.lastName, anymailApiKey, ssmApiKey);
            if (newEmail) {
              const updated: CanonicalEntity = {
                ...entity,
                contacts: { ...entity.contacts, emails: [newEmail.email] },
                person: {
                  ...entity.person,
                  fullName: newEmail.name || entity.person?.fullName,
                  title: newEmail.title || entity.person?.title,
                },
              };
              verifiedEntities.push(updated);
              found++;
            } else {
              verifiedEntities.push(entity);
              failed++;
            }
          } else {
            verifiedEntities.push(entity);
            failed++;
          }
        }
      } else if (domain) {
        // No email, find decision maker using domain
        const newEmail = await findEmailWithFallback(domain, entity.person?.firstName, entity.person?.lastName, anymailApiKey, ssmApiKey);
        if (newEmail) {
          const updated: CanonicalEntity = {
            ...entity,
            contacts: { ...entity.contacts, emails: [newEmail.email] },
            person: {
              ...entity.person,
              fullName: newEmail.name || entity.person?.fullName,
              title: newEmail.title || entity.person?.title,
            },
          };
          verifiedEntities.push(updated);
          found++;
        } else {
          verifiedEntities.push(entity);
          failed++;
        }
      } else {
        // No domain and no email - can't verify
        verifiedEntities.push(entity);
        failed++;
      }
    } catch (err) {
      console.error(`[Pipeline:Verify:${side}] Error:`, err);
      verifiedEntities.push(entity);
      failed++;
    }
  }

  console.log(`[Pipeline:Verify:${side}] Complete: ${verified} verified, ${found} found, ${failed} failed`);
  return { entities: verifiedEntities, verified, found, failed };
}

/**
 * Find email using Anymail Finder ONLY.
 * SSM is for verification only - it sucks at finding, good at verifying.
 */
async function findEmailWithFallback(
  domain: string,
  _firstName?: string,
  _lastName?: string,
  anymailApiKey?: string,
  _ssmApiKey?: string // NOT used for finding
): Promise<{ email: string; name?: string; title?: string } | null> {
  // Anymail Finder = find + verify (good at both)
  // SSM = verify only (sucks at finding)

  if (anymailApiKey) {
    try {
      const contact = await findDecisionMaker(anymailApiKey, domain, 'ceo');
      if (contact?.email) {
        console.log(`[Pipeline:FindEmail] Anymail found: ${contact.email}`);
        return { email: contact.email, name: contact.name, title: contact.title };
      }
    } catch (err) {
      console.log(`[Pipeline:FindEmail] Anymail failed for ${domain}`);
    }
  } else {
    console.log(`[Pipeline:FindEmail] No Anymail key - cannot find emails`);
  }

  return null;
}

// =============================================================================
// INTEGRATION HOOK
// =============================================================================

export interface PipelineIntegrationConfig {
  // From Settings
  aiConfig: {
    openaiKey?: string;
    azureKey?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
    claudeKey?: string;
  } | null;
  enrichmentConfig: {
    apiKey?: string;
    anymailFinderApiKey?: string;
    ssmApiKey?: string; // SSMasters verification fallback
  };
  instantlyConfig: {
    apiKey: string;
    campaignDemand: string;
    campaignSupply: string;
  } | null;
  userId: string | null;
}

export interface PipelineIntegrationState {
  stage: UIVisualState;
  items: PipelineItem[];
  matchCount: number;
  readyCount: number;
  processing: boolean;
  error: string | null;
}

export interface PipelineIntegrationCallbacks {
  onMatchFound?: (item: PipelineItem) => void;
  onContactEnriched?: (item: PipelineItem, side: 'demand' | 'supply') => void;
  onIntroGenerated?: (item: PipelineItem) => void;
  onSendComplete?: (item: PipelineItem) => void;
  onStageChange?: (stage: PipelineStage) => void;
}

/**
 * Create pipeline dependencies from MatchingEngineV3 config
 */
export function createDepsFromConfig(config: PipelineIntegrationConfig): PipelineDependencies {
  // Map AI config to pipeline format
  let aiConfigMapped: Parameters<typeof createPipelineDependencies>[0]['aiConfig'] = null;

  if (config.aiConfig) {
    if (config.aiConfig.openaiKey) {
      aiConfigMapped = {
        provider: 'openai',
        apiKey: config.aiConfig.openaiKey,
      };
    } else if (config.aiConfig.azureKey && config.aiConfig.azureEndpoint) {
      aiConfigMapped = {
        provider: 'azure',
        apiKey: config.aiConfig.azureKey,
        endpoint: config.aiConfig.azureEndpoint,
        deploymentId: config.aiConfig.azureDeployment,
      };
    } else if (config.aiConfig.claudeKey) {
      aiConfigMapped = {
        provider: 'anthropic',
        apiKey: config.aiConfig.claudeKey,
      };
    }
  }

  // Map Instantly config
  let instantlyConfigMapped: Parameters<typeof createPipelineDependencies>[0]['instantlyConfig'] = null;

  if (config.instantlyConfig?.apiKey) {
    instantlyConfigMapped = {
      apiKey: config.instantlyConfig.apiKey,
      demandCampaignId: config.instantlyConfig.campaignDemand,
      supplyCampaignId: config.instantlyConfig.campaignSupply,
    };
  }

  return createPipelineDependencies({
    aiConfig: aiConfigMapped,
    enrichmentConfig: {
      apolloApiKey: config.enrichmentConfig.apiKey,
      anymailFinderApiKey: config.enrichmentConfig.anymailFinderApiKey,
    },
    instantlyConfig: instantlyConfigMapped,
    userId: config.userId,
  });
}

/**
 * Run pipeline and return results.
 * Stage 5: Pipeline is the only matching system.
 */
export async function runPipelineIntegration(
  demandData: unknown[],
  supplyData: unknown[],
  config: PipelineIntegrationConfig,
  callbacks?: PipelineIntegrationCallbacks
): Promise<{
  items: PipelineItem[];
  metrics: ReturnType<typeof getMetrics>;
  uiState: UIVisualState;
}> {
  console.log('[Pipeline:Integration] Running pipeline');
  console.log('[Pipeline:Integration] Demand items:', demandData.length);
  console.log('[Pipeline:Integration] Supply items:', supplyData.length);

  // Normalize inputs
  const demand = normalizeInput(demandData, 'apify', 'demand');
  const supply = normalizeInput(supplyData, 'apify', 'supply');

  console.log('[Pipeline:Integration] Normalized:', demand.length, 'demand,', supply.length, 'supply');

  // Create dependencies
  const deps = createDepsFromConfig(config);

  // Track stage changes
  let currentStage: PipelineStage = 'input';
  const progressCallback = (stage: PipelineStage, items: PipelineItem[]) => {
    currentStage = stage;
    callbacks?.onStageChange?.(stage);

    // Fire callbacks for completed items
    for (const item of items) {
      if (item.currentStage === 'match' && item.match) {
        callbacks?.onMatchFound?.(item);
      }
      if (item.currentStage === 'enrich') {
        if (item.demandEnrichment?.success) {
          callbacks?.onContactEnriched?.(item, 'demand');
        }
        if (item.supplyEnrichment?.success) {
          callbacks?.onContactEnriched?.(item, 'supply');
        }
      }
      if (item.currentStage === 'intro' && item.intro) {
        callbacks?.onIntroGenerated?.(item);
      }
      if (item.currentStage === 'send' && item.send) {
        callbacks?.onSendComplete?.(item);
      }
    }
  };

  // Run pipeline
  const items = await runPipeline(demand, supply, {
    ...deps,
    onProgress: progressCallback,
  });

  const metrics = getMetrics();
  const uiState = pipelineStageToUIState(currentStage);

  console.log('[Pipeline:Integration] Complete. Metrics:', metrics);
  console.log('[Pipeline:Integration] UI State:', uiState);

  return { items, metrics, uiState };
}

/**
 * Convert pipeline items to MatchingResult format for existing UI
 */
export function pipelineItemsToMatchingResults(items: PipelineItem[]): Array<{
  id: string;
  companyName: string;
  domain: string;
  signalSummary: string;
  windowStatus: string;
  signalStrength: number;
  operatorFitScore: number;
  matchReasons: string[];
  qualityScore: {
    total: number;
    tier: 'A' | 'B' | 'C';
    breakdown: {
      persistence: number;
      density: number;
      velocity: number;
      stacking: number;
    };
    reasons: string[];
  };
}> {
  return items
    .filter(item => !item.blocked && item.match)
    .map(item => {
      const uiMatch = pipelineItemToUIMatch(item);
      return {
        id: item.demand.id,
        companyName: uiMatch.companyName,
        domain: uiMatch.domain,
        signalSummary: uiMatch.matchReason,
        windowStatus: 'OPEN', // Default - pipeline doesn't track this yet
        signalStrength: Math.round(uiMatch.confidence * 100),
        operatorFitScore: 70, // Default - pipeline doesn't calc this yet
        matchReasons: [uiMatch.matchReason],
        qualityScore: {
          total: Math.round(uiMatch.confidence * 100),
          tier: uiMatch.confidence >= 0.7 ? 'A' : uiMatch.confidence >= 0.45 ? 'B' : 'C',
          breakdown: {
            persistence: 20,
            density: 20,
            velocity: 20,
            stacking: Math.round(uiMatch.confidence * 40),
          },
          reasons: [uiMatch.matchReason],
        },
      };
    });
}

/**
 * Stage 5: Pipeline is always used - no legacy path.
 */
export function shouldUsePipeline(): boolean {
  return true;
}

/**
 * Log comparison between old and new paths (for validation)
 */
export function logPathComparison(
  path: 'legacy' | 'pipeline',
  operation: string,
  data: unknown
): void {
  console.log(`[Path:${path}] ${operation}`, data);
}

// =============================================================================
// SHADOW MODE - Pipeline runs but doesn't send or write
// =============================================================================

/**
 * Create SHADOW MODE dependencies.
 * - Match: Uses real AI (if configured) or fallback
 * - Cache: Read-only (no writes)
 * - Validate: Real validation
 * - Enrich: Real enrichment (uses credits but we need real data)
 * - Store: NO-OP (shadow mode)
 * - Intro: Real generation
 * - Send: NO-OP (shadow mode - critical!)
 */
export function createShadowModeDeps(config: PipelineIntegrationConfig): PipelineDependencies {
  const realDeps = createDepsFromConfig(config);

  return {
    ...realDeps,
    // Store is NO-OP in shadow mode
    storeFn: async () => {
      console.log('[Shadow] Store skipped (shadow mode)');
    },
    // Send is NO-OP in shadow mode - CRITICAL
    sendFn: async (item) => {
      console.log('[Shadow] Send skipped (shadow mode):', item.demand.domain, '↔', item.supply.domain);
      return {
        demandId: item.demand.id,
        supplyId: item.supply.id,
        demandSent: false,
        supplySent: false,
        error: 'Shadow mode - send disabled',
      };
    },
  };
}

// =============================================================================
// DIFF LOGGING - Compare legacy vs pipeline
// =============================================================================

export interface LegacySnapshot {
  matchCount: number;
  domains: string[];
  enrichedCount: number;
  readyToSendCount: number;
}

export interface PipelineSnapshot {
  matchCount: number;
  domains: string[];
  enrichedCount: number;
  readyToSendCount: number;
  blocked: number;
  metrics: ReturnType<typeof getMetrics>;
}

/**
 * Create snapshot of legacy state for comparison
 */
export function snapshotLegacy(
  matchingResults: Array<{ domain: string; companyName: string }>,
  enrichedDomains: Set<string>,
  readyToSendCount: number
): LegacySnapshot {
  return {
    matchCount: matchingResults.length,
    domains: matchingResults.map(r => r.domain).sort(),
    enrichedCount: enrichedDomains.size,
    readyToSendCount,
  };
}

/**
 * Create snapshot of pipeline state for comparison
 */
export function snapshotPipeline(items: PipelineItem[]): PipelineSnapshot {
  const notBlocked = items.filter(i => !i.blocked);
  const enriched = notBlocked.filter(i =>
    (i.demandEnrichment?.success || i.demandCache?.email) &&
    (i.supplyEnrichment?.success || i.supplyCache?.email)
  );
  const readyToSend = notBlocked.filter(i => i.intro);

  return {
    matchCount: notBlocked.length,
    domains: notBlocked.map(i => i.demand.domain || '').filter(Boolean).sort(),
    enrichedCount: enriched.length,
    readyToSendCount: readyToSend.length,
    blocked: items.filter(i => i.blocked).length,
    metrics: getMetrics(),
  };
}

/**
 * Diff legacy vs pipeline and log results
 */
export function diffAndLog(legacy: LegacySnapshot, pipeline: PipelineSnapshot): void {
  console.group('[Shadow:Diff] Legacy vs Pipeline');

  // Match count
  const matchDiff = pipeline.matchCount - legacy.matchCount;
  console.log(`Matches: Legacy=${legacy.matchCount}, Pipeline=${pipeline.matchCount} (${matchDiff >= 0 ? '+' : ''}${matchDiff})`);

  // Domain overlap
  const legacySet = new Set(legacy.domains);
  const pipelineSet = new Set(pipeline.domains);
  const overlap = legacy.domains.filter(d => pipelineSet.has(d));
  const onlyLegacy = legacy.domains.filter(d => !pipelineSet.has(d));
  const onlyPipeline = pipeline.domains.filter(d => !legacySet.has(d));

  console.log(`Domain overlap: ${overlap.length}/${legacy.matchCount} (${Math.round(overlap.length / legacy.matchCount * 100)}%)`);
  if (onlyLegacy.length > 0) {
    console.log(`Only in legacy (${onlyLegacy.length}):`, onlyLegacy.slice(0, 5));
  }
  if (onlyPipeline.length > 0) {
    console.log(`Only in pipeline (${onlyPipeline.length}):`, onlyPipeline.slice(0, 5));
  }

  // Enrichment
  console.log(`Enriched: Legacy=${legacy.enrichedCount}, Pipeline=${pipeline.enrichedCount}`);

  // Ready to send
  console.log(`Ready to send: Legacy=${legacy.readyToSendCount}, Pipeline=${pipeline.readyToSendCount}`);

  // Pipeline-specific
  console.log(`Pipeline blocked: ${pipeline.blocked}`);
  console.log(`Pipeline metrics:`, pipeline.metrics);

  // Verdict
  const isParity = overlap.length === legacy.matchCount &&
                   overlap.length === pipeline.matchCount;
  console.log(`\nVerdict: ${isParity ? '✅ PARITY' : '⚠️ DIVERGENCE'}`);

  console.groupEnd();
}

/**
 * Run pipeline in shadow mode and diff against legacy
 *
 * PHASE 1 CHANGE: Now accepts ANY payload (object or array).
 * Uses itemize() to extract items[] from any structure.
 */
export async function runShadowPipeline(
  demandPayload: unknown,
  supplyData: unknown[],
  config: PipelineIntegrationConfig,
  legacySnapshot: LegacySnapshot
): Promise<PipelineSnapshot> {
  console.log('[Shadow] Starting shadow pipeline run...');

  // PHASE 1: Itemize demand payload (handles { data: [...] } wrapper)
  const demandEnvelope = createRawEnvelope(demandPayload, {
    provider: 'apify',
    datasetType: 'demand',
  });
  console.log('[Shadow:Itemize] Demand:', {
    method: demandEnvelope.meta.itemizationMethod,
    itemCount: demandEnvelope.meta.itemCount,
    wrapperKeys: demandEnvelope.meta.wrapperKeysDetected.slice(0, 5),
  });

  // Supply is already an array (discoveredSupplyCompanies)
  const supplyEnvelope = createRawEnvelope(supplyData, {
    provider: 'apify',
    datasetType: 'supply',
  });
  console.log('[Shadow:Itemize] Supply:', {
    method: supplyEnvelope.meta.itemizationMethod,
    itemCount: supplyEnvelope.meta.itemCount,
  });

  // PHASE 2: Schema Discovery (no hardcoded field lists)
  const demandSchema = deriveSchema(demandEnvelope.items);
  const supplySchema = deriveSchema(supplyEnvelope.items);

  logSchemaProfile(demandSchema, 'Shadow:Demand');
  logSchemaProfile(supplySchema, 'Shadow:Supply');

  // Generate draft mappings (not persisted)
  const demandDraftMapping = generateDraftMapping(demandSchema, 'demand-dataset', 'demand');
  const supplyDraftMapping = generateDraftMapping(supplySchema, 'supply-dataset', 'supply');

  console.log('[Shadow:AutoMap] Demand draft mapping:', {
    domains: demandDraftMapping.mappings['company.domain'],
    emails: demandDraftMapping.mappings['contacts.emails'],
    names: demandDraftMapping.mappings['company.name'],
    confidence: demandDraftMapping.confidence.toFixed(2),
  });
  console.log('[Shadow:AutoMap] Supply draft mapping:', {
    domains: supplyDraftMapping.mappings['company.domain'],
    emails: supplyDraftMapping.mappings['contacts.emails'],
    names: supplyDraftMapping.mappings['company.name'],
    confidence: supplyDraftMapping.confidence.toFixed(2),
  });

  // Check for blocking conditions
  const demandBlocks = checkSchemaForBlocks(demandSchema);
  const supplyBlocks = checkSchemaForBlocks(supplySchema);

  if (demandBlocks.length > 0) {
    console.warn('[Shadow:Block] Demand blocked:', demandBlocks);
  }
  if (supplyBlocks.length > 0) {
    console.warn('[Shadow:Block] Supply blocked:', supplyBlocks);
  }

  // PHASE 3: Convert to CanonicalEntity[] using draft mappings
  const demandEntities = itemsToEntities(
    demandEnvelope.items,
    demandDraftMapping,
    'demand',
    'apify'
  );
  const supplyEntities = itemsToEntities(
    supplyEnvelope.items,
    supplyDraftMapping,
    'supply',
    'apify'
  );

  console.log('[Shadow:Entities] Demand:', demandEntities.entities.length, 'entities,', demandEntities.blocked.length, 'blocked');
  console.log('[Shadow:Entities] Supply:', supplyEntities.entities.length, 'entities,', supplyEntities.blocked.length, 'blocked');

  // PHASE 2.5: Detect execution mode
  const { mode, stats } = detectExecutionMode(demandEntities.entities, supplyEntities.entities);

  // Working copies of entities (may be modified by enrichment)
  let workingDemand = demandEntities.entities;
  let workingSupply = supplyEntities.entities;

  // ==========================================================================
  // PHASE 3: ENRICHMENT (ACTION MODE ONLY)
  // ==========================================================================
  if (mode === 'ACTION') {
    console.log('[Shadow:Mode] ACTION - Running enrichment for entities needing it');

    // Enrich DEMAND side
    const demandEnrichResult = await stageEnrichment(
      workingDemand,
      'demand',
      config.enrichmentConfig.apiKey
    );
    workingDemand = demandEnrichResult.entities;

    // Enrich SUPPLY side
    const supplyEnrichResult = await stageEnrichment(
      workingSupply,
      'supply',
      config.enrichmentConfig.apiKey
    );
    workingSupply = supplyEnrichResult.entities;

    console.log('[Shadow:Enrich] Complete:', {
      demandEnriched: demandEnrichResult.enriched,
      demandFailed: demandEnrichResult.failed,
      supplyEnriched: supplyEnrichResult.enriched,
      supplyFailed: supplyEnrichResult.failed,
    });
  } else {
    console.log('[Shadow:Mode] MATCHING_ONLY - Skipping enrichment (data complete)');
  }

  // ==========================================================================
  // PHASE 4: MATCHING
  // ==========================================================================
  const matchResult = stageMatchDeterministic(workingDemand, workingSupply);
  console.log('[Shadow:Match] Deterministic matches:', matchResult.matches.length);

  // Get matched entities from both sides
  const matchedDemandIds = new Set(matchResult.matches.map(m => m.demandId));
  const matchedSupplyIds = new Set(matchResult.matches.map(m => m.supplyId));
  const matchedDemand = workingDemand.filter(e => matchedDemandIds.has(e.entityId));
  const matchedSupply = workingSupply.filter(e => matchedSupplyIds.has(e.entityId));

  // ==========================================================================
  // PHASE 5: EMAIL VERIFICATION (BOTH SIDES, BOTH MODES)
  // ==========================================================================
  console.log('[Shadow:Verify] Verifying emails for BOTH sides');

  // Verify DEMAND side
  const demandVerifyResult = await stageEmailVerification(
    matchedDemand,
    'demand',
    config.enrichmentConfig.anymailFinderApiKey,
    config.enrichmentConfig.ssmApiKey
  );

  // Verify SUPPLY side
  const supplyVerifyResult = await stageEmailVerification(
    matchedSupply,
    'supply',
    config.enrichmentConfig.anymailFinderApiKey,
    config.enrichmentConfig.ssmApiKey
  );

  console.log('[Shadow:Verify] Complete:', {
    demandVerified: demandVerifyResult.verified,
    demandFound: demandVerifyResult.found,
    supplyVerified: supplyVerifyResult.verified,
    supplyFound: supplyVerifyResult.found,
  });

  // Use verified entities for contact completion
  const contactResult = {
    entities: demandVerifyResult.entities,
    blocked: [] as BlockReason[],
    metrics: {
      inputCount: matchedDemand.length,
      readyToSend: demandVerifyResult.entities.filter(e => e.contacts.emails.length > 0).length,
      blockedNoEmail: demandVerifyResult.failed,
      cacheHits: 0,
      enrichedCount: 0,
      processingMs: 0,
    },
  };

  console.log('[Shadow:Contact] Result:', {
    ready: contactResult.metrics.readyToSend,
    blocked: contactResult.metrics.blockedNoEmail,
  });

  // ==========================================================================
  // PHASE 6: INTRO GENERATION (BOTH SIDES)
  // ==========================================================================
  console.log('[Shadow:Intro] Processing', contactResult.entities.length, 'ready entities');

  const introResult = await stageIntroGeneration(
    contactResult.entities,
    supplyVerifyResult.entities,
    matchResult.matches,
    {
      enabled: !!(config.aiConfig?.openaiKey || config.aiConfig?.azureKey || config.aiConfig?.claudeKey),
      apiKey: config.aiConfig?.openaiKey || config.aiConfig?.azureKey || config.aiConfig?.claudeKey,
    }
  );

  console.log('[Shadow:Intro] Result:', {
    generated: introResult.metrics.introGenerated,
    failed: introResult.metrics.introFailed,
    readyToSend: introResult.metrics.readyToSend,
  });

  // Calculate parity status
  const pipelineDomains = new Set(matchResult.matches.map(m => m.demandDomain).filter(Boolean));
  const legacyDomains = new Set(legacySnapshot.domains);
  const overlap = legacySnapshot.domains.filter(d => pipelineDomains.has(d));
  const isParity = overlap.length === legacySnapshot.matchCount &&
                   overlap.length === matchResult.matches.length;

  const parityStatus: 'PARITY' | 'DIVERGENCE' | 'UNKNOWN' = isParity ? 'PARITY' : 'DIVERGENCE';

  // Build blocked entities list
  const blockedEntities = [
    ...contactResult.blocked.map(reason => {
      const entity = demandEntities.entities.find(e =>
        reason.details?.entityId === e.entityId ||
        reason.details?.domain === e.company.domain
      );
      return entity ? { entity, reason } : null;
    }).filter((x): x is { entity: CanonicalEntity; reason: BlockReason } => x !== null),
    ...introResult.blocked.map(reason => {
      const entity = contactResult.entities.find(e =>
        reason.details?.entityId === e.entityId
      );
      return entity ? { entity, reason } : null;
    }).filter((x): x is { entity: CanonicalEntity; reason: BlockReason } => x !== null),
  ];

  // PHASE 6: Build and store immutable snapshot
  // Determine mode: MATCHING_ONLY if all have domains, ACTION if any need enrichment
  const needsEnrichmentCount = demandEntities.entities.filter(e => e.needsEnrichment).length;
  const pipelineMode: 'MATCHING_ONLY' | 'ACTION' = needsEnrichmentCount > 0 ? 'ACTION' : 'MATCHING_ONLY';

  const runSnapshot = buildSnapshot({
    mode: pipelineMode,
    demandEntities: demandEntities.entities,
    supplyEntities: supplyEntities.entities,
    matches: matchResult.matches,
    readyEntities: contactResult.entities.filter(e =>
      introResult.readiness.get(e.entityId) === 'READY_TO_SEND'
    ),
    blockedEntities,
    intros: introResult.intros,
    readinessMap: introResult.readiness,
    allBlocks: [
      ...demandEntities.blocked,
      ...supplyEntities.blocked,
      ...matchResult.blocked,
      ...contactResult.blocked,
      ...introResult.blocked,
    ],
    metrics: {
      cacheHits: contactResult.metrics.cacheHits,
      enriched: contactResult.metrics.enriched,
    },
    parityStatus,
    parityDetails: {
      legacyMatchCount: legacySnapshot.matchCount,
      pipelineMatchCount: matchResult.matches.length,
      domainOverlap: overlap.length,
      divergentDomains: [
        ...legacySnapshot.domains.filter(d => !pipelineDomains.has(d)).slice(0, 5),
        ...Array.from(pipelineDomains).filter(d => !legacyDomains.has(d)).slice(0, 5),
      ],
    },
    startedAt: new Date(Date.now() - 1000), // Approximate start time
  });

  storeSnapshot(runSnapshot);

  console.log('[Shadow:Snapshot] Stored:', {
    runId: runSnapshot.runId,
    parity: parityStatus,
    ready: runSnapshot.metrics.readyToSend,
  });

  // Stage 5: Always log UI adapter output (pipeline is the system)
  const uiState = snapshotToUIState(runSnapshot);
  console.log('[Pipeline:UIAdapter] Rendering:', {
    matchingResults: uiState.matchingResults.length,
    readyCount: uiState.readyCount,
  });

  // Build pipeline snapshot for diff (legacy format)
  const pipelineSnapshot: PipelineSnapshot = {
    matchCount: matchResult.matches.length,
    domains: matchResult.matches.map(m => m.demandDomain).filter(Boolean).sort(),
    enrichedCount: contactResult.metrics.enriched,
    readyToSendCount: introResult.metrics.readyToSend,
    blocked: demandEntities.blocked.length + supplyEntities.blocked.length +
             matchResult.blocked.length + contactResult.blocked.length +
             introResult.blocked.length,
    metrics: getMetrics(),
  };

  // PHASE 7: Structured parity report
  const legacyStageData: LegacyStageData = {
    matchingResults: legacySnapshot.domains.map(d => ({ domain: d, companyName: d })),
    enrichedDomains: new Set(legacySnapshot.domains.filter((_, i) => i < legacySnapshot.enrichedCount)),
    readyToSendCount: legacySnapshot.readyToSendCount,
  };

  const pipelineStageData: PipelineStageData = {
    itemCount: demandEnvelope.items.length,
    demandEntities: demandEntities.entities,
    supplyEntities: supplyEntities.entities,
    matches: matchResult.matches,
    readyEntities: contactResult.entities.filter(e =>
      introResult.readiness.get(e.entityId) === 'READY_TO_SEND'
    ),
    intros: introResult.intros,
  };

  const parityReport = computeParityReport(legacyStageData, pipelineStageData);
  logParityReport(parityReport);

  // Track consecutive parity runs
  const stability = trackParityRun(parityReport.overallParity);
  console.log('[Parity:Stability]', {
    consecutiveCount: stability.consecutiveCount,
    isStable: stability.isStable,
    target: '3 consecutive runs for stable parity',
  });

  if (stability.isStable) {
    console.log('🎉 [Parity] STABLE PARITY ACHIEVED!');
  }

  // Also run legacy diff for backwards compatibility
  diffAndLog(legacySnapshot, pipelineSnapshot);

  return pipelineSnapshot;
}
