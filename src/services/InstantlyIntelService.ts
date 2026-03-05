/**
 * InstantlyIntelService — Fetch AI-generated company intel from Instantly
 *
 * BYOK: Reads operator's Instantly API key from localStorage (outreach_api_key).
 * Platform provides X-Org-Auth via edge function env var.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export type IntelType = 'Company+Description' | 'Competitors';

export const INTEL_TYPES: { key: IntelType; label: string }[] = [
  { key: 'Company+Description', label: 'Overview' },
  { key: 'Competitors', label: 'Competitors' },
];

export async function fetchCompanyIntel(
  domain: string,
  type: IntelType,
): Promise<string | null> {
  if (!domain || !domain.includes('.')) return null;

  const apiKey = localStorage.getItem('outreach_api_key');
  if (!apiKey) return null;

  const url = `${SUPABASE_URL}/functions/v1/instantly-intel`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ apiKey, domain, type }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.result || null;
}
