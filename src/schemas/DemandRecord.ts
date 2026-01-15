/**
 * DEMAND RECORD SCHEMA
 *
 * Represents a company with signals (pressure/timing indicators).
 * Used as input to the matching pipeline.
 */

export interface Signal {
  type: string;
  value?: string;
  date?: string;
  source?: string;
}

export interface DemandRecord {
  domain: string;
  company: string;
  contact: string;
  email: string;
  title: string;
  industry: string;
  signals: Signal[];
  metadata: Record<string, any>;
}
