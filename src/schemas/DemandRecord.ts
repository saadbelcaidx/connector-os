/**
 * DEMAND RECORD SCHEMA
 *
 * Represents a company with signals (pressure/timing indicators).
 * Used as input to the matching pipeline.
 */

import type { SignalType } from './index';

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

  // === SCHEMA AWARENESS (user.txt contract) ===
  signalType?: SignalType;  // 'hiring' | 'person' | 'company' | 'contact'
}
