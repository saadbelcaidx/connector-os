/**
 * Matching Resolvers - Single source of truth for data access patterns
 *
 * INVARIANT: All maps use explicit key semantics in their names.
 * - supplyContactBySupplyDomain[supplyDomain] - "who do we email at this provider?"
 * - selectedSupplyByDemandDomain[demandDomain] - "for this demand, which supply did we pick?"
 * - demandIntroByDemandDomain[demandDomain] - "intro for demand-side email"
 * - supplyIntroByDemandDomain[demandDomain] - "intro for supply-side email (keyed by the demand it's for)"
 *
 * BAN: Direct indexing in batch/intros/send paths. Use these helpers.
 */

import type { SupplyContact } from './ApolloSupplyEnrichmentService';
import type { SupplyCompany } from './SupplySignalsClient';
import type { PersonData } from './PersonEnrichmentService';

// Type definitions for the maps
export type SupplyContactBySupplyDomain = Record<string, SupplyContact | null>;
export type SelectedSupplyByDemandDomain = Record<string, SupplyCompany | null>;
export type DemandIntroByDemandDomain = Record<string, string>;
export type SupplyIntroByDemandDomain = Record<string, string>;
export type PersonDataByDemandDomain = Record<string, PersonData | null>;

/**
 * Get the selected supply company for a given demand domain.
 * Returns null if no supply has been selected for this demand.
 */
export function getSelectedSupplyForDemand(
  demandDomain: string,
  selectedSupplyByDemandDomain: SelectedSupplyByDemandDomain
): SupplyCompany | null {
  const selected = selectedSupplyByDemandDomain[demandDomain];
  if (!selected) {
    console.warn(`[Resolve] No supply selected for demand: ${demandDomain}`);
    return null;
  }
  return selected;
}

/**
 * Two-hop resolution: demand → selected supply → supply contact.
 * Returns null if either hop fails.
 */
export function getSupplyContactForDemand(
  demandDomain: string,
  selectedSupplyByDemandDomain: SelectedSupplyByDemandDomain,
  supplyContactBySupplyDomain: SupplyContactBySupplyDomain
): SupplyContact | null {
  const selectedSupply = selectedSupplyByDemandDomain[demandDomain];
  if (!selectedSupply) {
    console.warn(`[Resolve] No supply selected for demand: ${demandDomain}`);
    return null;
  }

  const supplyDomain = selectedSupply.domain;
  const contact = supplyContactBySupplyDomain[supplyDomain];
  if (!contact) {
    console.warn(`[Resolve] No contact for supply: ${supplyDomain} (demand: ${demandDomain})`);
    return null;
  }

  return contact;
}

/**
 * Get demand contact (person data) for a given demand domain.
 */
export function getDemandContact(
  demandDomain: string,
  personDataByDemandDomain: PersonDataByDemandDomain
): PersonData | null {
  const personData = personDataByDemandDomain[demandDomain];
  if (!personData) {
    console.warn(`[Resolve] No demand contact for: ${demandDomain}`);
    return null;
  }
  return personData;
}

/**
 * Check if demand side is ready for routing.
 * Ready = has enriched contact with email.
 */
export function isDemandReady(
  demandDomain: string,
  personDataByDemandDomain: PersonDataByDemandDomain
): boolean {
  const personData = personDataByDemandDomain[demandDomain];
  return !!(personData?.email);
}

/**
 * Check if supply side is ready for routing for a given demand.
 * Ready = has selected supply + that supply has enriched contact with email.
 */
export function isSupplyReady(
  demandDomain: string,
  selectedSupplyByDemandDomain: SelectedSupplyByDemandDomain,
  supplyContactBySupplyDomain: SupplyContactBySupplyDomain
): boolean {
  const selectedSupply = selectedSupplyByDemandDomain[demandDomain];
  if (!selectedSupply) return false;

  const supplyContact = supplyContactBySupplyDomain[selectedSupply.domain];
  return !!(supplyContact?.email);
}

/**
 * Full routing readiness check for a demand domain.
 * Returns detailed status for each component.
 */
export function getRoutingReadiness(
  demandDomain: string,
  personDataByDemandDomain: PersonDataByDemandDomain,
  selectedSupplyByDemandDomain: SelectedSupplyByDemandDomain,
  supplyContactBySupplyDomain: SupplyContactBySupplyDomain,
  demandIntroByDemandDomain: DemandIntroByDemandDomain,
  supplyIntroByDemandDomain: SupplyIntroByDemandDomain
): {
  demandContactReady: boolean;
  supplySelected: boolean;
  supplyContactReady: boolean;
  demandIntroReady: boolean;
  supplyIntroReady: boolean;
  fullyReady: boolean;
  missingComponents: string[];
} {
  const demandContactReady = isDemandReady(demandDomain, personDataByDemandDomain);
  const selectedSupply = selectedSupplyByDemandDomain[demandDomain];
  const supplySelected = !!selectedSupply;
  const supplyContactReady = isSupplyReady(demandDomain, selectedSupplyByDemandDomain, supplyContactBySupplyDomain);
  const demandIntroReady = !!demandIntroByDemandDomain[demandDomain];
  const supplyIntroReady = !!supplyIntroByDemandDomain[demandDomain];

  const missingComponents: string[] = [];
  if (!demandContactReady) missingComponents.push('demand contact');
  if (!supplySelected) missingComponents.push('selected supply');
  if (!supplyContactReady) missingComponents.push('supply contact');
  if (!demandIntroReady) missingComponents.push('demand intro');
  if (!supplyIntroReady) missingComponents.push('supply intro');

  return {
    demandContactReady,
    supplySelected,
    supplyContactReady,
    demandIntroReady,
    supplyIntroReady,
    fullyReady: missingComponents.length === 0,
    missingComponents,
  };
}

/**
 * Validate map key types at runtime (dev-mode safety check).
 * Call this after populating maps to catch keying errors early.
 */
export function validateMapKeying(
  supplyContactBySupplyDomain: SupplyContactBySupplyDomain,
  selectedSupplyByDemandDomain: SelectedSupplyByDemandDomain,
  demandDomains: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check: supplyContactBySupplyDomain should NOT contain demand domains
  const supplyContactKeys = Object.keys(supplyContactBySupplyDomain);
  const demandDomainSet = new Set(demandDomains);

  for (const key of supplyContactKeys) {
    if (demandDomainSet.has(key)) {
      // This key exists in demand domains - might be a keying error
      // (unless the company is both demand and supply, which is rare)
      console.warn(`[KeyValidation] supplyContactBySupplyDomain contains demand domain: ${key}`);
    }
  }

  // Check: selectedSupplyByDemandDomain should only contain demand domains
  const selectedSupplyKeys = Object.keys(selectedSupplyByDemandDomain);
  for (const key of selectedSupplyKeys) {
    if (!demandDomainSet.has(key)) {
      errors.push(`selectedSupplyByDemandDomain contains non-demand key: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
