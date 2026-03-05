import type { NormalizedRecord } from '../schemas/index';
import type { DMCBCanonical } from './dmcbAiExtract';
import { classifySignal } from './classifySignal';
import type { SignalClassification } from './classifySignal';

const MIN_TEXT_LENGTH = 8;

/**
 * Build demand `wants` text from available fields.
 * Pattern: "${company} is ${signal}: ${detail || title || industry}"
 */
function buildWants(r: NormalizedRecord): string {
  const parts: string[] = [];
  if (r.company) parts.push(`${r.company} is`);
  parts.push(r.signal || 'Active');
  const detail = r.signalDetail || r.title || (Array.isArray(r.industry) ? r.industry[0] : r.industry) || '';
  if (detail && detail !== r.signal) parts.push(detail);
  return parts.join(': ').replace(/:\s*:/, ':');
}

/**
 * Build supply `offers` text from available fields.
 * Pattern: "${company}: ${headline || description || industry}"
 */
function buildOffers(r: NormalizedRecord): string {
  const parts: string[] = [];
  if (r.company) parts.push(r.company);
  const detail = r.headline || r.companyDescription || (Array.isArray(r.industry) ? r.industry[0] : r.industry) || '';
  if (detail) parts.push(detail);
  return parts.join(': ');
}

/**
 * Convert a NormalizedRecord (prebuilt market output) to a DMCBCanonical
 * (what mcp-orchestrate reads). No AI — market data is already structured.
 *
 * Returns null if the assembled text is under 8 chars after exhausting all fields.
 */
export function normalizedToCanonical(
  record: NormalizedRecord,
  side: 'demand' | 'supply',
): DMCBCanonical | null {
  const industry = Array.isArray(record.industry)
    ? record.industry[0] ?? null
    : record.industry ?? null;

  const wants = side === 'demand' ? buildWants(record) : '';
  const offers = side === 'supply' ? buildOffers(record) : '';

  // The orchestrator filters canonicals where the primary text < 8 chars.
  // Fail loud here instead of persisting garbage that gets silently dropped.
  const primaryText = side === 'demand' ? wants : offers;
  if (primaryText.trim().length < MIN_TEXT_LENGTH) {
    console.warn(
      `[normalizedToCanonical] Skipping ${record.recordKey}: ${side} text too short (${primaryText.length} chars): "${primaryText}"`,
    );
    return null;
  }

  const hasPerson = !!(record.firstName && record.lastName && record.firstName !== record.company);
  const entity_type: 'person' | 'organization' = hasPerson ? 'person' : 'organization';
  const who = hasPerson ? `${record.firstName} ${record.lastName}`.trim() : (record.company || '');

  return {
    domain: record.domain || null,
    company: record.company || null,
    who,
    wants,
    offers,
    role: side,
    why_now: side === 'demand'
      ? (record.signalDetail || record.signal || '')
      : '',
    constraints: [],
    proof: '',
    confidence: 0.7,
    industry,
    title: record.title || null,
    seniority: record.seniorityLevel || null,
    entity_type,
  };
}

/**
 * Build a canonical map + key arrays from demand and supply NormalizedRecords.
 * Records that fail the 8-char minimum are excluded and logged.
 */
export function buildCanonicalMapFromRecords(
  demandRecords: NormalizedRecord[],
  supplyRecords: NormalizedRecord[],
): {
  canonicalMap: Map<string, DMCBCanonical>;
  demandKeys: string[];
  supplyKeys: string[];
} {
  const canonicalMap = new Map<string, DMCBCanonical>();
  const demandKeys: string[] = [];
  const supplyKeys: string[] = [];

  for (const r of demandRecords) {
    const c = normalizedToCanonical(r, 'demand');
    if (c) {
      canonicalMap.set(r.recordKey, c);
      demandKeys.push(r.recordKey);
    }
  }

  for (const r of supplyRecords) {
    const c = normalizedToCanonical(r, 'supply');
    if (c) {
      canonicalMap.set(r.recordKey, c);
      supplyKeys.push(r.recordKey);
    }
  }

  return { canonicalMap, demandKeys, supplyKeys };
}

/**
 * Build event metadata from a NormalizedRecord.
 * Only demand records carry signals — supply returns null.
 *
 * Prefers ingestion-tagged type (from pack context via eventMeta).
 * Falls back to text-based classification on record.signal.
 * Returns null when unclassifiable — no row in signal_events for this record.
 */
export function buildEventMeta(
  record: NormalizedRecord,
  side: 'demand' | 'supply',
): SignalClassification | null {
  if (side !== 'demand') return null;

  // Prefer ingestion-tagged type (from pack context)
  if (record.eventMeta?.signalType && record.eventMeta?.signalGroup && record.eventMeta?.signalLabel) {
    return {
      signalType: record.eventMeta.signalType,
      signalGroup: record.eventMeta.signalGroup,
      signalLabel: record.eventMeta.signalLabel,
      source: 'pack',
    };
  }

  // Fallback: classify from signal text
  return classifySignal(record.signal);
}
