/**
 * FLOW — The Core Product
 *
 * Two scrapers. Known fields. Templates. Matching brain.
 *
 * Pipeline: VALIDATE → MATCH → ENRICH → INTRO → ROUTE
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow, ArrowLeft } from 'lucide-react';
import Dock from './Dock';

// New architecture
import { validateDataset, normalizeDataset, NormalizedRecord, Schema } from './schemas';
import { matchRecords, MatchingResult, filterByScore } from './matching';
import { enrichRecord, EnrichmentConfig, EnrichmentResult } from './enrichment';
import { generateDemandIntro, generateSupplyIntro } from './templates';

// AI Config type + Antifragile intro generation
import { AIConfig, generateIntro } from './services/AIService';

// Intro Generator — Rich context for DEMAND only (supply uses antifragile path)
import {
  generateDemandIntro as generateDemandIntroRich,
  buildDemandContext,
} from './services/IntroGenerator';

// Sender Adapter (Instantly, Plusvibe, etc.)
import { resolveSender, buildSenderConfig, SenderAdapter, SenderConfig } from './services/senders';

// Connector Hub Adapter (side-channel - does NOT modify existing flow)
import { isFromHub, hasHubContacts, getHubBothSides, clearHubContacts } from './services/ConnectorHubAdapter';

// =============================================================================
// INTRO GENERATION — Now handled by IntroGenerator.ts
// Rich context, 15 real examples, validation with regeneration
// =============================================================================

/**
 * Extract company stage from funding string for fallback intros.
 * "$50M Series C" → "Series C"
 */
function extractStageFromFunding(funding: string): string | null {
  if (!funding) return null;
  const lower = funding.toLowerCase();
  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('series d')) return 'Series D';
  if (lower.includes('seed')) return 'Seed';
  if (lower.includes('public') || lower.includes('ipo')) return 'Public';
  return null;
}

/**
 * SIGNAL CONTRACT ENFORCER
 * - 3-8 words max
 * - Must start with action verb
 * - No enrichment (descriptions, industries, locations)
 * - Fallback: "showing momentum"
 */
const FALLBACK_SIGNAL = 'showing momentum';
const ACTION_VERBS = ['hiring', 'scaling', 'growing', 'building', 'expanding', 'raising', 'launching', 'opening', 'adding', 'seeking'];
const FORBIDDEN_PATTERNS = [
  /\b(inc|llc|ltd|corp|company|industry|description|services?|solutions?|provider)\b/i,
  /\b(located|based|headquartered)\b/i,
  /\b(we are|they are|is a)\b/i,
  /[,·•|]/,  // Multi-part enrichment joins
];

function sanitizeSignal(signal: string | null | undefined): string {
  if (!signal || signal.trim().length === 0) return FALLBACK_SIGNAL;

  const trimmed = signal.trim();
  const words = trimmed.split(/\s+/);

  // Reject: too long (> 8 words)
  if (words.length > 8) return FALLBACK_SIGNAL;

  // Reject: too short (< 2 words) unless it's a verb
  if (words.length < 2 && !ACTION_VERBS.some(v => trimmed.toLowerCase().startsWith(v))) {
    return FALLBACK_SIGNAL;
  }

  // Reject: contains forbidden patterns (enrichment indicators)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) return FALLBACK_SIGNAL;
  }

  // Reject: doesn't start with action verb (unless very short)
  const firstWord = words[0].toLowerCase();
  if (words.length >= 3 && !ACTION_VERBS.some(v => firstWord.startsWith(v))) {
    return FALLBACK_SIGNAL;
  }

  return trimmed;
}

/**
 * Detect common signal category across multiple matches.
 * Used for aggregated supply intros: "5 companies hiring engineers"
 */
function detectCommonSignal(signals: string[]): string {
  if (signals.length === 0) return 'hiring';

  // Count occurrences of each category
  const categories: Record<string, number> = {};

  for (const signal of signals) {
    const lower = (signal || '').toLowerCase();

    if (lower.includes('engineer') || lower.includes('developer') || lower.includes('software')) {
      categories['hiring engineers'] = (categories['hiring engineers'] || 0) + 1;
    } else if (lower.includes('sales') || lower.includes('account executive')) {
      categories['scaling sales'] = (categories['scaling sales'] || 0) + 1;
    } else if (lower.includes('marketing') || lower.includes('growth')) {
      categories['growing marketing'] = (categories['growing marketing'] || 0) + 1;
    } else if (lower.includes('product') || lower.includes('design')) {
      categories['building product'] = (categories['building product'] || 0) + 1;
    } else if (lower.includes('data') || lower.includes('analyst')) {
      categories['hiring data teams'] = (categories['hiring data teams'] || 0) + 1;
    } else {
      categories['hiring'] = (categories['hiring'] || 0) + 1;
    }
  }

  // Return most common category
  let maxCategory = 'hiring';
  let maxCount = 0;
  for (const [cat, count] of Object.entries(categories)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = cat;
    }
  }

  return maxCategory;
}

// =============================================================================
// TYPES
// =============================================================================

interface FlowState {
  step: 'upload' | 'validating' | 'matching' | 'enriching' | 'generating' | 'ready' | 'sending' | 'complete';

  // Source tracking (for UI labels)
  isHubFlow: boolean;

  // Datasets
  demandSchema: Schema | null;
  supplySchema: Schema | null;
  demandRecords: NormalizedRecord[];
  supplyRecords: NormalizedRecord[];

  // Matching
  matchingResult: MatchingResult | null;

  // Enrichment
  enrichedDemand: Map<string, EnrichmentResult>;
  enrichedSupply: Map<string, EnrichmentResult>;

  // Intros (AI-generated)
  demandIntros: Map<string, string>;  // domain -> intro
  supplyIntros: Map<string, string>;  // domain -> intro

  // Progress
  progress: { current: number; total: number; message: string };

  // Results
  sentDemand: number;
  sentSupply: number;

  // Error
  error: string | null;
}

interface Settings {
  apifyToken?: string;
  demandDatasetId?: string;
  supplyDatasetId?: string;
  apolloApiKey?: string;
  anymailApiKey?: string;
  ssmApiKey?: string;
  instantlyApiKey?: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  // AI
  aiConfig: AIConfig | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Flow() {
  const [state, setState] = useState<FlowState>({
    step: 'upload',
    isHubFlow: false,
    demandSchema: null,
    supplySchema: null,
    demandRecords: [],
    supplyRecords: [],
    matchingResult: null,
    enrichedDemand: new Map(),
    enrichedSupply: new Map(),
    demandIntros: new Map(),
    supplyIntros: new Map(),
    progress: { current: 0, total: 0, message: '' },
    sentDemand: 0,
    sentSupply: 0,
    error: null,
  });

  const [settings, setSettings] = useState<Settings | null>(null);
  const abortRef = useRef(false);
  const navigate = useNavigate();

  // Load settings from localStorage (guest mode)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('guest_settings');
      if (!stored) {
        console.log('[Flow] No settings found');
        setSettings({ aiConfig: null });
        return;
      }

      const parsed = JSON.parse(stored);
      const s = parsed.settings || parsed || {};

      console.log('[Flow] Loaded settings:', Object.keys(s));

      // Build AIConfig from settings (matches Settings.tsx key names)
      let aiConfig: AIConfig | null = null;

      // Check which AI provider is configured
      if (s.azureApiKey && s.azureEndpoint) {
        aiConfig = {
          enabled: true,
          provider: 'azure',
          model: s.azureDeployment || 'gpt-4o-mini',
          apiKey: s.azureApiKey,
          endpoint: s.azureEndpoint,
          deployment: s.azureDeployment,
        };
      } else if (s.openaiApiKey) {
        aiConfig = {
          enabled: true,
          provider: 'openai',
          model: s.aiModel || 'gpt-4o-mini',
          apiKey: s.openaiApiKey,
        };
      } else if (s.claudeApiKey) {
        aiConfig = {
          enabled: true,
          provider: 'anthropic',
          model: s.aiModel || 'claude-3-haiku-20240307',
          apiKey: s.claudeApiKey,
        };
      }

      setSettings({
        apifyToken: s.apifyToken,
        demandDatasetId: s.demandDatasetId,
        supplyDatasetId: s.supplyDatasetId,
        apolloApiKey: s.apolloApiKey,
        anymailApiKey: s.anymailApiKey,
        ssmApiKey: s.ssmApiKey,
        instantlyApiKey: s.instantlyApiKey,
        demandCampaignId: s.instantlyCampaignDemand,
        supplyCampaignId: s.instantlyCampaignSupply,
        aiConfig,
      });

      console.log('[Flow] AI configured:', aiConfig ? aiConfig.provider : 'none');
    } catch (e) {
      console.error('[Flow] Settings parse error:', e);
      setSettings({ aiConfig: null });
    }
  }, []);

  // Auto-start when coming from Connector Hub (ref to avoid dependency issues)
  const hubAutoStartRef = useRef(false);
  const startFlowRef = useRef<() => void>();

  // =============================================================================
  // STEP 1: VALIDATE & LOAD DATASETS
  // =============================================================================

  const startFlow = useCallback(async () => {
    abortRef.current = false;
    setState(prev => ({ ...prev, step: 'validating', error: null }));
    setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading...' } }));

    try {
      // =========================================================================
      // HUB ADAPTER: Check if contacts came from Connector Hub
      // Hub collects BOTH demand AND supply - no Apify fetch needed
      // STRICT: Requires BOTH URL param AND hub data - no fallbacks
      // =========================================================================
      const urlHasHubSource = new URLSearchParams(window.location.search).get('source') === 'hub';
      const hubHasData = hasHubContacts();

      console.log('[Flow] Hub check:', { urlHasHubSource, hubHasData });

      if (urlHasHubSource && hubHasData) {
        console.log('[Flow] Hub source detected - using two-sided adapter');
        setState(prev => ({ ...prev, progress: { current: 20, total: 100, message: 'Loading Hub contacts...' } }));

        // Get BOTH sides from Hub (demand + supply)
        const { demand: hubDemand, supply: hubSupply, error: hubError } = getHubBothSides();
        console.log('[Flow] Hub adapter returned', hubDemand.length, 'demand +', hubSupply.length, 'supply');

        // Check for cross-source matching block
        if (hubError) {
          console.error('[Flow] Hub ERROR:', hubError);
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: hubError,
          }));
          return;
        }

        // Validate both sides exist
        if (hubDemand.length === 0 || hubSupply.length === 0) {
          console.error('[Flow] Hub ERROR: Missing one side - demand:', hubDemand.length, 'supply:', hubSupply.length);
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: 'Hub requires both Demand and Supply. Please select contacts for both sides.',
          }));
          return;
        }

        setState(prev => ({ ...prev, progress: { current: 40, total: 100, message: 'Deduplicating...' } }));

        // Dedupe demand by domain
        const seenDemandDomains = new Set<string>();
        const dedupedDemand = hubDemand.filter(r => {
          if (!r.domain || seenDemandDomains.has(r.domain)) return false;
          seenDemandDomains.add(r.domain);
          return true;
        });

        // Dedupe supply by domain
        const seenSupplyDomains = new Set<string>();
        const dedupedSupply = hubSupply.filter(r => {
          if (!r.domain || seenSupplyDomains.has(r.domain)) return false;
          seenSupplyDomains.add(r.domain);
          return true;
        });

        console.log('[Flow] After dedup: demand:', dedupedDemand.length, 'supply:', dedupedSupply.length);

        // =======================================================================
        // RUNTIME ASSERTIONS — Validate adapter contract before matching
        // =======================================================================
        const validateRecords = (records: NormalizedRecord[], label: string): boolean => {
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            // size must be string | null
            if (r.size !== null && typeof r.size !== 'string') {
              console.error(`[Flow] CONTRACT VIOLATION in ${label}[${i}]: size is ${typeof r.size}, not string|null`, r.size);
              console.error(`[Flow] Record sample:`, { company: r.company, domain: r.domain, size: r.size });
              return false;
            }
            // Required fields
            if (!r.domain) {
              console.error(`[Flow] CONTRACT VIOLATION in ${label}[${i}]: missing domain`, r);
              return false;
            }
          }
          return true;
        };

        if (!validateRecords(dedupedDemand, 'demand')) {
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: 'Hub data contract violation (demand). Check console for details.',
          }));
          return;
        }

        if (!validateRecords(dedupedSupply, 'supply')) {
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: 'Hub data contract violation (supply). Check console for details.',
          }));
          return;
        }

        console.log('[Flow] Contract validation passed for both sides');
        // =======================================================================

        // Clear URL param before processing
        window.history.replaceState({}, '', window.location.pathname);

        // Hub adapts data, then calls the SAME flow functions as normal path
        // This ensures 100% parity - no duplicated logic
        const hubDemandSchema = { name: 'Connector Hub (Demand)', id: 'connector-hub-demand', fields: [], hasContacts: true } as any;
        const hubSupplySchema = { name: 'Connector Hub (Supply)', id: 'connector-hub-supply', fields: [], hasContacts: true } as any;

        // Set state with adapted data, then let runMatching handle the rest
        setState(prev => ({
          ...prev,
          step: 'matching',
          isHubFlow: true,  // Track source for UI labels
          demandSchema: hubDemandSchema,
          supplySchema: hubSupplySchema,
          demandRecords: dedupedDemand,
          supplyRecords: dedupedSupply,
          progress: { current: 70, total: 100, message: 'Matching...' },
        }));

        console.log('[Flow:Hub] Handing off to runMatching (same path as normal flow)');

        // CRITICAL: Hub calls the SAME runMatching function as normal path
        // runMatching → matchRecords → runEnrichment → runIntroGeneration
        await runMatching(dedupedDemand, dedupedSupply, hubDemandSchema, hubSupplySchema);

        // Clear hub data after successful flow to prevent contamination
        console.log('[Flow:Hub] Clearing hub localStorage after successful handoff');
        clearHubContacts();
        return;
      }
      // =========================================================================
      // END HUB ADAPTER - Normal flow continues below
      // =========================================================================

      if (!settings?.demandDatasetId || !settings?.apifyToken) {
        setState(prev => ({ ...prev, step: 'upload', error: 'Configure datasets in Settings' }));
        return;
      }

      setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading demand...' } }));

      // Fetch demand dataset
      const demandData = await fetchApifyDataset(settings.demandDatasetId, settings.apifyToken);
      console.log('[Flow] Raw demand data sample:', demandData[0]);
      console.log('[Flow] Raw demand fields:', demandData[0] ? Object.keys(demandData[0]) : 'empty');
      setState(prev => ({ ...prev, progress: { ...prev.progress, current: 30, message: 'Validating demand...' } }));

      // Validate demand
      const demandValidation = validateDataset(demandData);
      console.log('[Flow] Demand validation:', { valid: demandValidation.valid, schema: demandValidation.schema?.name, error: demandValidation.error });
      if (!demandValidation.valid || !demandValidation.schema) {
        setState(prev => ({
          ...prev,
          step: 'upload',
          error: demandValidation.error || 'Invalid demand dataset',
        }));
        return;
      }

      // Normalize demand
      const demandRecords = normalizeDataset(demandData, demandValidation.schema);
      console.log(`[Flow] Demand: ${demandRecords.length} records (${demandValidation.schema.name})`);
      console.log('[Flow] Normalized demand sample:', demandRecords[0] ? { email: demandRecords[0].email, firstName: demandRecords[0].firstName, company: demandRecords[0].company, domain: demandRecords[0].domain, signal: demandRecords[0].signal } : 'empty');

      // Fetch supply dataset
      let supplyRecords: NormalizedRecord[] = [];
      let supplySchema: Schema | null = null;

      if (settings.supplyDatasetId) {
        setState(prev => ({ ...prev, progress: { ...prev.progress, current: 50, message: 'Loading supply...' } }));
        const supplyData = await fetchApifyDataset(settings.supplyDatasetId, settings.apifyToken);
        console.log('[Flow] Raw supply data sample:', supplyData[0]);
        console.log('[Flow] Raw supply fields:', supplyData[0] ? Object.keys(supplyData[0]) : 'empty');

        const supplyValidation = validateDataset(supplyData);
        console.log('[Flow] Supply validation:', { valid: supplyValidation.valid, schema: supplyValidation.schema?.name, error: supplyValidation.error });
        if (supplyValidation.valid && supplyValidation.schema) {
          supplyRecords = normalizeDataset(supplyData, supplyValidation.schema);
          supplySchema = supplyValidation.schema;
          console.log(`[Flow] Supply: ${supplyRecords.length} records (${supplyValidation.schema.name})`);
          console.log('[Flow] Normalized supply sample:', supplyRecords[0] ? { email: supplyRecords[0].email, firstName: supplyRecords[0].firstName, company: supplyRecords[0].company, domain: supplyRecords[0].domain, title: supplyRecords[0].title } : 'empty');
        }
      } else {
        console.log('[Flow] No supply dataset configured');
      }

      setState(prev => ({
        ...prev,
        step: 'matching',
        demandSchema: demandValidation.schema,
        supplySchema,
        demandRecords,
        supplyRecords,
        progress: { current: 70, total: 100, message: 'Matching...' },
      }));

      // Start matching
      await runMatching(demandRecords, supplyRecords, demandValidation.schema, supplySchema);

    } catch (err) {
      console.error('[Flow] Validation failed:', err);
      setState(prev => ({
        ...prev,
        step: 'upload',
        error: err instanceof Error ? err.message : 'Failed to load datasets',
      }));
    }
  }, [settings]);

  // Keep startFlow ref updated for Hub auto-start
  startFlowRef.current = startFlow;

  // Auto-start when coming from Connector Hub
  // STRICT: Requires BOTH URL param AND hub data - no fallbacks
  useEffect(() => {
    if (hubAutoStartRef.current) return;
    if (!settings) return;

    const urlHasHubSource = new URLSearchParams(window.location.search).get('source') === 'hub';
    const hubHasData = hasHubContacts();

    console.log('[Flow] Auto-start check:', { urlHasHubSource, hubHasData, alreadyStarted: hubAutoStartRef.current });

    // STRICT AND - both must be true
    if (urlHasHubSource && hubHasData) {
      console.log('[Flow] Auto-starting from Hub');
      hubAutoStartRef.current = true;
      startFlowRef.current?.();
    }
  }, [settings]);

  // =============================================================================
  // STEP 2: MATCHING
  // =============================================================================

  const runMatching = async (
    demand: NormalizedRecord[],
    supply: NormalizedRecord[],
    demandSchema: Schema,
    supplySchema: Schema | null
  ) => {
    setState(prev => ({ ...prev, progress: { current: 80, total: 100, message: 'Finding matches...' } }));

    // Both datasets required for matching
    if (supply.length === 0) {
      console.log(`[Flow] ERROR: No supply dataset - matching requires both datasets`);
      setState(prev => ({
        ...prev,
        step: 'upload',
        error: 'Configure supply dataset in Settings. Matching requires both demand and supply.',
      }));
      return;
    }

    // Diagnostic logs
    console.time('[MATCH] matchRecords');
    console.log('[MATCH] inputs', { demand: demand.length, supply: supply.length });

    // Run matching brain (async with yielding for large datasets)
    const result = await matchRecords(demand, supply);

    console.timeEnd('[MATCH] matchRecords');
    console.log('[MATCH] result', {
      demandMatches: result.demandMatches.length,
      supplyAggregates: result.supplyAggregates.length,
      avgScore: result.stats.avgScore,
    });

    // Filter by minimum score
    const filtered = filterByScore(result, 20);

    console.log(`[Flow] Matching complete:`);
    console.log(`  - Demand: ${demand.length} records`);
    console.log(`  - Supply: ${supply.length} records`);
    console.log(`  - Demand matches: ${filtered.demandMatches.length}`);
    console.log(`  - Supply aggregates: ${filtered.supplyAggregates.length}`);
    console.log(`  - Avg score: ${result.stats.avgScore}`);

    // Debug: Log sample data if no matches
    if (filtered.demandMatches.length === 0) {
      console.log(`[Flow] WARNING: 0 matches found. Sample data:`);
      if (demand[0]) console.log(`  - Demand[0]:`, { company: demand[0].company, domain: demand[0].domain, signal: demand[0].signal, industry: demand[0].industry });
      if (supply[0]) console.log(`  - Supply[0]:`, { company: supply[0].company, domain: supply[0].domain, title: supply[0].title, industry: supply[0].industry });
    }

    // =======================================================================
    // INVARIANT: After matchRecords, we MUST advance to enriching
    // =======================================================================
    console.log('[MATCH] advancing step', { from: 'matching', to: 'enriching' });

    setState(prev => ({
      ...prev,
      step: 'enriching',
      matchingResult: filtered,
      progress: { current: 0, total: filtered.demandMatches.length, message: 'Enriching contacts...' },
    }));

    // Heartbeat to confirm setState executed
    setTimeout(() => console.log('[MATCH] post-setState heartbeat'), 0);

    // =======================================================================
    // RUNTIME GUARD: If matches exist, enrichment MUST be called
    // =======================================================================
    if (filtered.demandMatches.length > 0 || filtered.supplyAggregates.length > 0) {
      console.log('[MATCH] matches exist, calling runEnrichment');
      await runEnrichment(filtered, demandSchema, supplySchema);
    } else {
      console.error('[MATCH] CRITICAL: No matches to enrich - flow ends here');
      setState(prev => ({
        ...prev,
        step: 'ready',
        progress: { current: 100, total: 100, message: 'No matches found' },
      }));
    }
  };

  // =============================================================================
  // STEP 3: ENRICHMENT
  // =============================================================================

  const runEnrichment = async (
    matching: MatchingResult,
    demandSchema: Schema,
    supplySchema: Schema | null
  ) => {
    const config: EnrichmentConfig = {
      apolloApiKey: settings?.apolloApiKey,
      anymailApiKey: settings?.anymailApiKey,
      ssmApiKey: settings?.ssmApiKey,
    };

    console.log('[Flow] Enrichment config:', {
      hasApollo: !!config.apolloApiKey,
      hasAnymail: !!config.anymailApiKey,
      hasSsm: !!config.ssmApiKey,
    });

    const enrichedDemand = new Map<string, EnrichmentResult>();
    const enrichedSupply = new Map<string, EnrichmentResult>();

    // Enrich demand side
    const demandToEnrich = matching.demandMatches;
    console.log(`[Flow] Enriching ${demandToEnrich.length} demand matches`);

    for (let i = 0; i < demandToEnrich.length; i++) {
      if (abortRef.current) break;

      const match = demandToEnrich[i];
      const record = match.demand;

      console.log(`[Flow] Enriching demand ${i + 1}:`, { domain: record.domain, email: record.email, firstName: record.firstName });
      const result = await enrichRecord(record, demandSchema, config, record.signal);
      console.log(`[Flow] Enrichment result:`, { success: result.success, email: result.email, firstName: result.firstName });
      enrichedDemand.set(record.domain, result);

      setState(prev => ({
        ...prev,
        progress: { current: i + 1, total: demandToEnrich.length, message: `Enriching ${i + 1}/${demandToEnrich.length}` },
        enrichedDemand: new Map(enrichedDemand),
      }));
    }

    // Enrich supply side (if needed)
    const supplyToEnrich = matching.supplyAggregates;
    for (let i = 0; i < supplyToEnrich.length; i++) {
      if (abortRef.current) break;

      const agg = supplyToEnrich[i];
      const record = agg.supply;

      // Supply from B2B Contacts usually has email
      if (record.email) {
        enrichedSupply.set(record.domain, {
          success: true,
          email: record.email,
          firstName: record.firstName,
          lastName: record.lastName,
          title: record.title,
          verified: true,
          source: 'existing',
        });
      } else if (supplySchema) {
        const result = await enrichRecord(record, supplySchema, config);
        enrichedSupply.set(record.domain, result);
      }
    }

    // Summary
    const demandSuccessCount = Array.from(enrichedDemand.values()).filter(r => r.success && r.email).length;
    const supplySuccessCount = Array.from(enrichedSupply.values()).filter(r => r.success && r.email).length;
    console.log(`[Flow] Enrichment complete:`);
    console.log(`  - Demand: ${demandSuccessCount}/${enrichedDemand.size} with email`);
    console.log(`  - Supply: ${supplySuccessCount}/${enrichedSupply.size} with email`);

    // Move to intro generation
    setState(prev => ({
      ...prev,
      step: 'generating',
      enrichedDemand,
      enrichedSupply,
      progress: { current: 0, total: demandSuccessCount + supplySuccessCount, message: 'Generating intros...' },
    }));

    // Generate AI intros
    await runIntroGeneration(matching, enrichedDemand, enrichedSupply);
  };

  // =============================================================================
  // STEP 4: INTRO GENERATION — DOCTRINE COMPLIANT
  // =============================================================================
  //
  // DEMAND: Hold the provider. Reference their situation, not who helps.
  // SUPPLY: Hold the list. "Companies like X" — one example, implies plurality.
  //
  // Matching is many-to-many. Messaging is one-to-one.
  // =============================================================================

  const runIntroGeneration = async (
    matching: MatchingResult,
    enrichedDemand: Map<string, EnrichmentResult>,
    enrichedSupply: Map<string, EnrichmentResult>
  ) => {
    const demandIntros = new Map<string, string>();
    const supplyIntros = new Map<string, string>();
    const aiConfig = settings?.aiConfig || null;

    // DEBUG: Log what we have
    console.log('[Flow] Anti-Fragile intro generation starting:');
    console.log('  - demandMatches:', matching.demandMatches.length);
    console.log('  - supplyAggregates:', matching.supplyAggregates.length);
    console.log('  - enrichedDemand size:', enrichedDemand.size);
    console.log('  - enrichedSupply size:', enrichedSupply.size);
    console.log('  - AI configured:', aiConfig ? aiConfig.provider : 'none (using templates)');

    // Count emails
    const demandWithEmail = matching.demandMatches.filter(m => {
      const e = enrichedDemand.get(m.demand.domain);
      return e?.email;
    });
    const supplyWithEmail = matching.supplyAggregates.filter(a => {
      const e = enrichedSupply.get(a.supply.domain);
      return e?.email;
    });

    console.log('  - demandWithEmail:', demandWithEmail.length);
    console.log('  - supplyWithEmail:', supplyWithEmail.length);

    let progress = 0;
    const total = demandWithEmail.length + supplyWithEmail.length;

    // ==========================================================================
    // Calculate role counts per company (for richer signals)
    // "Stripe is hiring" → "Stripe is scaling engineering with 8+ roles"
    // ==========================================================================
    const roleCountByDomain = new Map<string, number>();
    for (const match of matching.demandMatches) {
      const domain = match.demand.domain;
      roleCountByDomain.set(domain, (roleCountByDomain.get(domain) || 0) + 1);
    }

    // ==========================================================================
    // GENERATE DEMAND INTROS — Rich context, 15 examples, validation
    // ==========================================================================
    for (const match of matching.demandMatches) {
      if (abortRef.current) break;

      const enriched = enrichedDemand.get(match.demand.domain);
      if (!enriched?.success || !enriched.email) continue;

      // No name = not a match, skip
      const firstName = enriched.firstName || match.demand.firstName;
      if (!firstName) {
        console.log(`[Flow] Skipping ${match.demand.company} - no name found`);
        continue;
      }

      // Get role count for this company (for specific signals)
      const roleCount = roleCountByDomain.get(match.demand.domain) || 1;

      try {
        // Build rich context from ALL available data
        // Pass: firstName, enriched title (e.g., "VP Engineering"), role count
        const ctx = buildDemandContext(
          match.demand,
          firstName,
          enriched.title || undefined,  // Enriched title from Apollo
          roleCount
        );
        console.log(`[Flow] Generating demand intro for ${firstName} at ${match.demand.company}...`);
        console.log(`[Flow] Context:`, {
          signal: ctx.signal,
          contactTitle: ctx.contactTitle,
          roleCount: ctx.roleCount,
          hasDescription: !!ctx.companyDescription,
          hasFunding: !!ctx.companyFunding,
          industry: ctx.industry,
        });

        // Generate with validation (retries up to 3x if validation fails)
        const result = await generateDemandIntroRich(aiConfig, ctx);
        demandIntros.set(match.demand.domain, result.intro);
        console.log(`[Flow] Demand intro (validated=${result.validated}, attempts=${result.attempts}): "${result.intro}"`);

      } catch (err) {
        console.error('[Flow] Demand intro failed:', match.demand.domain, err);
        // Fallback to template
        demandIntros.set(match.demand.domain, generateDemandIntro({
          ...match.demand,
          firstName,
        }));
      }

      progress++;
      setState(prev => ({
        ...prev,
        progress: { current: progress, total, message: `Generating ${progress}/${total}` },
        demandIntros: new Map(demandIntros),
      }));

      // Rate limit: 500ms between matches (generation + validation calls)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ==========================================================================
    // GENERATE SUPPLY INTROS — Antifragile path (AIService.generateIntro)
    // Signal-only, no enrichment, deterministic fallback
    // ==========================================================================
    for (const agg of matching.supplyAggregates) {
      if (abortRef.current) break;

      const enriched = enrichedSupply.get(agg.supply.domain);
      if (!enriched?.success || !enriched.email) continue;

      // No name = not a match, skip
      const firstName = enriched.firstName || agg.supply.firstName;
      if (!firstName) {
        console.log(`[Flow] Skipping supply ${agg.supply.company} - no name found`);
        continue;
      }

      const exampleCompany = agg.bestMatch.demand.company;  // ONE example only
      const allSignals = agg.matches.map(m => m.demand.signal || '');
      const commonSignal = detectCommonSignal(allSignals);

      // SIGNAL CONTRACT: Sanitize before intro generation
      const sanitizedSignal = sanitizeSignal(commonSignal);

      // Get decision maker name (not title - antifragile uses name only)
      const demandEnriched = enrichedDemand.get(agg.bestMatch.demand.domain);
      const contactName = demandEnriched?.firstName || agg.bestMatch.demand.firstName || null;

      console.log(`[Flow] Generating supply intro for ${firstName} via antifragile path...`);
      console.log(`[Flow] Signal: "${commonSignal}" → sanitized: "${sanitizedSignal}"`);

      // ANTIFRAGILE PATH: AIService.generateIntro (signal-only, no enrichment)
      const intro = await generateIntro(
        {
          type: 'supply',
          signalDetail: sanitizedSignal,
          context: {
            firstName,
            company: exampleCompany,
            contactName: contactName || undefined,
          },
        },
        aiConfig
      );

      supplyIntros.set(agg.supply.domain, intro);
      console.log(`[Flow] Supply intro (antifragile): "${intro}"`);

      progress++;
      setState(prev => ({
        ...prev,
        progress: { current: progress, total, message: `Generating ${progress}/${total}` },
        supplyIntros: new Map(supplyIntros),
      }));

      // Rate limit: 500ms between calls
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log(`[Flow] Intro generation complete:`);
    console.log(`  - Demand intros: ${demandIntros.size}`);
    console.log(`  - Supply intros: ${supplyIntros.size}`);

    // Move to ready
    setState(prev => ({
      ...prev,
      step: 'ready',
      demandIntros,
      supplyIntros,
    }));
  };

  // =============================================================================
  // STEP 5: SEND VIA SENDER ADAPTER
  // =============================================================================

  const startSending = useCallback(async () => {
    // Resolve sender ONCE at start
    const senderId = settings?.sendingProvider || 'instantly';
    const sender = resolveSender(senderId);

    if (!sender) {
      setState(prev => ({ ...prev, error: `Unknown sending provider: ${senderId}` }));
      return;
    }

    // Build sender config
    const senderConfig = buildSenderConfig({
      instantlyApiKey: settings?.instantlyApiKey,
      plusvibeApiKey: settings?.plusvibeApiKey,
      plusvibeWorkspaceId: settings?.plusvibeWorkspaceId,
      demandCampaignId: settings?.demandCampaignId,
      supplyCampaignId: settings?.supplyCampaignId,
      sendingProvider: senderId,
    });

    // Validate config
    const configError = sender.validateConfig(senderConfig);
    if (configError) {
      setState(prev => ({ ...prev, error: configError }));
      return;
    }

    setState(prev => ({ ...prev, step: 'sending' }));

    const { matchingResult, enrichedDemand, enrichedSupply } = state;
    if (!matchingResult) return;

    let sentDemand = 0;
    let sentSupply = 0;

    // Send to demand side
    if (senderConfig.demandCampaignId) {
      const demandToSend = matchingResult.demandMatches.filter(m => {
        const enriched = enrichedDemand.get(m.demand.domain);
        return enriched?.success && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: demandToSend.length, message: 'Sending to demand...' },
      }));

      for (let i = 0; i < demandToSend.length; i++) {
        if (abortRef.current) break;

        const match = demandToSend[i];
        const enriched = enrichedDemand.get(match.demand.domain)!;

        // Use pre-generated AI intro (fall back to template if missing)
        const intro = state.demandIntros.get(match.demand.domain) || generateDemandIntro({
          ...match.demand,
          firstName: enriched.firstName || match.demand.firstName,
          email: enriched.email,
        });

        try {
          const result = await sender.sendLead(senderConfig, {
            type: 'DEMAND',
            campaignId: senderConfig.demandCampaignId!,
            email: enriched.email!,
            firstName: enriched.firstName,
            lastName: enriched.lastName,
            companyName: match.demand.company,
            companyDomain: match.demand.domain,
            introText: intro,
            contactTitle: enriched.title,
          });
          if (result.success) sentDemand++;
        } catch (err) {
          console.error('[Flow] Send failed:', match.demand.domain, err);
        }

        setState(prev => ({
          ...prev,
          progress: { current: i + 1, total: demandToSend.length, message: `Demand ${i + 1}/${demandToSend.length}` },
        }));
      }
    }

    // Send to supply side (aggregated - one per supplier)
    if (senderConfig.supplyCampaignId) {
      const supplyToSend = matchingResult.supplyAggregates.filter(a => {
        const enriched = enrichedSupply.get(a.supply.domain);
        return enriched?.success && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: supplyToSend.length, message: 'Sending to supply...' },
      }));

      for (let i = 0; i < supplyToSend.length; i++) {
        if (abortRef.current) break;

        const agg = supplyToSend[i];
        const enriched = enrichedSupply.get(agg.supply.domain)!;

        // Use pre-generated AI intro (fall back to template if missing)
        const intro = state.supplyIntros.get(agg.supply.domain) || generateSupplyIntro(
          { ...agg.supply, firstName: enriched.firstName || agg.supply.firstName, email: enriched.email },
          agg.bestMatch.demand
        );

        try {
          const result = await sender.sendLead(senderConfig, {
            type: 'SUPPLY',
            campaignId: senderConfig.supplyCampaignId!,
            email: enriched.email!,
            firstName: enriched.firstName,
            lastName: enriched.lastName,
            companyName: agg.supply.company,
            companyDomain: agg.supply.domain,
            introText: intro,
            contactTitle: enriched.title,
          });
          if (result.success) sentSupply++;
        } catch (err) {
          console.error('[Flow] Send failed:', agg.supply.domain, err);
        }

        setState(prev => ({
          ...prev,
          progress: { current: i + 1, total: supplyToSend.length, message: `Supply ${i + 1}/${supplyToSend.length}` },
        }));
      }
    }

    // Complete
    setState(prev => ({
      ...prev,
      step: 'complete',
      sentDemand,
      sentSupply,
    }));
  }, [state, settings]);

  // =============================================================================
  // HELPERS
  // =============================================================================

  async function fetchApifyDataset(datasetId: string, token: string): Promise<any[]> {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch dataset');
    return response.json();
  }

  const reset = () => {
    abortRef.current = true;
    setState({
      step: 'upload',
      isHubFlow: false,
      demandSchema: null,
      supplySchema: null,
      demandRecords: [],
      supplyRecords: [],
      matchingResult: null,
      enrichedDemand: new Map(),
      enrichedSupply: new Map(),
      demandIntros: new Map(),
      supplyIntros: new Map(),
      progress: { current: 0, total: 0, message: '' },
      sentDemand: 0,
      sentSupply: 0,
      error: null,
    });
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      {/* Back arrow */}
      <div className="px-8 pt-8">
        <button
          onClick={() => navigate('/launcher')}
          className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft size={18} className="text-white/50" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center pb-24">
        <div className="w-full max-w-[520px] px-6">
          <AnimatePresence mode="wait">

          {/* UPLOAD / START */}
          {state.step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="w-12 h-12 mx-auto mb-6 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center">
                <Workflow size={20} strokeWidth={1.5} className="text-white/80" />
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-2">Flow</h1>
              <p className="text-[13px] text-white/40 mb-10">Match · Enrich · Route</p>

              {state.error && (
                <div className="mb-6">
                  <p className="text-[12px] text-white/40 mb-3">{state.error}</p>
                  <button
                    onClick={() => navigate('/settings')}
                    className="text-[12px] text-white/50 hover:text-white/70 underline"
                  >
                    Open Settings
                  </button>
                </div>
              )}

              <button
                onClick={startFlow}
                disabled={!settings?.demandDatasetId}
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-30 transition-all"
              >
                Start
              </button>

            </motion.div>
          )}

          {/* VALIDATING */}
          {state.step === 'validating' && (
            <motion.div
              key="validating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-10 h-10 mx-auto mb-8 rounded-full border-2 border-white/10 border-t-white/60"
              />
              <p className="text-[13px] text-white/40">{state.progress.message}</p>
            </motion.div>
          )}

          {/* MATCHING */}
          {state.step === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.demandRecords.length}
              </div>
              <p className="text-[13px] text-white/40">
                {state.isHubFlow
                  ? 'Routing contacts to Flow...'
                  : 'signals loaded, matching...'}
              </p>
            </motion.div>
          )}

          {/* ENRICHING */}
          {state.step === 'enriching' && (
            <motion.div
              key="enriching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">Finding decision makers</p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
              <p className="mt-6 text-[11px] text-white/25">Safe to leave — progress saves</p>
            </motion.div>
          )}

          {/* GENERATING */}
          {state.step === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">
                {settings?.aiConfig ? 'Generating intros' : 'Building intros'}
              </p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* READY */}
          {state.step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">Ready to route</h1>

              {/* Surface existing state.error */}
              {state.error && (
                <p className="text-[12px] text-red-400/80 mb-4">{state.error}</p>
              )}

              <p className="text-[13px] text-white/40 mb-8">
                {state.matchingResult?.demandMatches.length || 0} demand · {state.matchingResult?.supplyAggregates.length || 0} supply
              </p>

              {/* Preview Section */}
              {state.matchingResult && (
                <div className="mb-8 space-y-6 max-w-[480px] mx-auto">

                  {/* Demand Previews */}
                  {state.matchingResult.demandMatches.slice(0, 2).map((match, idx) => {
                    const enriched = state.enrichedDemand.get(match.demand.domain);
                    const intro = state.demandIntros.get(match.demand.domain);
                    if (!enriched?.success || !intro) return null;

                    return (
                      <motion.div
                        key={`demand-${match.demand.domain}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                        className="text-left"
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-medium tracking-wide text-violet-400/80 uppercase">
                            Demand
                          </span>
                          <span className="text-[10px] text-white/20">→</span>
                          <span className="text-[11px] text-white/40 truncate">
                            {enriched.firstName} at {match.demand.company}
                          </span>
                        </div>

                        {/* Intro Card */}
                        <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] hover:border-white/[0.12] transition-colors">
                          <p className="text-[13px] leading-relaxed text-white/70">
                            {intro}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Supply Previews */}
                  {state.matchingResult.supplyAggregates.slice(0, 1).map((agg, idx) => {
                    const enriched = state.enrichedSupply.get(agg.supply.domain);
                    const intro = state.supplyIntros.get(agg.supply.domain);
                    if (!enriched?.success || !intro) return null;

                    return (
                      <motion.div
                        key={`supply-${agg.supply.domain}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                        className="text-left"
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-medium tracking-wide text-emerald-400/80 uppercase">
                            Supply
                          </span>
                          <span className="text-[10px] text-white/20">→</span>
                          <span className="text-[11px] text-white/40 truncate">
                            {enriched.firstName} at {agg.supply.company}
                          </span>
                          {agg.totalMatches > 1 && (
                            <span className="ml-auto text-[10px] text-white/30">
                              +{agg.totalMatches - 1} more matches
                            </span>
                          )}
                        </div>

                        {/* Intro Card */}
                        <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] hover:border-white/[0.12] transition-colors">
                          <p className="text-[13px] leading-relaxed text-white/70">
                            {intro}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* More indicator */}
                  {(state.matchingResult.demandMatches.length > 2 || state.matchingResult.supplyAggregates.length > 1) && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-[11px] text-white/25 text-center pt-2"
                    >
                      + {Math.max(0, state.matchingResult.demandMatches.length - 2 + state.matchingResult.supplyAggregates.length - 1)} more intros queued
                    </motion.p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-[13px] text-white/50 hover:text-white/70 transition-colors"
                >
                  Start over
                </button>
                <button
                  onClick={startSending}
                  className="px-5 py-2.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
                >
                  Route to Instantly
                </button>
              </div>
            </motion.div>
          )}

          {/* SENDING */}
          {state.step === 'sending' && (
            <motion.div
              key="sending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">{state.progress.message}</p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* COMPLETE */}
          {state.step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">Complete</h1>

              <p className="text-[13px] text-white/40 mb-10">
                {state.sentDemand} demand · {state.sentSupply} supply routed
              </p>

              <button
                onClick={reset}
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98]"
              >
                Run again
              </button>
            </motion.div>
          )}

          </AnimatePresence>
        </div>
      </div>

      {/* Dock */}
      <Dock />
    </div>
  );
}
