/**
 * INTRODUCTIONS SERVICE
 *
 * Tracks the lifecycle of every introduction as a first-class object.
 * Fire-and-forget from Flow.tsx — never blocks the send path.
 *
 * DATA FLOW:
 * 1. createIntroductionsBatch() — Called after batch send completes in Flow.tsx
 * 2. Reply trigger (Postgres) — Auto-updates status when replies arrive
 * 3. markMeetingBooked() — Operator action from /introductions dashboard
 * 4. markOutcome() — Operator action: won/lost/stale + deal value
 * 5. listIntroductions() — Paginated query for dashboard
 * 6. getIntroStats() — Aggregate stats for dashboard header
 *
 * INVISIBLE TO USER. They send intros. System tracks lifecycle silently.
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateIntroductionParams {
  operatorId: string;

  // The pair
  demandDomain: string;
  demandCompany?: string;
  demandContactEmail?: string;
  demandContactName?: string;
  demandContactTitle?: string;
  supplyDomain: string;
  supplyCompany?: string;
  supplyContactEmail?: string;
  supplyContactName?: string;
  supplyContactTitle?: string;

  // Match reasoning
  matchScore?: number;
  matchTier?: 'strong' | 'good' | 'open';
  matchTierReason?: string;
  matchReasons?: string[];
  needCategory?: string;
  capabilityCategory?: string;

  // What was sent
  demandIntroText?: string;
  supplyIntroText?: string;
  introSource?: 'template' | 'ai' | 'ai-fallback';

  // Linking
  threadId?: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  demandLeadId?: string;
  supplyLeadId?: string;
}

export type IntroStatus =
  | 'prepared' | 'sent' | 'delivered' | 'replied'
  | 'meeting' | 'closed_won' | 'closed_lost' | 'stale';

export interface Introduction {
  id: string;
  operatorId: string;
  demandDomain: string;
  demandCompany: string | null;
  demandContactEmail: string | null;
  demandContactName: string | null;
  demandContactTitle: string | null;
  supplyDomain: string;
  supplyCompany: string | null;
  supplyContactEmail: string | null;
  supplyContactName: string | null;
  supplyContactTitle: string | null;
  matchScore: number | null;
  matchTier: string | null;
  matchTierReason: string | null;
  matchReasons: string[];
  needCategory: string | null;
  capabilityCategory: string | null;
  demandIntroText: string | null;
  supplyIntroText: string | null;
  introSource: string | null;
  status: IntroStatus;
  demandRepliedAt: string | null;
  supplyRepliedAt: string | null;
  demandReplyStage: string | null;
  supplyReplyStage: string | null;
  firstReplyAt: string | null;
  meetingBookedAt: string | null;
  outcomeAt: string | null;
  outcomeNotes: string | null;
  dealValue: number | null;
  threadId: string | null;
  demandCampaignId: string | null;
  supplyCampaignId: string | null;
  demandLeadId: string | null;
  supplyLeadId: string | null;
  createdAt: string;
  sentAt: string | null;
  updatedAt: string;
}

export interface IntroStats {
  total: number;
  sent: number;
  replied: number;
  meetings: number;
  closedWon: number;
  closedLost: number;
  stale: number;
  pipelineValue: number;
}

export interface ListOptions {
  status?: IntroStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at';
  orderDir?: 'asc' | 'desc';
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a single introduction record.
 * Returns the intro ID on success, null on failure.
 */
export async function createIntroduction(params: CreateIntroductionParams): Promise<string | null> {
  try {
    // Fallback domain from company name when domain is null (Market records have no domain)
    const demandDomain = params.demandDomain || (params.demandCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const supplyDomain = params.supplyDomain || (params.supplyCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const { data, error } = await supabase.from('introductions').insert({
      operator_id: params.operatorId,
      demand_domain: demandDomain,
      demand_company: params.demandCompany,
      demand_contact_email: params.demandContactEmail,
      demand_contact_name: params.demandContactName,
      demand_contact_title: params.demandContactTitle,
      supply_domain: supplyDomain,
      supply_company: params.supplyCompany,
      supply_contact_email: params.supplyContactEmail,
      supply_contact_name: params.supplyContactName,
      supply_contact_title: params.supplyContactTitle,
      match_score: params.matchScore,
      match_tier: params.matchTier,
      match_tier_reason: params.matchTierReason,
      match_reasons: params.matchReasons || [],
      need_category: params.needCategory,
      capability_category: params.capabilityCategory,
      demand_intro_text: params.demandIntroText,
      supply_intro_text: params.supplyIntroText,
      intro_source: params.introSource,
      status: 'sent',
      thread_id: params.threadId,
      demand_campaign_id: params.demandCampaignId,
      supply_campaign_id: params.supplyCampaignId,
      demand_lead_id: params.demandLeadId,
      supply_lead_id: params.supplyLeadId,
      sent_at: new Date().toISOString(),
    }).select('id').single();

    if (error) {
      console.error('[Introductions] Failed to create:', error);
      return null;
    }

    console.log(`[Introductions] Created: ${params.demandDomain} → ${params.supplyDomain} (${params.matchTier})`);
    return data.id;

  } catch (err) {
    console.error('[Introductions] Error creating:', err);
    return null;
  }
}

/**
 * Create multiple introduction records in a single insert.
 * Called after batch send completes in Flow.tsx.
 * Fire-and-forget — never blocks the send path.
 */
export async function createIntroductionsBatch(
  records: CreateIntroductionParams[]
): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const rows = records.map(params => {
      const demandDomain = params.demandDomain || (params.demandCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const supplyDomain = params.supplyDomain || (params.supplyCompany || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return {
      operator_id: params.operatorId,
      demand_domain: demandDomain,
      demand_company: params.demandCompany,
      demand_contact_email: params.demandContactEmail,
      demand_contact_name: params.demandContactName,
      demand_contact_title: params.demandContactTitle,
      supply_domain: supplyDomain,
      supply_company: params.supplyCompany,
      supply_contact_email: params.supplyContactEmail,
      supply_contact_name: params.supplyContactName,
      supply_contact_title: params.supplyContactTitle,
      match_score: params.matchScore,
      match_tier: params.matchTier,
      match_tier_reason: params.matchTierReason,
      match_reasons: params.matchReasons || [],
      need_category: params.needCategory,
      capability_category: params.capabilityCategory,
      demand_intro_text: params.demandIntroText,
      supply_intro_text: params.supplyIntroText,
      intro_source: params.introSource,
      status: 'sent' as const,
      thread_id: params.threadId,
      demand_campaign_id: params.demandCampaignId,
      supply_campaign_id: params.supplyCampaignId,
      demand_lead_id: params.demandLeadId,
      supply_lead_id: params.supplyLeadId,
      sent_at: new Date().toISOString(),
    };});

    const { error } = await supabase.from('introductions').insert(rows);

    if (error) {
      console.error('[Introductions] Failed to batch create:', error);
      return 0;
    }

    console.log(`[Introductions] Batch created ${records.length} introductions`);
    return records.length;

  } catch (err) {
    console.error('[Introductions] Error batch creating:', err);
    return 0;
  }
}

// ============================================================================
// STATUS UPDATES
// ============================================================================

/**
 * Update intro status with optional metadata.
 */
export async function updateIntroStatus(
  id: string,
  status: IntroStatus,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  try {
    const update: Record<string, unknown> = { status };
    if (metadata) Object.assign(update, metadata);

    const { error } = await supabase.from('introductions')
      .update(update)
      .eq('id', id);

    if (error) {
      console.error('[Introductions] Failed to update status:', error);
      return false;
    }

    console.log(`[Introductions] Status updated: ${id} → ${status}`);
    return true;

  } catch (err) {
    console.error('[Introductions] Error updating status:', err);
    return false;
  }
}

/**
 * Mark an introduction as having received a reply.
 * Called by Postgres trigger on replies table (not from frontend).
 * Exposed here for manual correlation if needed.
 */
export async function markIntroReplied(
  threadId: string,
  side: 'demand' | 'supply',
  stage?: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: 'replied',
      first_reply_at: now,
    };

    if (side === 'demand') {
      update.demand_replied_at = now;
      if (stage) update.demand_reply_stage = stage;
    } else {
      update.supply_replied_at = now;
      if (stage) update.supply_reply_stage = stage;
    }

    const { error } = await supabase.from('introductions')
      .update(update)
      .eq('thread_id', threadId);

    if (error) {
      console.error('[Introductions] Failed to mark replied:', error);
      return false;
    }

    console.log(`[Introductions] Marked replied: ${threadId} (${side})`);
    return true;

  } catch (err) {
    console.error('[Introductions] Error marking replied:', err);
    return false;
  }
}

/**
 * Mark meeting booked. Operator action from dashboard.
 */
export async function markMeetingBooked(id: string): Promise<boolean> {
  return updateIntroStatus(id, 'meeting', {
    meeting_booked_at: new Date().toISOString(),
  });
}

/**
 * Mark outcome. Operator action from dashboard.
 */
export async function markOutcome(
  id: string,
  outcome: 'closed_won' | 'closed_lost' | 'stale',
  notes?: string,
  dealValue?: number
): Promise<boolean> {
  const metadata: Record<string, unknown> = {
    outcome_at: new Date().toISOString(),
  };
  if (notes) metadata.outcome_notes = notes;
  if (dealValue !== undefined) metadata.deal_value = dealValue;

  return updateIntroStatus(id, outcome, metadata);
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Map a database row to the Introduction interface.
 */
function mapRow(row: Record<string, unknown>): Introduction {
  return {
    id: row.id as string,
    operatorId: row.operator_id as string,
    demandDomain: row.demand_domain as string,
    demandCompany: row.demand_company as string | null,
    demandContactEmail: row.demand_contact_email as string | null,
    demandContactName: row.demand_contact_name as string | null,
    demandContactTitle: row.demand_contact_title as string | null,
    supplyDomain: row.supply_domain as string,
    supplyCompany: row.supply_company as string | null,
    supplyContactEmail: row.supply_contact_email as string | null,
    supplyContactName: row.supply_contact_name as string | null,
    supplyContactTitle: row.supply_contact_title as string | null,
    matchScore: row.match_score as number | null,
    matchTier: row.match_tier as string | null,
    matchTierReason: row.match_tier_reason as string | null,
    matchReasons: (row.match_reasons as string[]) || [],
    needCategory: row.need_category as string | null,
    capabilityCategory: row.capability_category as string | null,
    demandIntroText: row.demand_intro_text as string | null,
    supplyIntroText: row.supply_intro_text as string | null,
    introSource: row.intro_source as string | null,
    status: row.status as IntroStatus,
    demandRepliedAt: row.demand_replied_at as string | null,
    supplyRepliedAt: row.supply_replied_at as string | null,
    demandReplyStage: row.demand_reply_stage as string | null,
    supplyReplyStage: row.supply_reply_stage as string | null,
    firstReplyAt: row.first_reply_at as string | null,
    meetingBookedAt: row.meeting_booked_at as string | null,
    outcomeAt: row.outcome_at as string | null,
    outcomeNotes: row.outcome_notes as string | null,
    dealValue: row.deal_value as number | null,
    threadId: row.thread_id as string | null,
    demandCampaignId: row.demand_campaign_id as string | null,
    supplyCampaignId: row.supply_campaign_id as string | null,
    demandLeadId: row.demand_lead_id as string | null,
    supplyLeadId: row.supply_lead_id as string | null,
    createdAt: row.created_at as string,
    sentAt: row.sent_at as string | null,
    updatedAt: row.updated_at as string,
  };
}

/**
 * List introductions for the dashboard. Paginated.
 */
export async function listIntroductions(
  operatorId: string,
  options: ListOptions = {}
): Promise<{ data: Introduction[]; count: number }> {
  try {
    const {
      status,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'desc',
    } = options;

    let query = supabase.from('introductions')
      .select('*', { count: 'exact' })
      .eq('operator_id', operatorId)
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[Introductions] Failed to list:', error);
      return { data: [], count: 0 };
    }

    return {
      data: (data || []).map(mapRow),
      count: count || 0,
    };

  } catch (err) {
    console.error('[Introductions] Error listing:', err);
    return { data: [], count: 0 };
  }
}

/**
 * Get a single introduction by ID.
 */
export async function getIntroduction(id: string): Promise<Introduction | null> {
  try {
    const { data, error } = await supabase.from('introductions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Introductions] Failed to get:', error);
      return null;
    }

    return data ? mapRow(data) : null;

  } catch (err) {
    console.error('[Introductions] Error getting:', err);
    return null;
  }
}

/**
 * Aggregate stats for the dashboard header.
 */
export async function getIntroStats(operatorId: string): Promise<IntroStats> {
  const empty: IntroStats = {
    total: 0, sent: 0, replied: 0, meetings: 0,
    closedWon: 0, closedLost: 0, stale: 0, pipelineValue: 0,
  };

  try {
    // Get all intros for this operator (status counts)
    const { data, error } = await supabase.from('introductions')
      .select('status, deal_value')
      .eq('operator_id', operatorId);

    if (error) {
      console.error('[Introductions] Failed to get stats:', error);
      return empty;
    }

    if (!data || data.length === 0) return empty;

    const stats = { ...empty, total: data.length };

    for (const row of data) {
      switch (row.status) {
        case 'sent':
        case 'delivered':
          stats.sent++;
          break;
        case 'replied':
          stats.replied++;
          break;
        case 'meeting':
          stats.meetings++;
          if (row.deal_value) stats.pipelineValue += Number(row.deal_value);
          break;
        case 'closed_won':
          stats.closedWon++;
          if (row.deal_value) stats.pipelineValue += Number(row.deal_value);
          break;
        case 'closed_lost':
          stats.closedLost++;
          break;
        case 'stale':
          stats.stale++;
          break;
      }
    }

    return stats;

  } catch (err) {
    console.error('[Introductions] Error getting stats:', err);
    return empty;
  }
}

// ============================================================================
// LEARNING QUERIES
// ============================================================================

export interface TierLearning {
  tier: string;
  totalSent: number;
  totalReplied: number;
  totalMeetings: number;
  totalWon: number;
  replyRatePct: number;
  meetingRatePct: number;
  winRatePct: number;
}

export interface PairingLearning {
  needCategory: string;
  capabilityCategory: string;
  totalSent: number;
  totalReplied: number;
  totalMeetings: number;
  replyRatePct: number;
  meetingRatePct: number;
}

export interface FunnelData {
  total: number;
  replied: number;
  meetings: number;
  closedWon: number;
  replyRatePct: number;
  meetingRatePct: number;
  winRatePct: number;
}

/**
 * Get learning data by tier from the view.
 */
export async function getLearningByTier(operatorId: string): Promise<TierLearning[]> {
  try {
    const { data, error } = await supabase
      .from('intro_learning_by_tier')
      .select('*')
      .eq('operator_id', operatorId);

    if (error) {
      console.error('[Introductions] Failed to get tier learning:', error);
      return [];
    }

    return (data || []).map(row => ({
      tier: row.match_tier,
      totalSent: row.total_sent,
      totalReplied: row.total_replied,
      totalMeetings: row.total_meetings,
      totalWon: row.total_won,
      replyRatePct: row.reply_rate_pct,
      meetingRatePct: row.meeting_rate_pct,
      winRatePct: row.win_rate_pct,
    }));

  } catch (err) {
    console.error('[Introductions] Error getting tier learning:', err);
    return [];
  }
}

/**
 * Get learning data by need+capability pairing from the view.
 */
export async function getLearningByPairing(operatorId: string): Promise<PairingLearning[]> {
  try {
    const { data, error } = await supabase
      .from('intro_learning_by_pairing')
      .select('*')
      .eq('operator_id', operatorId);

    if (error) {
      console.error('[Introductions] Failed to get pairing learning:', error);
      return [];
    }

    return (data || []).map(row => ({
      needCategory: row.need_category,
      capabilityCategory: row.capability_category,
      totalSent: row.total_sent,
      totalReplied: row.total_replied,
      totalMeetings: row.total_meetings,
      replyRatePct: row.reply_rate_pct,
      meetingRatePct: row.meeting_rate_pct,
    }));

  } catch (err) {
    console.error('[Introductions] Error getting pairing learning:', err);
    return [];
  }
}

/**
 * Get funnel data for an operator from the view.
 */
export async function getIntroFunnel(operatorId: string): Promise<FunnelData | null> {
  try {
    const { data, error } = await supabase
      .from('intro_funnel')
      .select('*')
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (error) {
      console.error('[Introductions] Failed to get funnel:', error);
      return null;
    }

    if (!data) return null;

    return {
      total: data.total_sent,
      replied: data.total_replied,
      meetings: data.total_meetings,
      closedWon: data.total_won,
      replyRatePct: data.reply_rate_pct,
      meetingRatePct: data.meeting_rate_pct,
      winRatePct: data.win_rate_pct,
    };

  } catch (err) {
    console.error('[Introductions] Error getting funnel:', err);
    return null;
  }
}
