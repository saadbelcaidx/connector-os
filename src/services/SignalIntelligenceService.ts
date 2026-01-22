/**
 * SignalIntelligenceService.ts
 *
 * AI-powered extraction of needs and capabilities from signal data.
 * Runs at ingestion, caches results, replaces keyword-based categorization.
 *
 * PATTERN: AI extracts once, results cached, display uses cached data.
 */

import { callAI, AI_ENABLED } from './AIService';
import type { AIConfig } from './AIService';

// =============================================================================
// PERFORMANCE CONSTANTS
// =============================================================================

const MAX_SAMPLE = 50;        // Only analyze first 50 records for preview (cache handles rest)
const PARALLEL_BATCH = 10;    // Process 10 AI calls concurrently (safe for all providers)

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedNeed {
  domain: string;
  signalText: string;
  extractedNeed: string;       // AI-extracted: "Pharma co-development partner"
  needCategory: string;        // AI-extracted: "Partnership-ready"
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedCapability {
  domain: string;
  capabilityText: string;
  extractedCapability: string; // AI-extracted: "Deal origination, pharma relationships"
  capabilityCategory: string;  // AI-extracted: "Pharma BD access"
  confidence: 'high' | 'medium' | 'low';
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
  description?: string;        // First extracted need/capability in this category
}

export interface ExtractionResult {
  demandBreakdown: CategoryBreakdown[];
  supplyBreakdown: CategoryBreakdown[];
  detectedMatchType: string;
  demandTotal: number;
  supplyTotal: number;
  extractedNeeds: ExtractedNeed[];
  extractedCapabilities: ExtractedCapability[];
}

// =============================================================================
// CACHE
// =============================================================================

const CACHE_KEY_NEEDS = 'signal_intelligence_needs';
const CACHE_KEY_CAPABILITIES = 'signal_intelligence_capabilities';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCachedNeeds(): Map<string, ExtractedNeed> {
  try {
    const raw = localStorage.getItem(CACHE_KEY_NEEDS);
    if (!raw) return new Map();
    const entry: CacheEntry<[string, ExtractedNeed][]> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_NEEDS);
      return new Map();
    }
    return new Map(entry.data);
  } catch {
    return new Map();
  }
}

function getCachedCapabilities(): Map<string, ExtractedCapability> {
  try {
    const raw = localStorage.getItem(CACHE_KEY_CAPABILITIES);
    if (!raw) return new Map();
    const entry: CacheEntry<[string, ExtractedCapability][]> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_CAPABILITIES);
      return new Map();
    }
    return new Map(entry.data);
  } catch {
    return new Map();
  }
}

function cacheNeeds(needs: Map<string, ExtractedNeed>): void {
  const entry: CacheEntry<[string, ExtractedNeed][]> = {
    data: Array.from(needs.entries()),
    timestamp: Date.now(),
  };
  localStorage.setItem(CACHE_KEY_NEEDS, JSON.stringify(entry));
}

function cacheCapabilities(caps: Map<string, ExtractedCapability>): void {
  const entry: CacheEntry<[string, ExtractedCapability][]> = {
    data: Array.from(caps.entries()),
    timestamp: Date.now(),
  };
  localStorage.setItem(CACHE_KEY_CAPABILITIES, JSON.stringify(entry));
}

function hashSignal(domain: string, signal: string): string {
  return `${domain}:${signal.slice(0, 100)}`;
}

// =============================================================================
// PROMPTS
// =============================================================================

const DEMAND_EXTRACTION_PROMPT = `You are analyzing a business signal to understand what a company needs.

Signal: "{SIGNAL}"
Company: "{COMPANY}"

Extract:
1. NEED: What does this company need right now? (1 sentence, specific)
2. CATEGORY: One of these categories that best fits:
   - Partnership-ready (seeking partners, co-development, licensing)
   - Scaling (hiring, expanding, growing team)
   - Funding (raised money, seeking investment)
   - Regulatory (FDA, compliance, approval)
   - Technology (adopting tech, building platform)
   - General (none of the above)

Respond in this exact format:
NEED: [extracted need]
CATEGORY: [category name]`;

const SUPPLY_EXTRACTION_PROMPT = `You are analyzing a service provider to understand what they can deliver.

Service: "{SERVICE}"
Company: "{COMPANY}"

Extract:
1. CAPABILITY: What can this provider deliver? (1 sentence, specific)
2. CATEGORY: One of these categories that best fits:
   - BD/Licensing (deal origination, pharma partnerships, licensing)
   - Recruiting (talent acquisition, executive search, staffing)
   - Consulting (advisory, strategy, fractional)
   - Technology (software, development, implementation)
   - Finance (CFO, accounting, investment)
   - Legal (attorneys, compliance, IP)
   - General (none of the above)

Respond in this exact format:
CAPABILITY: [extracted capability]
CATEGORY: [category name]`;

// =============================================================================
// EXTRACTION
// =============================================================================

function parseNeedResponse(response: string, domain: string, signalText: string): ExtractedNeed {
  const needMatch = response.match(/NEED:\s*(.+?)(?:\n|$)/i);
  const categoryMatch = response.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);

  return {
    domain,
    signalText,
    extractedNeed: needMatch?.[1]?.trim() || signalText,
    needCategory: categoryMatch?.[1]?.trim() || 'General',
    confidence: needMatch && categoryMatch ? 'high' : 'low',
  };
}

function parseCapabilityResponse(response: string, domain: string, capabilityText: string): ExtractedCapability {
  const capMatch = response.match(/CAPABILITY:\s*(.+?)(?:\n|$)/i);
  const categoryMatch = response.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);

  return {
    domain,
    capabilityText,
    extractedCapability: capMatch?.[1]?.trim() || capabilityText,
    capabilityCategory: categoryMatch?.[1]?.trim() || 'General',
    confidence: capMatch && categoryMatch ? 'high' : 'low',
  };
}

export async function extractDemandNeeds(
  records: { domain: string; signal: string; company: string }[],
  aiConfig: AIConfig,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedNeed[]> {
  if (!AI_ENABLED(aiConfig)) {
    throw new Error('AI not configured');
  }

  const cache = getCachedNeeds();
  const results: ExtractedNeed[] = [];
  const toExtract: typeof records = [];

  // Check cache first
  for (const record of records) {
    const key = hashSignal(record.domain, record.signal);
    const cached = cache.get(key);
    if (cached) {
      results.push(cached);
    } else {
      toExtract.push(record);
    }
  }

  // PERF: Sample first MAX_SAMPLE for preview, use keyword fallback for rest
  const sampled = toExtract.slice(0, MAX_SAMPLE);
  const skipped = toExtract.slice(MAX_SAMPLE);

  // Add skipped records with keyword-based categorization (no AI call)
  for (const record of skipped) {
    results.push({
      domain: record.domain,
      signalText: record.signal,
      extractedNeed: record.signal,
      needCategory: categorizeByKeyword(record.signal),
      confidence: 'low',
    });
  }

  // PERF: Process in parallel batches of PARALLEL_BATCH
  let processed = results.length;
  for (let i = 0; i < sampled.length; i += PARALLEL_BATCH) {
    const batch = sampled.slice(i, i + PARALLEL_BATCH);

    const batchResults = await Promise.all(
      batch.map(async (record) => {
        try {
          const prompt = DEMAND_EXTRACTION_PROMPT
            .replace('{SIGNAL}', record.signal.slice(0, 500))
            .replace('{COMPANY}', record.company.slice(0, 100));

          const response = await callAI(aiConfig, prompt);
          const extracted = parseNeedResponse(response, record.domain, record.signal);
          cache.set(hashSignal(record.domain, record.signal), extracted);
          return extracted;
        } catch (err) {
          // On failure, use raw signal as fallback
          return {
            domain: record.domain,
            signalText: record.signal,
            extractedNeed: record.signal,
            needCategory: 'General',
            confidence: 'low' as const,
          };
        }
      })
    );

    results.push(...batchResults);
    processed += batch.length;
    onProgress?.(processed, records.length);
  }

  // Update cache
  cacheNeeds(cache);

  return results;
}

// Simple keyword-based categorization fallback
function categorizeByKeyword(signal: string): string {
  const s = signal.toLowerCase();
  if (/engineer|developer|software|tech|devops|frontend|backend|fullstack/i.test(s)) return 'Engineering';
  if (/sales|account executive|sdr|bdr|revenue|ae\b/i.test(s)) return 'Sales';
  if (/marketing|growth|brand|content|seo/i.test(s)) return 'Marketing';
  if (/product|pm\b|product manager/i.test(s)) return 'Product';
  if (/design|ux|ui|creative/i.test(s)) return 'Design';
  if (/hr|human resources|people|talent|recruiter/i.test(s)) return 'HR/People';
  if (/finance|cfo|accounting|controller/i.test(s)) return 'Finance';
  if (/operations|ops|coo|supply chain/i.test(s)) return 'Operations';
  if (/legal|counsel|compliance/i.test(s)) return 'Legal';
  if (/ceo|founder|executive|vp|director|head of/i.test(s)) return 'Leadership';
  return 'General';
}

export async function extractSupplyCapabilities(
  records: { domain: string; service: string; company: string }[],
  aiConfig: AIConfig,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedCapability[]> {
  if (!AI_ENABLED(aiConfig)) {
    throw new Error('AI not configured');
  }

  const cache = getCachedCapabilities();
  const results: ExtractedCapability[] = [];
  const toExtract: typeof records = [];

  // Check cache first
  for (const record of records) {
    const key = hashSignal(record.domain, record.service);
    const cached = cache.get(key);
    if (cached) {
      results.push(cached);
    } else {
      toExtract.push(record);
    }
  }

  // PERF: Sample first MAX_SAMPLE for preview, use keyword fallback for rest
  const sampled = toExtract.slice(0, MAX_SAMPLE);
  const skipped = toExtract.slice(MAX_SAMPLE);

  // Add skipped records with keyword-based categorization (no AI call)
  for (const record of skipped) {
    results.push({
      domain: record.domain,
      capabilityText: record.service,
      extractedCapability: record.service,
      capabilityCategory: categorizeSupplyByKeyword(record.service, record.company),
      confidence: 'low',
    });
  }

  // PERF: Process in parallel batches of PARALLEL_BATCH
  let processed = results.length;
  for (let i = 0; i < sampled.length; i += PARALLEL_BATCH) {
    const batch = sampled.slice(i, i + PARALLEL_BATCH);

    const batchResults = await Promise.all(
      batch.map(async (record) => {
        try {
          const prompt = SUPPLY_EXTRACTION_PROMPT
            .replace('{SERVICE}', record.service.slice(0, 500))
            .replace('{COMPANY}', record.company.slice(0, 100));

          const response = await callAI(aiConfig, prompt);
          const extracted = parseCapabilityResponse(response, record.domain, record.service);
          cache.set(hashSignal(record.domain, record.service), extracted);
          return extracted;
        } catch (err) {
          // On failure, use raw service description as fallback
          return {
            domain: record.domain,
            capabilityText: record.service,
            extractedCapability: record.service,
            capabilityCategory: 'General',
            confidence: 'low' as const,
          };
        }
      })
    );

    results.push(...batchResults);
    processed += batch.length;
    onProgress?.(processed, records.length);
  }

  // Update cache
  cacheCapabilities(cache);

  return results;
}

// Simple keyword-based categorization for supply
function categorizeSupplyByKeyword(service: string, company: string): string {
  const s = (service + ' ' + company).toLowerCase();
  if (/recruit|staffing|talent|hiring|headhunt|placement/i.test(s)) return 'Recruiting';
  if (/marketing|growth|brand|agency|creative|content|seo|ads/i.test(s)) return 'Marketing';
  if (/software|dev|engineer|tech|saas|platform|app/i.test(s)) return 'Engineering';
  if (/sales|revenue|pipeline|outbound|lead gen/i.test(s)) return 'Sales';
  if (/consult|advisory|strategy/i.test(s)) return 'Consulting';
  if (/finance|accounting|cfo|bookkeep/i.test(s)) return 'Finance';
  if (/legal|law|attorney|compliance/i.test(s)) return 'Legal';
  if (/hr|human resources|people ops|payroll/i.test(s)) return 'HR';
  if (/design|ux|ui|creative|graphic/i.test(s)) return 'Design';
  if (/operations|ops|logistics|supply chain/i.test(s)) return 'Operations';
  return 'General';
}

// =============================================================================
// GROUPING
// =============================================================================

export function groupNeedsByCategory(needs: ExtractedNeed[]): CategoryBreakdown[] {
  const groups: Record<string, { count: number; firstNeed: string }> = {};

  for (const need of needs) {
    const cat = need.needCategory;
    if (!groups[cat]) {
      groups[cat] = { count: 0, firstNeed: need.extractedNeed };
    }
    groups[cat].count++;
  }

  if (needs.length === 0) return [];

  return Object.entries(groups)
    .map(([category, { count, firstNeed }]) => ({
      category,
      count,
      percentage: Math.round((count / needs.length) * 100),
      description: firstNeed,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

export function groupCapabilitiesByCategory(capabilities: ExtractedCapability[]): CategoryBreakdown[] {
  if (capabilities.length === 0) return [];

  const groups: Record<string, { count: number; firstCap: string }> = {};

  for (const cap of capabilities) {
    const cat = cap.capabilityCategory;
    if (!groups[cat]) {
      groups[cat] = { count: 0, firstCap: cap.extractedCapability };
    }
    groups[cat].count++;
  }

  return Object.entries(groups)
    .map(([category, { count, firstCap }]) => ({
      category,
      count,
      percentage: Math.round((count / capabilities.length) * 100),
      description: firstCap,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

export function detectMatchType(
  demandBreakdown: CategoryBreakdown[],
  supplyBreakdown: CategoryBreakdown[]
): string {
  const topDemand = demandBreakdown[0]?.category || 'Companies';
  const topSupply = supplyBreakdown[0]?.category || 'Providers';

  // Clean display
  const demandLabel = topDemand === 'General' ? 'Companies' : topDemand;
  const supplyLabel = topSupply === 'General' ? 'Providers' : topSupply;

  return `${demandLabel} → ${supplyLabel}`;
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

export async function extractSignalIntelligence(
  demandRecords: { domain: string; signal: string; company: string; title?: string; companyDescription?: string }[],
  supplyRecords: { domain: string; company: string; title?: string; companyDescription?: string }[],
  aiConfig: AIConfig,
  onProgress?: (message: string, current: number, total: number) => void
): Promise<ExtractionResult> {
  const total = demandRecords.length + supplyRecords.length;
  let completed = 0;

  // Extract demand needs
  onProgress?.('Analyzing demand signals...', 0, total);
  const extractedNeeds = await extractDemandNeeds(
    demandRecords.map(r => ({
      domain: r.domain,
      signal: r.signal || r.title || '',
      company: r.company,
    })),
    aiConfig,
    (current) => {
      completed = current;
      onProgress?.('Analyzing demand signals...', completed, total);
    }
  );

  // Extract supply capabilities
  onProgress?.('Analyzing supply capabilities...', completed, total);
  const extractedCapabilities = await extractSupplyCapabilities(
    supplyRecords.map(r => ({
      domain: r.domain,
      service: r.title || r.companyDescription || '',
      company: r.company,
    })),
    aiConfig,
    (current) => {
      completed = demandRecords.length + current;
      onProgress?.('Analyzing supply capabilities...', completed, total);
    }
  );

  // Group by category
  const demandBreakdown = groupNeedsByCategory(extractedNeeds);
  const supplyBreakdown = groupCapabilitiesByCategory(extractedCapabilities);
  const detectedMatchType = detectMatchType(demandBreakdown, supplyBreakdown);

  return {
    demandBreakdown,
    supplyBreakdown,
    detectedMatchType,
    demandTotal: demandRecords.length,
    supplyTotal: supplyRecords.length,
    extractedNeeds,
    extractedCapabilities,
  };
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

export function clearSignalIntelligenceCache(): void {
  localStorage.removeItem(CACHE_KEY_NEEDS);
  localStorage.removeItem(CACHE_KEY_CAPABILITIES);
}
