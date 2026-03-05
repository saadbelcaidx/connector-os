/**
 * PAIR GENERATION — Top-K retrieval from pgvector embeddings
 *
 * Replaces keyword overlap pre-filter with embedding-based retrieval.
 * For each demand signal, finds the K nearest supply signals
 * by cosine similarity on wants↔offers embeddings.
 *
 * NO caps. NO MAX_PAIRS. Every pair that top-K returns gets evaluated.
 *
 * Rules:
 *   - wants↔offers = complements (match). context↔context = competitors.
 *   - Supply side uses "offers" label (enforced downstream).
 *   - Pair generation is deterministic given same embeddings.
 */

import type { CanonicalSignal } from '../dmcb/types';
import { retrieveTopKPairs } from './topKRetrieval';
import type { CandidatePair } from './topKRetrieval';

// Re-export CandidatePair for downstream consumers
export type { CandidatePair } from './topKRetrieval';

// =============================================================================
// PAIR GENERATION VIA TOP-K
// =============================================================================

export interface GeneratePairsParams {
  signals: CanonicalSignal[];
  embeddingJobId: string;
  k?: number;
}

export async function generateCandidatePairs(
  params: GeneratePairsParams,
): Promise<CandidatePair[]> {
  const { signals, embeddingJobId, k = 30 } = params;

  const demand = signals.filter(s => s.side === 'demand');
  const supply = signals.filter(s => s.side === 'supply');

  if (demand.length === 0 || supply.length === 0) {
    console.log('[pairGen] No pairs — demand:', demand.length, 'supply:', supply.length);
    return [];
  }

  console.log(`[pairGen] Top-${k} retrieval: ${demand.length} demand × ${supply.length} supply pool`);

  const pairs = await retrieveTopKPairs({
    demandSignals: demand,
    supplySignals: supply,
    jobId: embeddingJobId,
    k,
  });

  console.log(`[pairGen] Generated ${pairs.length} candidate pairs`);

  return pairs;
}
