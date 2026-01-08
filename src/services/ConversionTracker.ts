/**
 * Conversion Tracker - DIRECT KNOWING Cosmic Level
 *
 * Tracks real conversion events (not vibes):
 * - reply_generated: A reply was generated
 * - reply_copied: User copied the reply
 * - reply_sent: User marked reply as sent
 * - meeting_booked: User confirmed meeting was booked
 * - bad_output_reported: User reported a bad output
 *
 * All events are logged to reply_events table for analysis.
 */

import { supabase } from '../lib/supabase';

export type ConversionEvent =
  | 'reply_generated'
  | 'reply_copied'
  | 'reply_sent'
  | 'meeting_booked'
  | 'bad_output_reported';

interface EventMetadata {
  stage?: string;
  version?: string;
  ab_variant?: 'A' | 'B';
  ab_test_name?: string;
  inbound_hash?: string;
  reply_hash?: string;
  failure_reason?: string;
  notes?: string;
}

/**
 * Track a conversion event
 * Uses upsert pattern: if reply already exists, update the flags
 */
export async function trackConversion(
  event: ConversionEvent,
  userId: string | undefined,
  metadata: EventMetadata
): Promise<void> {
  if (!userId) {
    console.log(`[conversion] Skipping ${event} - no userId (guest mode)`);
    return;
  }

  try {
    // Build the update payload based on event type
    const updatePayload: Record<string, unknown> = {
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    // Add metadata
    if (metadata.stage) updatePayload.live_stage = metadata.stage;
    if (metadata.version) updatePayload.live_version = metadata.version;
    if (metadata.ab_variant) updatePayload.ab_variant = metadata.ab_variant;
    if (metadata.ab_test_name) updatePayload.ab_test_name = metadata.ab_test_name;
    if (metadata.inbound_hash) updatePayload.inbound_hash = metadata.inbound_hash;
    if (metadata.reply_hash) updatePayload.live_reply_hash = metadata.reply_hash;

    // Set the specific flag based on event
    switch (event) {
      case 'reply_copied':
        updatePayload.operator_copied = true;
        break;
      case 'reply_sent':
        updatePayload.operator_sent = true;
        break;
      case 'meeting_booked':
        updatePayload.meeting_booked = true;
        break;
      case 'bad_output_reported':
        updatePayload.bad_output_reported = true;
        break;
      case 'reply_generated':
        // This is already tracked by reply-brain, but we can log it here too
        break;
    }

    // If we have an inbound_hash, try to update existing record
    // Otherwise, insert a new record
    if (metadata.inbound_hash) {
      // Try to update existing record first
      const { error: updateError } = await supabase
        .from('reply_events')
        .update(updatePayload)
        .eq('user_id', userId)
        .eq('inbound_hash', metadata.inbound_hash);

      if (updateError) {
        console.log(`[conversion] Update failed, inserting new record:`, updateError.message);
        // Insert new record if update failed
        const { error: insertError } = await supabase
          .from('reply_events')
          .insert(updatePayload);

        if (insertError) {
          console.error(`[conversion] Insert failed:`, insertError.message);
        }
      }
    } else {
      // No inbound_hash, just insert
      const { error } = await supabase
        .from('reply_events')
        .insert(updatePayload);

      if (error) {
        console.error(`[conversion] Insert failed:`, error.message);
      }
    }

    console.log(`[conversion] Tracked ${event} for user ${userId.slice(0, 8)}...`);
  } catch (error) {
    console.error(`[conversion] Error tracking ${event}:`, error);
  }
}

/**
 * Simple hash for reply content (matches backend)
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 12);
}

/**
 * Get conversion stats for a user
 */
export async function getConversionStats(userId: string): Promise<{
  total_generated: number;
  total_copied: number;
  total_sent: number;
  total_meetings: number;
  copy_rate: number;
  send_rate: number;
  meeting_rate: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from('reply_events')
      .select('operator_copied, operator_sent, meeting_booked')
      .eq('user_id', userId);

    if (error) throw error;

    const total_generated = data.length;
    const total_copied = data.filter(r => r.operator_copied).length;
    const total_sent = data.filter(r => r.operator_sent).length;
    const total_meetings = data.filter(r => r.meeting_booked).length;

    return {
      total_generated,
      total_copied,
      total_sent,
      total_meetings,
      copy_rate: total_generated > 0 ? (total_copied / total_generated) * 100 : 0,
      send_rate: total_copied > 0 ? (total_sent / total_copied) * 100 : 0,
      meeting_rate: total_sent > 0 ? (total_meetings / total_sent) * 100 : 0,
    };
  } catch (error) {
    console.error('[conversion] Error getting stats:', error);
    return null;
  }
}
