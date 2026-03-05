/**
 * sendSafety.ts — Client-side helpers for the pre-send safety layer.
 *
 * The DB (contact_send_ledger + try_reserve_send RPC) is the guardrail.
 * This file provides: email normalization, root domain extraction,
 * deterministic send_id generation, and Supabase RPC wrappers.
 */

import { supabase } from '../../lib/supabase';

// =============================================================================
// EMAIL NORMALIZATION
// =============================================================================

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Normalize an email address for dedup:
 * - lowercase
 * - strip Gmail plus aliases and dots
 * - strip plus aliases for all others
 * - trim whitespace
 */
export function normalizeEmail(raw: string): string {
  let email = raw.trim().toLowerCase();

  const atIdx = email.indexOf('@');
  if (atIdx < 0) return email;

  let local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);

  if (GMAIL_DOMAINS.has(domain)) {
    // Gmail: strip plus alias AND dots in local part
    local = local.split('+')[0].replace(/\./g, '');
  } else {
    // Others: strip plus alias only (dots can be significant)
    local = local.split('+')[0];
  }

  return `${local}@${domain}`;
}

// =============================================================================
// ROOT DOMAIN EXTRACTION
// =============================================================================

const TWO_PART_TLDS = new Set([
  'co.uk', 'co.nz', 'co.za', 'com.au', 'com.br',
  'co.jp', 'co.in', 'org.uk', 'net.au', 'co.kr',
]);

/**
 * Extract root domain for deliverability throttle:
 * - mail.startup.com → startup.com
 * - hr.acme.co.uk → acme.co.uk
 */
export function extractRootDomain(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() || '';

  for (const tld of TWO_PART_TLDS) {
    if (domain.endsWith(`.${tld}`)) {
      const parts = domain.split('.');
      return parts.slice(-3).join('.');
    }
  }

  const parts = domain.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
}

// =============================================================================
// SEND ID (deterministic, idempotent)
// =============================================================================

/**
 * Build a deterministic send_id from job + eval + normalized email + session.
 * Within a compose session, retries produce the same ID (idempotent).
 * Across sessions, the composeSessionId changes (fresh IDs).
 */
export function buildSendId(
  jobId: string,
  evalId: string,
  normalizedEmail: string,
  composeSessionId: string,
): string {
  const input = `${jobId}:${evalId}:${normalizedEmail}:${composeSessionId}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return `send_${(hash >>> 0).toString(36)}`;
}

/**
 * Simple hash of intro text for message dedup tracking.
 */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return `msg_${(hash >>> 0).toString(36)}`;
}

// =============================================================================
// SUPABASE RPC WRAPPERS
// =============================================================================

export interface ReserveResult {
  allowed: boolean;
  reason: string;
  detail: string | null;
}

/**
 * Attempt to reserve a send. Returns allowed/blocked with reason.
 * The DB checks all 7 rules atomically (advisory lock + cooldowns + dedup).
 */
export async function reserveSend(params: {
  email: string;
  normalizedEmail: string;
  emailDomain: string;
  rootDomain: string;
  clientId: string | null;
  clientName: string | null;
  operatorId: string;
  jobId: string;
  evalId: string;
  sendId: string;
  messageHash: string;
}): Promise<ReserveResult> {
  const { data, error } = await supabase.rpc('try_reserve_send', {
    p_email: params.email,
    p_normalized_email: params.normalizedEmail,
    p_email_domain: params.emailDomain,
    p_root_domain: params.rootDomain,
    p_client_id: params.clientId,
    p_client_name: params.clientName,
    p_operator_id: params.operatorId,
    p_job_id: params.jobId,
    p_eval_id: params.evalId,
    p_send_id: params.sendId,
    p_message_hash: params.messageHash,
  });

  if (error) {
    console.error('[SendSafety] reserve error:', error);
    // On RPC error, fail open (allow send) but log — don't block on infra issues
    return { allowed: true, reason: 'rpc_error', detail: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    reason: row?.reason ?? 'unknown',
    detail: row?.detail ?? null,
  };
}

/**
 * Confirm a send succeeded (transitions reserved → sent).
 */
export async function confirmSend(sendId: string, introductionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_send', {
    p_send_id: sendId,
    p_introduction_id: introductionId,
  });
  if (error) console.error('[SendSafety] confirm error:', error);
}

/**
 * Mark a send as failed (transitions reserved → failed, cooldown NOT burned).
 */
export async function failSend(sendId: string): Promise<void> {
  const { error } = await supabase.rpc('fail_send', {
    p_send_id: sendId,
  });
  if (error) console.error('[SendSafety] fail error:', error);
}
