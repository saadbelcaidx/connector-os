/**
 * dmcbAiExtract — Client module for the dmcb-extract edge function (Phase 37)
 *
 * Simple fetch wrapper. No throws to Station — all errors become per-item error objects.
 * No retries. Retries are handled by AIRequestQueue if needed upstream.
 */

export type DMCBAIConfig = {
  provider: 'openai' | 'azure' | 'anthropic';
  model?: string;
  openaiApiKey?: string;
  azureApiKey?: string;
  azureEndpoint?: string;
  azureChatDeployment?: string;
  anthropicApiKey?: string;
};

export type DMCBCanonical = {
  domain: string | null;
  company: string | null;
  who: string;
  wants: string;
  offers: string;
  role: 'demand' | 'supply';
  why_now: string;
  constraints: string[];
  proof: string;
  confidence: number;
  industry?: string | null;
  title?: string | null;
  seniority?: string | null;
  keywords?: string[];
  entity_type?: 'person' | 'organization';
};

export type DMCBExtractResult = {
  id: string;
  canonical?: DMCBCanonical;
  error?: { code: string; message: string };
};

export async function dmcbExtractCanonical(
  items: Array<{ id: string; side: 'demand' | 'supply'; raw: any; context?: string }>,
  ai: DMCBAIConfig,
  endpointBase?: string
): Promise<DMCBExtractResult[]> {
  const base =
    endpointBase ||
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dmcb-extract`;

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, ai }),
    });

    if (!res.ok) {
      // Return all items as NETWORK errors
      return items.map((item) => ({
        id: item.id,
        error: {
          code: 'NETWORK',
          message: `Edge function returned ${res.status}`,
        },
      }));
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return items.map((item) => ({
        id: item.id,
        error: {
          code: 'BAD_JSON',
          message: 'Edge function returned non-array',
        },
      }));
    }

    return data;
  } catch (err) {
    return items.map((item) => ({
      id: item.id,
      error: {
        code: 'NETWORK',
        message: (err as Error).message,
      },
    }));
  }
}
