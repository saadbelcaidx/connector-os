/**
 * EDGE SCHEMA
 *
 * Represents a verified edge (timing signal) detected from demand record.
 * Evidence must be factual and pasteable into intro text.
 */

export interface Edge {
  type: string;
  evidence: string;
  confidence: number; // 0..1
}
