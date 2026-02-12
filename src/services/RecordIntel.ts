/**
 * RecordIntel.ts — Step 0: Extract structured intel from raw records
 *
 * Runs ONCE per record before intro generation. Cheap AI call that turns
 * raw LinkedIn bios and press-release headlines into clean, structured fields.
 *
 * Cost: ~$0.001/record (gpt-4o-mini) or ~$0.005/record (gpt-4o)
 * Cache: in-memory Map, keyed by recordKey. Never re-extracts same record.
 */

import { callAI, type IntroAIConfig } from './IntroAI';

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedIntel {
  capability: string;       // "freight forwarding, air & sea, US nationwide"
  signalSummary: string;    // "hired new CTO"
  signalQuality: 'high' | 'low' | 'noise';
}

interface RecordInput {
  company: string;
  companyDescription?: string | null;
  signal?: string | null;
  headline?: string | null;
}

// =============================================================================
// CACHE — in-memory, keyed by recordKey
// =============================================================================

const cache = new Map<string, ExtractedIntel>();

export function getCachedIntel(key: string): ExtractedIntel | null {
  return cache.get(key) || null;
}

export function clearIntelCache(): void {
  cache.clear();
}

// =============================================================================
// EXTRACTION PROMPT — tiny, structured, one-shot
// =============================================================================

function buildExtractionPrompt(record: RecordInput): string {
  const description = (record.companyDescription || record.headline || '').slice(0, 300);
  const signal = (record.signal || '').slice(0, 200);

  return `Extract structured data from this company record. Be concrete and specific — no corporate jargon.

COMPANY: ${record.company}
DESCRIPTION: ${description}
SIGNAL: ${signal}

Extract these 3 fields:

1. capability: What does this company actually DO? Not marketing copy — the core service or product in plain English. 12 words max.
   Good: "freight forwarding, air and sea, US nationwide"
   Good: "AI-powered margin forecasting for grocery retailers"
   Good: "cross-border payment settlement for banks"
   Bad: "premier asset fund investing in the next frontier" (marketing copy)
   Bad: "transforming cross-border payments" (vague verb + buzzword)

2. signalSummary: What happened? Rephrase the SIGNAL as a plain fact. 8 words max. If signal is empty or a generic tagline, write "active in market".
   Good: "hired new CTO"
   Good: "launched settlement tool for banks"
   Good: "raised Series A funding"
   Bad: "Business partnerships solving humanity's most complex issues" (tagline, not event)
   Bad: "002. Product Development Cycle, w/ Iván Arroyo" (podcast title, not event)

3. signalQuality: Is this signal about a real event at THIS company?
   "high" = company-specific event (hired someone, raised funding, launched product, expanded, acquired)
   "low" = vaguely related (industry news mentioning them, general market trend)
   "noise" = not about this company (podcast episode, generic tagline, press release about something else, truncated headline)

Output JSON only, no explanation:
{"capability": "...", "signalSummary": "...", "signalQuality": "high"}`;
}

// =============================================================================
// SINGLE EXTRACTION
// =============================================================================

export async function extractRecordIntel(
  config: IntroAIConfig,
  record: RecordInput,
  cacheKey: string,
): Promise<ExtractedIntel> {
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const prompt = buildExtractionPrompt(record);
    const raw = await callAI(config, prompt);

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    const intel: ExtractedIntel = {
      capability: String(parsed.capability || '').slice(0, 150),
      signalSummary: String(parsed.signalSummary || '').slice(0, 100),
      signalQuality: ['high', 'low', 'noise'].includes(parsed.signalQuality) ? parsed.signalQuality : 'low',
    };

    cache.set(cacheKey, intel);
    return intel;
  } catch (err: any) {
    // Extraction failed — return passthrough (raw data flows through as before)
    console.log(`[RecordIntel] Extraction failed for ${record.company}: ${err.message?.slice(0, 100)}`);
    const fallback: ExtractedIntel = {
      capability: (record.companyDescription || record.headline || '').slice(0, 100),
      signalSummary: record.signal || 'active in market',
      signalQuality: 'low',
    };
    cache.set(cacheKey, fallback);
    return fallback;
  }
}

// =============================================================================
// BATCH EXTRACTION — bounded concurrency
// =============================================================================

export async function extractBatch(
  config: IntroAIConfig,
  records: Array<{ record: RecordInput; cacheKey: string }>,
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, ExtractedIntel>> {
  const results = new Map<string, ExtractedIntel>();

  // Filter out already-cached records
  const uncached = records.filter(r => !cache.has(r.cacheKey));
  const alreadyCached = records.filter(r => cache.has(r.cacheKey));

  // Add cached results immediately
  for (const r of alreadyCached) {
    results.set(r.cacheKey, cache.get(r.cacheKey)!);
  }

  if (uncached.length === 0) {
    console.log(`[RecordIntel] All ${records.length} records cached, skipping extraction`);
    return results;
  }

  console.log(`[RecordIntel] Extracting ${uncached.length} records (${alreadyCached.length} cached), concurrency=${concurrency}`);

  let completed = 0;

  // Process in chunks
  for (let i = 0; i < uncached.length; i += concurrency) {
    const chunk = uncached.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map(async ({ record, cacheKey }) => {
        const intel = await extractRecordIntel(config, record, cacheKey);
        completed++;
        onProgress?.(completed, uncached.length);
        return { cacheKey, intel };
      }),
    );

    for (const { cacheKey, intel } of chunkResults) {
      results.set(cacheKey, intel);
    }
  }

  console.log(`[RecordIntel] Extraction complete: ${completed} records processed`);
  return results;
}
