/**
 * INTELLIGENCE SERVICE
 *
 * Client-side service for Platform Intelligence.
 * SCAN mode: Find companies matching ICP description via Exa
 *
 * BYOK (Bring Your Own Keys) - Users configure their own API keys in Settings.
 */

import type {
  IntelligenceResponse,
  IntelligenceResult,
  IntelligenceNode,
  IntelligenceEdge,
} from './types';

// =============================================================================
// CONFIG
// =============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INTELLIGENCE_ENDPOINT = `${SUPABASE_URL}/functions/v1/platform-intelligence`;

// Local cache for instant repeat queries
const localCache = new Map<string, { response: IntelligenceResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes local cache

// =============================================================================
// API
// =============================================================================

export interface IntelligenceQuery {
  query: string;
  prospectDomain?: string;
  numResults?: number;
  includeContacts?: boolean;
}

// AI Provider types (matches Settings)
export type AIProvider = 'openai' | 'azure' | 'anthropic';

export interface IntelligenceKeys {
  exaKey: string;
  apolloKey?: string;
  // AI Configuration
  aiProvider: AIProvider;
  aiKey: string;  // The API key for the selected provider
  // Azure-specific (only needed when aiProvider === 'azure')
  azureEndpoint?: string;
  azureDeployment?: string;
}

/**
 * Build headers for AI provider (BYOK)
 */
function buildAIHeaders(keys: IntelligenceKeys): Record<string, string> {
  const headers: Record<string, string> = {
    'x-ai-provider': keys.aiProvider,
  };

  switch (keys.aiProvider) {
    case 'openai':
      headers['x-openai-key'] = keys.aiKey;
      break;
    case 'azure':
      headers['x-azure-key'] = keys.aiKey;
      if (keys.azureEndpoint) headers['x-azure-endpoint'] = keys.azureEndpoint;
      if (keys.azureDeployment) headers['x-azure-deployment'] = keys.azureDeployment;
      break;
    case 'anthropic':
      headers['x-anthropic-key'] = keys.aiKey;
      break;
  }

  return headers;
}

/**
 * Query the intelligence API (BYOK - sends user's keys in headers)
 */
export async function queryIntelligence(
  params: IntelligenceQuery,
  keys: IntelligenceKeys
): Promise<IntelligenceResponse> {
  const { query, prospectDomain, numResults = 5, includeContacts = true } = params;

  // Check local cache first
  const cacheKey = `${query}|${prospectDomain || ''}|${numResults}`;
  const cached = localCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('[Intelligence] Local cache hit');
    return {
      ...cached.response,
      meta: { ...cached.response.meta, cached: true },
    };
  }

  // Build AI-specific headers (BYOK)
  const aiHeaders = buildAIHeaders(keys);

  console.log('[IntelligenceService] queryIntelligence called');
  console.log('[IntelligenceService] keys.apolloKey:', keys.apolloKey ? `${keys.apolloKey.slice(0,8)}...` : 'EMPTY/UNDEFINED');
  console.log('[IntelligenceService] includeContacts param:', includeContacts);
  console.log('[IntelligenceService] will send x-apollo-key header:', !!keys.apolloKey);
  console.log('[IntelligenceService] body.includeContacts will be:', includeContacts && !!keys.apolloKey);

  // Call the edge function with user's keys
  const response = await fetch(INTELLIGENCE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-exa-key': keys.exaKey,
      ...aiHeaders,
      ...(keys.apolloKey ? { 'x-apollo-key': keys.apolloKey } : {}),
    },
    body: JSON.stringify({
      query,
      prospectDomain,
      numResults,
      includeContacts: includeContacts && !!keys.apolloKey,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Intelligence API error: ${response.status} - ${error}`);
  }

  const data: IntelligenceResponse = await response.json();

  // Cache successful responses
  if (data.success && data.results.length > 0) {
    localCache.set(cacheKey, { response: data, timestamp: Date.now() });
  }

  return data;
}

// =============================================================================
// GRAPH TRANSFORMATION
// =============================================================================

/**
 * Transform intelligence results into graph nodes and edges
 */
export function toGraph(
  query: string,
  results: IntelligenceResult[]
): { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] } {
  const nodes: IntelligenceNode[] = [];
  const edges: IntelligenceEdge[] = [];

  // Query node (center)
  const queryNode: IntelligenceNode = {
    id: 'query',
    type: 'query',
    label: query.length > 40 ? query.slice(0, 37) + '...' : query,
  };
  nodes.push(queryNode);

  // Company and contact nodes
  results.forEach((result, i) => {
    const companyId = `company-${i}`;

    // Company node
    const companyNode: IntelligenceNode = {
      id: companyId,
      type: 'company',
      label: result.company.companyName,
      sublabel: result.company.signalTitle,
      score: result.company.matchScore,
      signalType: result.company.signalType,
      sourceType: result.company.sourceType,
      data: result,
    };
    nodes.push(companyNode);

    // Edge from query to company
    edges.push({
      source: 'query',
      target: companyId,
      label: `${result.company.matchScore}%`,
    });

    // Contact node (if exists)
    if (result.contact?.fullName) {
      const contactId = `contact-${i}`;
      const contactNode: IntelligenceNode = {
        id: contactId,
        type: 'contact',
        label: result.contact.fullName,
        sublabel: result.contact.title || undefined,
      };
      nodes.push(contactNode);

      // Edge from company to contact
      edges.push({
        source: companyId,
        target: contactId,
      });
    }
  });

  return { nodes, edges };
}

// =============================================================================
// SIGNAL TYPE UTILITIES
// =============================================================================

export const SIGNAL_TYPE_CONFIG = {
  funding: { label: 'Funding', color: '#10b981', icon: '💰' },
  exec_change: { label: 'Exec Change', color: '#f59e0b', icon: '👤' },
  hiring: { label: 'Hiring', color: '#3b82f6', icon: '💼' },
  acquisition: { label: 'Acquisition', color: '#8b5cf6', icon: '🤝' },
  certification: { label: 'Certification', color: '#06b6d4', icon: '✓' },
  expansion: { label: 'Expansion', color: '#ec4899', icon: '📈' },
  partnership: { label: 'Partnership', color: '#6366f1', icon: '🔗' },
  other: { label: 'Signal', color: '#6b7280', icon: '•' },
} as const;

export const SOURCE_TYPE_CONFIG = {
  company_page: { label: 'Direct', color: '#10b981' },
  news: { label: 'News', color: '#f59e0b' },
  job_posting: { label: 'Job', color: '#3b82f6' },
  press_release: { label: 'PR', color: '#8b5cf6' },
} as const;

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

export function clearLocalCache(): void {
  localCache.clear();
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: localCache.size,
    keys: Array.from(localCache.keys()),
  };
}
