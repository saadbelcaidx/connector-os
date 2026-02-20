/**
 * MATCH EVENTS SERVICE
 *
 * Tracks the lifecycle of every match for behavioral learning.
 * This is the foundation for TikTok-style "the system gets smarter" magic.
 *
 * DATA FLOW:
 * 1. logMatchSent() - Called when user sends a match
 * 2. logMatchReplied() - Called by webhook when reply received
 * 3. logMeetingBooked() - Called when user marks meeting (optional)
 *
 * LEARNING FLOW (Future Option B):
 * 1. Query match_learning_by_pairing view
 * 2. Calculate which need+capability pairings have best reply rates
 * 3. Adjust weights in scoring algorithm
 *
 * INVISIBLE TO USER. They just use the app. System learns silently.
 */

import { supabase } from '../lib/supabase';
import type { NeedProfile, CapabilityProfile, ConfidenceTier } from '../matching';

// ============================================================================
// TYPES
// ============================================================================

export interface MatchEventData {
  // Identifiers
  operatorId: string;
  demandDomain: string;
  supplyDomain: string;
  demandCompany?: string;
  supplyCompany?: string;

  // Match quality
  score: number;
  tier: ConfidenceTier;
  tierReason: string;

  // Profiles (for learning)
  needProfile: NeedProfile;
  capabilityProfile: CapabilityProfile;

  // Score breakdown (for weight learning)
  scoreBreakdown?: {
    industryScore: number;
    signalScore: number;
    sizeScore: number;
    alignmentScore: number;
  };

  // Campaign info
  campaignId?: string;
}

export interface ReplyEventData {
  demandDomain: string;
  supplyDomain: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  stage?: string;
  threadId?: string;
}

// ============================================================================
// LOG MATCH SENT
// ============================================================================

/**
 * Log when a match is sent.
 * Called from Flow.tsx when user sends to Instantly/Plusvibe.
 *
 * Returns a thread_id that should be included in the send
 * so we can link replies back.
 */
export async function logMatchSent(data: MatchEventData): Promise<string | null> {
  try {
    // Fallback domain from company name when domain is null (Market records have no domain)
    const demandDomain = data.demandDomain || (data.demandCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const supplyDomain = data.supplyDomain || (data.supplyCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Generate thread_id for linking replies
    const threadId = `${demandDomain}::${supplyDomain}::${Date.now()}`;

    const { error } = await supabase.from('match_events').upsert({
      operator_id: data.operatorId,
      demand_domain: demandDomain,
      supply_domain: supplyDomain,
      demand_company: data.demandCompany,
      supply_company: data.supplyCompany,

      score: data.score,
      tier: data.tier,
      tier_reason: data.tierReason,

      need_category: data.needProfile.category,
      need_confidence: data.needProfile.confidence,
      capability_category: data.capabilityProfile.category,
      capability_confidence: data.capabilityProfile.confidence,

      industry_score: data.scoreBreakdown?.industryScore,
      signal_score: data.scoreBreakdown?.signalScore,
      size_score: data.scoreBreakdown?.sizeScore,
      alignment_score: data.scoreBreakdown?.alignmentScore,

      campaign_id: data.campaignId,
      thread_id: threadId,
      sent_at: new Date().toISOString(),
    }, {
      onConflict: 'operator_id,demand_domain,supply_domain',
    });

    if (error) {
      console.error('[MatchEvents] Failed to log sent:', error);
      return null;
    }

    console.log(`[MatchEvents] Logged sent: ${demandDomain} → ${supplyDomain} (${data.tier})`);
    return threadId;

  } catch (err) {
    console.error('[MatchEvents] Error logging sent:', err);
    return null;
  }
}

// ============================================================================
// LOG MATCH REPLIED (called by webhook)
// ============================================================================

/**
 * Log when a reply is received.
 * Called from instantly-webhook edge function.
 *
 * Uses thread_id or domain pair to find the original match event.
 */
export async function logMatchReplied(data: ReplyEventData): Promise<boolean> {
  try {
    // Try to find by thread_id first, then by domain pair
    let query = supabase.from('match_events').update({
      replied_at: new Date().toISOString(),
      reply_sentiment: data.sentiment,
      reply_stage: data.stage,
    });

    if (data.threadId) {
      query = query.eq('thread_id', data.threadId);
    } else {
      query = query
        .eq('demand_domain', data.demandDomain)
        .eq('supply_domain', data.supplyDomain);
    }

    const { error } = await query;

    if (error) {
      console.error('[MatchEvents] Failed to log reply:', error);
      return false;
    }

    console.log(`[MatchEvents] Logged reply: ${data.demandDomain} → ${data.sentiment}`);
    return true;

  } catch (err) {
    console.error('[MatchEvents] Error logging reply:', err);
    return false;
  }
}

// ============================================================================
// LOG MEETING BOOKED (optional user action)
// ============================================================================

/**
 * Log when a meeting is booked.
 * Optional - user can mark this manually, or we detect calendar link click.
 */
export async function logMeetingBooked(
  demandDomain: string,
  supplyDomain: string,
  operatorId?: string
): Promise<boolean> {
  try {
    let query = supabase.from('match_events').update({
      meeting_booked: true,
      meeting_booked_at: new Date().toISOString(),
    })
      .eq('demand_domain', demandDomain)
      .eq('supply_domain', supplyDomain);

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    const { error } = await query;

    if (error) {
      console.error('[MatchEvents] Failed to log meeting:', error);
      return false;
    }

    console.log(`[MatchEvents] Logged meeting booked: ${demandDomain}`);
    return true;

  } catch (err) {
    console.error('[MatchEvents] Error logging meeting:', err);
    return false;
  }
}

// ============================================================================
// BATCH LOG (for efficiency)
// ============================================================================

/**
 * Log multiple match sends at once.
 * More efficient for batch sending.
 */
export async function logMatchesSentBatch(
  events: MatchEventData[]
): Promise<Map<string, string>> {
  const threadIds = new Map<string, string>();

  if (events.length === 0) return threadIds;

  try {
    const rows = events.map(data => {
      const demandDomain = data.demandDomain || (data.demandCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const supplyDomain = data.supplyDomain || (data.supplyCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const threadId = `${demandDomain}::${supplyDomain}::${Date.now()}`;
      threadIds.set(demandDomain, threadId);

      return {
        operator_id: data.operatorId,
        demand_domain: demandDomain,
        supply_domain: supplyDomain,
        demand_company: data.demandCompany,
        supply_company: data.supplyCompany,
        score: data.score,
        tier: data.tier,
        tier_reason: data.tierReason,
        need_category: data.needProfile.category,
        need_confidence: data.needProfile.confidence,
        capability_category: data.capabilityProfile.category,
        capability_confidence: data.capabilityProfile.confidence,
        industry_score: data.scoreBreakdown?.industryScore,
        signal_score: data.scoreBreakdown?.signalScore,
        size_score: data.scoreBreakdown?.sizeScore,
        alignment_score: data.scoreBreakdown?.alignmentScore,
        campaign_id: data.campaignId,
        thread_id: threadId,
        sent_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from('match_events').upsert(rows, {
      onConflict: 'operator_id,demand_domain,supply_domain',
    });

    if (error) {
      console.error('[MatchEvents] Failed to batch log:', error);
      return new Map();
    }

    console.log(`[MatchEvents] Batch logged ${events.length} sends`);
    return threadIds;

  } catch (err) {
    console.error('[MatchEvents] Error batch logging:', err);
    return new Map();
  }
}

// ============================================================================
// LEARNING QUERIES (for future Option B)
// ============================================================================

/**
 * Get reply rates by need-capability pairing.
 * Use this to learn which pairings actually work.
 */
export async function getLearningByPairing(): Promise<{
  needCategory: string;
  capabilityCategory: string;
  totalSent: number;
  totalReplied: number;
  replyRatePct: number;
  positiveRatePct: number;
}[]> {
  const { data, error } = await supabase
    .from('match_learning_by_pairing')
    .select('*');

  if (error) {
    console.error('[MatchEvents] Failed to get learning data:', error);
    return [];
  }

  return (data || []).map(row => ({
    needCategory: row.need_category,
    capabilityCategory: row.capability_category,
    totalSent: row.total_sent,
    totalReplied: row.total_replied,
    replyRatePct: row.reply_rate_pct,
    positiveRatePct: row.positive_rate_pct,
  }));
}

/**
 * Get reply rates by confidence tier.
 * Use this to validate tier assignments.
 */
export async function getLearningByTier(): Promise<{
  tier: string;
  totalSent: number;
  totalReplied: number;
  replyRatePct: number;
}[]> {
  const { data, error } = await supabase
    .from('match_learning_by_tier')
    .select('*');

  if (error) {
    console.error('[MatchEvents] Failed to get tier data:', error);
    return [];
  }

  return (data || []).map(row => ({
    tier: row.tier,
    totalSent: row.total_sent,
    totalReplied: row.total_replied,
    replyRatePct: row.reply_rate_pct,
  }));
}

// ============================================================================
// CUSTOM VARIABLES FOR INSTANTLY
// ============================================================================

/**
 * Build custom variables to include in Instantly send.
 * These come back in the webhook so we can link replies.
 */
export function buildTrackingVariables(data: MatchEventData): Record<string, string> {
  return {
    _demand_domain: data.demandDomain,
    _supply_domain: data.supplyDomain,
    _tier: data.tier,
    _need: data.needProfile.category,
    _capability: data.capabilityProfile.category,
    _thread_id: `${data.demandDomain}::${data.supplyDomain}::${Date.now()}`,
  };
}
