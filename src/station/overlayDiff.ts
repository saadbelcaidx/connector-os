/**
 * OVERLAY DIFF ENGINE — pure computation
 *
 * Compares two OverlaySpecs and produces human-readable diff entries.
 * Used in the Overlay Audit Panel history section.
 */

import type { OverlaySpec } from '../types/station';

export interface OverlayDiffEntry {
  path: string;       // "filters.include.industries"
  label: string;      // "Include industries"
  type: 'added' | 'removed' | 'changed';
  oldValue?: string;
  newValue?: string;
}

const LABELS: Record<string, string> = {
  'filters.include.industries': 'Include industries',
  'filters.include.titles': 'Include titles',
  'filters.include.signals': 'Include signals',
  'filters.include.geo': 'Include geo',
  'filters.include.employeeRange': 'Employee range',
  'filters.include.revenueRange': 'Revenue range',
  'filters.exclude.companies': 'Exclude companies',
  'filters.exclude.industries': 'Exclude industries',
  'filters.exclude.titles': 'Exclude titles',
  'filters.exclude.signals': 'Exclude signals',
  'weights.signalWeight': 'Signal weights',
  'weights.titleMatch': 'Title match weight',
  'weights.industryMatch': 'Industry match weight',
  'weights.domainPresent': 'Domain present weight',
  'weights.emailPresent': 'Email present weight',
  'weights.tierBoost.strong': 'Tier boost: strong',
  'weights.tierBoost.good': 'Tier boost: good',
  'weights.tierBoost.open': 'Tier boost: open',
  'weights.recencyDays.0_7': 'Recency: 0-7 days',
  'weights.recencyDays.8_30': 'Recency: 8-30 days',
  'weights.recencyDays.31_90': 'Recency: 31-90 days',
  'exclusions.supplyMaxUsagePerRun': 'Max supply usage per run',
  'exclusions.blockIfMissingDomainWhenOnlyConnectorAgent': 'Block if missing domain',
  'routing.anonymizeDemandOnSupply': 'Anonymize demand on supply',
  'routing.anonymizeSupplyOnDemand': 'Anonymize supply on demand',
  'roleMode': 'Role mode',
};

function getLabel(path: string): string {
  return LABELS[path] || path.split('.').pop() || path;
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return '(none)';
  if (Array.isArray(val)) return val.length === 0 ? '(empty)' : val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function get(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj as Record<string, unknown>;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part] as Record<string, unknown>;
  }
  return current;
}

function diffArrays(path: string, prev: string[] | undefined, next: string[] | undefined, entries: OverlayDiffEntry[]): void {
  const prevSet = new Set(prev || []);
  const nextSet = new Set(next || []);

  const added = [...nextSet].filter(v => !prevSet.has(v));
  const removed = [...prevSet].filter(v => !nextSet.has(v));

  if (added.length > 0) {
    entries.push({
      path,
      label: getLabel(path),
      type: 'added',
      newValue: added.join(', '),
    });
  }
  if (removed.length > 0) {
    entries.push({
      path,
      label: getLabel(path),
      type: 'removed',
      oldValue: removed.join(', '),
    });
  }
}

function diffScalar(path: string, prev: unknown, next: unknown, entries: OverlayDiffEntry[]): void {
  const prevStr = formatValue(prev);
  const nextStr = formatValue(next);
  if (prevStr === nextStr) return;

  if (prev === undefined || prev === null) {
    entries.push({ path, label: getLabel(path), type: 'added', newValue: nextStr });
  } else if (next === undefined || next === null) {
    entries.push({ path, label: getLabel(path), type: 'removed', oldValue: prevStr });
  } else {
    entries.push({ path, label: getLabel(path), type: 'changed', oldValue: prevStr, newValue: nextStr });
  }
}

export function computeOverlayDiff(prev: OverlaySpec, next: OverlaySpec): OverlayDiffEntry[] {
  const entries: OverlayDiffEntry[] = [];

  // Filter arrays
  const arrayPaths = [
    'filters.include.industries',
    'filters.include.titles',
    'filters.include.signals',
    'filters.include.geo',
    'filters.exclude.companies',
    'filters.exclude.industries',
    'filters.exclude.titles',
    'filters.exclude.signals',
  ];

  for (const path of arrayPaths) {
    diffArrays(path, get(prev, path) as string[] | undefined, get(next, path) as string[] | undefined, entries);
  }

  // Filter ranges
  const rangePaths = ['filters.include.employeeRange', 'filters.include.revenueRange'];
  for (const path of rangePaths) {
    diffScalar(path, get(prev, path), get(next, path), entries);
  }

  // Scalar weights
  const scalarWeightPaths = [
    'weights.titleMatch',
    'weights.industryMatch',
    'weights.domainPresent',
    'weights.emailPresent',
  ];
  for (const path of scalarWeightPaths) {
    diffScalar(path, get(prev, path), get(next, path), entries);
  }

  // Tier boost
  for (const tier of ['strong', 'good', 'open'] as const) {
    const path = `weights.tierBoost.${tier}`;
    diffScalar(path, get(prev, path), get(next, path), entries);
  }

  // Recency
  for (const bucket of ['0_7', '8_30', '31_90'] as const) {
    const path = `weights.recencyDays.${bucket}`;
    diffScalar(path, get(prev, path), get(next, path), entries);
  }

  // Signal weights (compare each key)
  const prevSW = prev.weights?.signalWeight || {};
  const nextSW = next.weights?.signalWeight || {};
  const allSignalKeys = new Set([...Object.keys(prevSW), ...Object.keys(nextSW)]);
  for (const key of allSignalKeys) {
    const path = `weights.signalWeight.${key}`;
    diffScalar(path, prevSW[key], nextSW[key], entries);
  }

  // Exclusions
  diffScalar('exclusions.supplyMaxUsagePerRun', get(prev, 'exclusions.supplyMaxUsagePerRun'), get(next, 'exclusions.supplyMaxUsagePerRun'), entries);
  diffScalar('exclusions.blockIfMissingDomainWhenOnlyConnectorAgent', get(prev, 'exclusions.blockIfMissingDomainWhenOnlyConnectorAgent'), get(next, 'exclusions.blockIfMissingDomainWhenOnlyConnectorAgent'), entries);

  // Routing
  diffScalar('routing.anonymizeDemandOnSupply', get(prev, 'routing.anonymizeDemandOnSupply'), get(next, 'routing.anonymizeDemandOnSupply'), entries);
  diffScalar('routing.anonymizeSupplyOnDemand', get(prev, 'routing.anonymizeSupplyOnDemand'), get(next, 'routing.anonymizeSupplyOnDemand'), entries);

  // Role mode
  diffScalar('roleMode', prev.roleMode, next.roleMode, entries);

  return entries;
}
