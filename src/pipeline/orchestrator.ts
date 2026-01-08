/**
 * PIPELINE ORCHESTRATOR
 *
 * Input → Match → Cache → Validate → Enrich → Store → Intro → Send
 *
 * One direction. One truth. One path.
 */

import type {
  RawInput,
  PipelineItem,
  PipelineState,
  PipelineMetrics,
  PipelineStage,
  MatchResult,
  CacheEntry,
  ValidationResult,
  EnrichmentResult,
  Intro,
  SendResult,
} from './contract';

// =============================================================================
// METRICS (for instrumentation)
// =============================================================================

const metrics: PipelineMetrics = {
  inputCount: 0,
  matchCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  validationPass: 0,
  validationFail: 0,
  apolloAttempts: 0,
  apolloSuccess: 0,
  anymailAttempts: 0,
  anymailSuccess: 0,
  introsGenerated: 0,
  sendSuccess: 0,
  sendFail: 0,
  blocked: 0,
};

export function getMetrics(): PipelineMetrics {
  return { ...metrics };
}

export function resetMetrics(): void {
  Object.keys(metrics).forEach(key => {
    (metrics as Record<string, number>)[key] = 0;
  });
}

function log(stage: PipelineStage, message: string, data?: unknown): void {
  console.log(`[Pipeline:${stage}] ${message}`, data ?? '');
}

// =============================================================================
// STAGE 1: MATCH
// =============================================================================

export async function stageMatch(
  demand: RawInput[],
  supply: RawInput[],
  matchFn: (d: RawInput, s: RawInput) => Promise<MatchResult | null>
): Promise<PipelineItem[]> {
  log('match', `Matching ${demand.length} demand × ${supply.length} supply`);
  metrics.inputCount = demand.length + supply.length;

  const items: PipelineItem[] = [];

  for (const d of demand) {
    for (const s of supply) {
      const match = await matchFn(d, s);

      if (match && match.confidence > 0) {
        metrics.matchCount++;
        items.push({
          demand: d,
          supply: s,
          currentStage: 'match',
          completedStages: ['input', 'match'],
          match,
          blocked: false,
        });
        log('match', `Match found: ${d.domain} ↔ ${s.domain}`, match.reason);
        break; // One match per demand
      }
    }
  }

  log('match', `${items.length} matches found`);
  return items;
}

// =============================================================================
// STAGE 2: CACHE CHECK
// =============================================================================

export async function stageCache(
  items: PipelineItem[],
  getCacheFn: (domain: string) => Promise<CacheEntry | null>
): Promise<PipelineItem[]> {
  log('cache', `Checking cache for ${items.length} items`);

  for (const item of items) {
    // Check demand cache
    const demandCache = await getCacheFn(item.demand.domain || '');
    if (demandCache) {
      metrics.cacheHits++;
      item.demandCache = demandCache;
      log('cache', `Cache hit (demand): ${item.demand.domain}`);
    } else {
      metrics.cacheMisses++;
    }

    // Check supply cache
    const supplyCache = await getCacheFn(item.supply.domain || '');
    if (supplyCache) {
      metrics.cacheHits++;
      item.supplyCache = supplyCache;
      log('cache', `Cache hit (supply): ${item.supply.domain}`);
    } else {
      metrics.cacheMisses++;
    }

    item.currentStage = 'cache';
    item.completedStages.push('cache');
  }

  return items;
}

// =============================================================================
// STAGE 3: VALIDATE
// =============================================================================

export async function stageValidate(
  items: PipelineItem[],
  validateFn: (email: string) => Promise<ValidationResult>
): Promise<PipelineItem[]> {
  log('validate', `Validating emails for ${items.length} items`);

  for (const item of items) {
    // Validate demand email
    const demandEmail = item.demandCache?.email || item.demand.email;
    if (demandEmail) {
      const result = await validateFn(demandEmail);
      item.demandValidation = result;
      if (result.valid) {
        metrics.validationPass++;
      } else {
        metrics.validationFail++;
      }
      log('validate', `Demand ${demandEmail}: ${result.status}`);
    }

    // Validate supply email
    const supplyEmail = item.supplyCache?.email || item.supply.email;
    if (supplyEmail) {
      const result = await validateFn(supplyEmail);
      item.supplyValidation = result;
      if (result.valid) {
        metrics.validationPass++;
      } else {
        metrics.validationFail++;
      }
      log('validate', `Supply ${supplyEmail}: ${result.status}`);
    }

    item.currentStage = 'validate';
    item.completedStages.push('validate');
  }

  return items;
}

// =============================================================================
// STAGE 4: ENRICH
// =============================================================================

export async function stageEnrich(
  items: PipelineItem[],
  enrichFn: (domain: string, name?: string) => Promise<EnrichmentResult>
): Promise<PipelineItem[]> {
  log('enrich', `Enriching ${items.length} items`);

  for (const item of items) {
    // Enrich demand if needed
    const demandNeedsEnrich =
      !item.demandCache?.email ||
      !item.demandValidation?.valid;

    if (demandNeedsEnrich) {
      metrics.apolloAttempts++;
      const result = await enrichFn(item.demand.domain || '', item.demand.name);
      item.demandEnrichment = result;

      if (result.success) {
        if (result.source === 'apollo') metrics.apolloSuccess++;
        else metrics.anymailSuccess++;
        log('enrich', `Demand enriched: ${item.demand.domain} via ${result.source}`);
      } else {
        log('enrich', `Demand enrichment failed: ${item.demand.domain}`);
      }
    }

    // Enrich supply if needed
    const supplyNeedsEnrich =
      !item.supplyCache?.email ||
      !item.supplyValidation?.valid;

    if (supplyNeedsEnrich) {
      metrics.apolloAttempts++;
      const result = await enrichFn(item.supply.domain || '', item.supply.name);
      item.supplyEnrichment = result;

      if (result.success) {
        if (result.source === 'apollo') metrics.apolloSuccess++;
        else metrics.anymailSuccess++;
        log('enrich', `Supply enriched: ${item.supply.domain} via ${result.source}`);
      } else {
        log('enrich', `Supply enrichment failed: ${item.supply.domain}`);
      }
    }

    // Block if no valid email on either side
    const demandEmail = item.demandEnrichment?.email || item.demandCache?.email || item.demand.email;
    const supplyEmail = item.supplyEnrichment?.email || item.supplyCache?.email || item.supply.email;

    if (!demandEmail || !supplyEmail) {
      item.blocked = true;
      item.blockReason = !demandEmail ? 'No demand email' : 'No supply email';
      metrics.blocked++;
      log('enrich', `BLOCKED: ${item.blockReason}`);
    }

    item.currentStage = 'enrich';
    item.completedStages.push('enrich');
  }

  return items;
}

// =============================================================================
// STAGE 5: STORE
// =============================================================================

export async function stageStore(
  items: PipelineItem[],
  storeFn: (entry: CacheEntry) => Promise<void>
): Promise<PipelineItem[]> {
  log('store', `Storing ${items.length} items to cache`);

  for (const item of items) {
    if (item.blocked) continue;

    // Store demand
    if (item.demandEnrichment?.success) {
      await storeFn({
        id: item.demand.id,
        domain: item.demand.domain || '',
        email: item.demandEnrichment.email,
        name: item.demandEnrichment.name,
        title: item.demandEnrichment.title,
        validated: true,
        enrichedAt: new Date().toISOString(),
        source: item.demandEnrichment.source,
      });
      log('store', `Stored demand: ${item.demand.domain}`);
    }

    // Store supply
    if (item.supplyEnrichment?.success) {
      await storeFn({
        id: item.supply.id,
        domain: item.supply.domain || '',
        email: item.supplyEnrichment.email,
        name: item.supplyEnrichment.name,
        title: item.supplyEnrichment.title,
        validated: true,
        enrichedAt: new Date().toISOString(),
        source: item.supplyEnrichment.source,
      });
      log('store', `Stored supply: ${item.supply.domain}`);
    }

    item.currentStage = 'store';
    item.completedStages.push('store');
  }

  return items;
}

// =============================================================================
// STAGE 6: INTRO
// =============================================================================

export async function stageIntro(
  items: PipelineItem[],
  introFn: (demand: RawInput, supply: RawInput, match: MatchResult) => Promise<Intro>
): Promise<PipelineItem[]> {
  log('intro', `Generating intros for ${items.length} items`);

  for (const item of items) {
    if (item.blocked) continue;

    const intro = await introFn(item.demand, item.supply, item.match!);
    item.intro = intro;
    metrics.introsGenerated++;
    log('intro', `Intro generated for ${item.demand.domain} ↔ ${item.supply.domain}`);

    item.currentStage = 'intro';
    item.completedStages.push('intro');
  }

  return items;
}

// =============================================================================
// STAGE 7: SEND
// =============================================================================

export async function stageSend(
  items: PipelineItem[],
  sendFn: (item: PipelineItem) => Promise<SendResult>
): Promise<PipelineItem[]> {
  log('send', `Sending ${items.length} items`);

  for (const item of items) {
    if (item.blocked) continue;

    const result = await sendFn(item);
    item.send = result;

    if (result.demandSent && result.supplySent) {
      metrics.sendSuccess++;
      log('send', `Sent: ${item.demand.domain} ↔ ${item.supply.domain}`);
    } else {
      metrics.sendFail++;
      log('send', `Send failed: ${result.error}`);
    }

    item.currentStage = 'send';
    item.completedStages.push('send');
  }

  return items;
}

// =============================================================================
// FULL PIPELINE (orchestrates all stages)
// =============================================================================

export interface PipelineDependencies {
  matchFn: (d: RawInput, s: RawInput) => Promise<MatchResult | null>;
  getCacheFn: (domain: string) => Promise<CacheEntry | null>;
  validateFn: (email: string) => Promise<ValidationResult>;
  enrichFn: (domain: string, name?: string) => Promise<EnrichmentResult>;
  storeFn: (entry: CacheEntry) => Promise<void>;
  introFn: (demand: RawInput, supply: RawInput, match: MatchResult) => Promise<Intro>;
  sendFn: (item: PipelineItem) => Promise<SendResult>;
  onProgress?: (stage: PipelineStage, items: PipelineItem[]) => void;
}

export async function runPipeline(
  demand: RawInput[],
  supply: RawInput[],
  deps: PipelineDependencies
): Promise<PipelineItem[]> {
  resetMetrics();
  log('input', `Starting pipeline: ${demand.length} demand, ${supply.length} supply`);

  // Stage 1: Match
  let items = await stageMatch(demand, supply, deps.matchFn);
  deps.onProgress?.('match', items);

  if (items.length === 0) {
    log('input', 'No matches found. Pipeline complete.');
    return items;
  }

  // Stage 2: Cache
  items = await stageCache(items, deps.getCacheFn);
  deps.onProgress?.('cache', items);

  // Stage 3: Validate
  items = await stageValidate(items, deps.validateFn);
  deps.onProgress?.('validate', items);

  // Stage 4: Enrich
  items = await stageEnrich(items, deps.enrichFn);
  deps.onProgress?.('enrich', items);

  // Stage 5: Store
  items = await stageStore(items, deps.storeFn);
  deps.onProgress?.('store', items);

  // Stage 6: Intro
  items = await stageIntro(items, deps.introFn);
  deps.onProgress?.('intro', items);

  // Stage 7: Send
  items = await stageSend(items, deps.sendFn);
  deps.onProgress?.('send', items);

  log('send', `Pipeline complete. Metrics:`, getMetrics());
  return items;
}
