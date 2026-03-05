import type { PartyStub, IntentCard } from './types';

export function isMinimumViable(party: PartyStub, intent: IntentCard): boolean {
  if (!party.domain && !party.company) return false;
  if (!intent.wants || intent.wants.trim().length < 8) return false;
  if (intent.confidence === 'low') return false;
  return true;
}
