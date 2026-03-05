/**
 * TOP-K RETRIEVAL — pgvector cosine similarity search
 *
 * Replaces keyword overlap pre-filter (pairGeneration.ts).
 * For each demand signal, finds the K nearest supply signals
 * by embedding similarity. Pure vector math, no AI calls.
 *
 * Rules:
 *   - Embeddings encode wants↔offers only (never context)
 *   - Default K = 30
 *   - Hard gates apply before retrieval (no intent = exclude)
 */

import type { CanonicalSignal } from '../dmcb/types';
import { supabase } from '../lib/supabase';
import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// TYPES
// =============================================================================

export interface CandidatePair {
  evalId: string;
  demandSignal: CanonicalSignal;
  supplySignal: CanonicalSignal;
  similarity: number; // cosine similarity from pgvector (0-1)
}

// =============================================================================
// EVAL ID (deterministic, same as before)
// =============================================================================

function generateEvalId(demandKey: string, supplyKey: string): string {
  return `mcp_${simpleHash(`${demandKey}|${supplyKey}`)}`;
}

// =============================================================================
// TOP-K QUERY VIA RPC
// =============================================================================

async function queryTopKForDemand(
  demandKey: string,
  jobId: string,
  k: number,
): Promise<{ supply_key: string; similarity: number }[]> {
  const { data, error } = await supabase.rpc('match_supply_for_demand', {
    demand_key: demandKey,
    match_job_id: jobId,
    match_count: k,
  });

  if (error) {
    console.warn(`[topK] RPC error for ${demandKey}:`, error.message);
    return [];
  }

  return data || [];
}

// =============================================================================
// RETRIEVE TOP-K PAIRS
// =============================================================================

export interface TopKRetrievalParams {
  demandSignals: CanonicalSignal[];
  supplySignals: CanonicalSignal[];
  jobId: string; // embedding job ID (embed-{dmcbJobId})
  k?: number;
}

export async function retrieveTopKPairs(
  params: TopKRetrievalParams,
): Promise<CandidatePair[]> {
  const { demandSignals, supplySignals, jobId, k = 30 } = params;

  if (demandSignals.length === 0 || supplySignals.length === 0) {
    console.log('[topK] No pairs — demand:', demandSignals.length, 'supply:', supplySignals.length);
    return [];
  }

  console.log(`[topK] Retrieving top-${k} for ${demandSignals.length} demand signals`);

  // Build supply lookup by recordKey
  const supplyByKey = new Map<string, CanonicalSignal>();
  for (const s of supplySignals) {
    supplyByKey.set(s.recordKey, s);
  }

  // Query top-K for each demand signal (parallel, batched)
  const CONCURRENCY = 10;
  const allPairs: CandidatePair[] = [];

  for (let i = 0; i < demandSignals.length; i += CONCURRENCY) {
    const chunk = demandSignals.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      chunk.map(async (demand) => {
        const matches = await queryTopKForDemand(demand.recordKey, jobId, k);
        return matches.map((m) => {
          const supply = supplyByKey.get(m.supply_key);
          if (!supply) return null;
          return {
            evalId: generateEvalId(demand.recordKey, supply.recordKey),
            demandSignal: demand,
            supplySignal: supply,
            similarity: m.similarity,
          };
        }).filter(Boolean) as CandidatePair[];
      }),
    );

    for (const pairs of results) {
      allPairs.push(...pairs);
    }
  }

  // Sort by similarity descending
  allPairs.sort((a, b) => b.similarity - a.similarity);

  console.log(`[topK] Generated ${allPairs.length} candidate pairs (${demandSignals.length} demand × top-${k})`);

  return allPairs;
}
