/**
 * INTRO OUTPUT SCHEMA
 *
 * Output types for the matching pipeline.
 * Strict typing for compose vs drop results.
 */

import type { DemandRecord } from './DemandRecord';
import type { SupplyRecord } from './SupplyRecord';
import type { Edge } from './Edge';

/**
 * Named counterparty from supply pool.
 * Must have contact name and email - no category claims allowed.
 */
export interface Counterparty {
  company: string;
  contact: string;
  email: string;
  title: string;
  fitReason: string;
}

/**
 * Successful intro output.
 */
export interface IntroOutput {
  demandIntro: { to: string; body: string };
  supplyIntro: { to: string; body: string };
  payload: {
    demand: DemandRecord;
    supply: SupplyRecord;
    edge: Edge;
    fitReason: string;
  };
}

/**
 * Reasons for dropping a record from the pipeline.
 */
export type DropReason =
  | 'NO_EDGE'
  | 'NO_COUNTERPARTY'
  | 'NO_FIT_REASON'
  | 'INVALID_EMAIL'
  | 'MISSING_REQUIRED_FIELDS';

/**
 * Result when record is dropped.
 */
export interface DropResult {
  dropped: true;
  reason: DropReason;
  details?: Record<string, any>;
}

/**
 * Result when intro is composed.
 */
export interface ComposeResult {
  dropped: false;
  output: IntroOutput;
}

/**
 * Union type for pipeline result.
 */
export type PipelineResult = DropResult | ComposeResult;
