export type Side = 'demand' | 'supply';

export interface RawRecord {
  id: string;
  source: 'csv' | 'markets';
  side: Side;
  recordKey: string;
  payload: any;
  receivedAt: number;
  context?: string;  // operator's dataset-level description for AI extraction
}

export interface PartyStub {
  domain: string | null;
  company: string | null;
  confidence: number;
}

export type IntentConfidence = 'high' | 'medium' | 'low';

export interface IntentCard {
  who: string;
  wants: string;
  why_now: string;
  constraints: string[];
  proof: string;
  confidence: IntentConfidence;
}

export interface CanonicalSignal {
  id: string;
  side: Side;
  segment: string;
  freshness: number;
  confidence: number;
  party: PartyStub;
  intent: IntentCard;
  recordKey: string;
  source: RawRecord['source'];
}
