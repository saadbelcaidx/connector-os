/**
 * SUPPLY RECORD SCHEMA
 *
 * Represents a provider who can fulfill demand needs.
 * Must have named contact with email.
 */

export interface SupplyRecord {
  domain: string;
  company: string;
  contact: string;
  email: string;
  title: string;
  capability: string;
  targetProfile: string;
  metadata: Record<string, any>;
}
