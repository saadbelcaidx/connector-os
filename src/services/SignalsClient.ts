/**
 * SignalsClient.ts — CSV-ONLY Data Ingestion
 *
 * ARCHITECTURAL DECISION (LOCKED):
 * Connector OS is CSV-ONLY. All Apify, dataset, scraper, and external
 * ingestion paths have been permanently removed.
 *
 * CSV is the single source of truth.
 *
 * This file provides:
 * - Safe string utilities
 * - CSV data access from localStorage
 *
 * NO OTHER DATA INGESTION IS SUPPORTED.
 */

// =============================================================================
// UNIVERSAL SAFE STRING HANDLERS
// =============================================================================

/**
 * Universal safe lowercase - handles ANY input type
 * ALWAYS use this instead of .toLowerCase()
 */
export function safeLower(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.toLowerCase();
  if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
  if (Array.isArray(v)) return v.map(x => safeLower(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeLower(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

/**
 * Universal safe text extraction - returns string without lowercasing
 * ALWAYS use this when extracting text from unknown values
 */
export function safeText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(x => safeText(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeText(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

// =============================================================================
// CSV DATA SUPPORT — SINGLE SOURCE OF TRUTH
// =============================================================================

const CSV_DEMAND_KEY = 'csv_demand_data';
const CSV_SUPPLY_KEY = 'csv_supply_data';

/**
 * Get CSV data from localStorage.
 * This is the ONLY way to get demand/supply data into the system.
 *
 * @param type - 'demand' or 'supply'
 * @returns Parsed CSV data array, or null if not available
 */
export function getCsvData(type: 'demand' | 'supply'): any[] | null {
  try {
    const key = type === 'demand' ? CSV_DEMAND_KEY : CSV_SUPPLY_KEY;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (!Array.isArray(data) || data.length === 0) return null;
    console.log(`[CSV] Found ${data.length} ${type} records in localStorage`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if CSV data is available for a given type.
 */
export function hasCsvData(type: 'demand' | 'supply'): boolean {
  return getCsvData(type) !== null;
}

/**
 * Clear CSV data from localStorage.
 */
export function clearCsvData(type: 'demand' | 'supply'): void {
  const key = type === 'demand' ? CSV_DEMAND_KEY : CSV_SUPPLY_KEY;
  localStorage.removeItem(key);
  console.log(`[CSV] Cleared ${type} data from localStorage`);
}

/**
 * Store CSV data in localStorage.
 * Called by Settings.tsx when user uploads CSV.
 */
export function storeCsvData(type: 'demand' | 'supply', data: any[]): void {
  const key = type === 'demand' ? CSV_DEMAND_KEY : CSV_SUPPLY_KEY;
  const payload = JSON.stringify(data);

  // Guard: if payload exceeds 4MB, keep only the latest batch
  if (payload.length > 4_000_000) {
    console.error(`[CSV] QUOTA_GUARD: ${type} payload is ${(payload.length / 1_000_000).toFixed(1)}MB — trimming to last 50 records`);
    const trimmed = JSON.stringify(data.slice(-50));
    localStorage.setItem(key, trimmed);
    console.log(`[CSV] Stored 50 ${type} records (trimmed) in localStorage`);
    return;
  }

  try {
    localStorage.setItem(key, payload);
    console.log(`[CSV] Stored ${data.length} ${type} records in localStorage`);
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError') {
      console.error(`[CSV] QUOTA_EXCEEDED: replacing old ${type} data`);
      localStorage.removeItem(key);
      localStorage.setItem(key, payload);
    } else {
      throw e;
    }
  }
}
