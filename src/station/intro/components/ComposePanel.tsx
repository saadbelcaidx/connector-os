/**
 * ComposePanel — V2 Operator-writes-first compose UI
 *
 * Replaces GeneratePanel + TemplatePicker. Full-width panel.
 *
 * Flow:
 * 1. Select reference match (auto-selects top enriched PASS)
 * 2. Write supply + demand intros by hand
 * 3. Click "Generate Rest" → AI mimics voice for remaining matches
 * 4. Review/edit AI drafts
 * 5. Click "Route Intros" → sends via Instantly
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { ComposedDraft } from '../types';
import type { MatchResult, CanonicalInfo } from '../../hooks/useMCPJob';
import type { IntroAIConfig } from '../../../services/IntroAI';
import type { FulfillmentClient } from '../../../types/station';
import { generateGroupedIntros, generateFulfillmentIntros } from '../composeEngine';
import { getEnrichedPairs, getDemandEnrichedPairs, countEnrichmentStatus } from '../context';
import { getLimiter } from '../../../services/senders/limiters';
import type { SenderConfig, SendLeadParams } from '../../../services/senders/SenderAdapter';
import { createIntroductionsBatch, type CreateIntroductionParams } from '../../../services/IntroductionsService';
import { recordSends } from '../../lib/executionTier';
import {
  normalizeEmail,
  extractRootDomain,
  buildSendId,
  hashText,
  reserveSend,
  confirmSend,
  failSend,
  type ReserveResult,
} from '../sendSafety';

interface Props {
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>;
  aiConfig: IntroAIConfig | null;
  senderConfig: { apiKey: string; supplyCampaignId: string } | null;
  operatorId: string;
  // Overlay tracking — stamped onto every intro record
  overlayClientId?: string;
  overlayVersion?: number;
  overlayClientName?: string;
  overlayHash?: string;
  // Fulfillment mode — when set, demand-only compose activates
  fulfillmentClient?: FulfillmentClient;
}

// =============================================================================
// CONFIG STATUS INDICATORS
// =============================================================================

function ConfigStatus({ label, ok, message }: { label: string; ok: boolean; message: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: ok ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.20)' }}
      />
      <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.50)' }}>
        {label}:
      </span>
      <span className="font-mono" style={{ fontSize: '10px', color: ok ? 'rgba(52,211,153,0.70)' : 'rgba(255,255,255,0.40)' }}>
        {message}
      </span>
    </div>
  );
}

// =============================================================================
// TYPEWRITER
// =============================================================================

function Typewriter({ text, speed = 18, delay = 0 }: { text: string; speed?: number; delay?: number }) {
  const [len, setLen] = useState(0);

  useEffect(() => {
    setLen(0);
    const startTime = performance.now() + delay;
    let raf: number;

    const tick = (now: number) => {
      if (now < startTime) { raf = requestAnimationFrame(tick); return; }
      const chars = Math.min(Math.floor((now - startTime) / speed), text.length);
      setLen(chars);
      if (chars < text.length) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, speed, delay]);

  return <>{text.slice(0, len)}</>;
}

// =============================================================================
// PREVIEW ROW
// =============================================================================

function IntroPreviewRow({
  draft,
  demandName,
  supplyName,
  isExpanded,
  onToggle,
  onEditSupply,
  onEditDemand,
  animate,
  index,
}: {
  draft: ComposedDraft;
  demandName: string;
  supplyName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onEditSupply: (text: string) => void;
  onEditDemand: (text: string) => void;
  animate?: boolean;
  index?: number;
}) {
  return (
    <div
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
        ...(animate ? {
          animation: `rowReveal 0.35s ease-out ${(index || 0) * 50}ms both`,
        } : {}),
      }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3 transition-colors"
        style={{
          padding: '10px 12px',
          background: 'none',
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <span className="font-mono truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', flex: 1 }}>
          {animate ? <Typewriter text={demandName} speed={20} delay={(index || 0) * 80} /> : demandName}
        </span>
        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>x</span>
        <span className="font-mono truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', flex: 1 }}>
          {animate ? <Typewriter text={supplyName} speed={20} delay={(index || 0) * 80 + demandName.length * 20} /> : supplyName}
        </span>
        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
          {isExpanded ? '-' : '+'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4" style={{ animation: 'detailFadeIn 0.15s ease-out' }}>
          {/* Supply intro */}
          <div className="mb-4">
            <div className="font-mono uppercase tracking-widest mb-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
              Supply Copy
            </div>
            <textarea
              value={draft.supplyIntro}
              onChange={e => onEditSupply(e.target.value)}
              className="w-full font-mono bg-transparent outline-none text-white/75 resize-none"
              style={{
                fontSize: '12px',
                lineHeight: '1.5',
                padding: '8px',
                minHeight: '80px',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Demand intro */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono uppercase tracking-widest" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
                Demand Copy
              </span>
              <span className="font-mono" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>
                preview only
              </span>
            </div>
            <textarea
              value={draft.demandIntro}
              onChange={e => onEditDemand(e.target.value)}
              className="w-full font-mono bg-transparent outline-none text-white/50 resize-none"
              style={{
                fontSize: '12px',
                lineHeight: '1.5',
                padding: '8px',
                minHeight: '80px',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ComposePanel({
  matches,
  canonicals,
  enrichResults,
  aiConfig,
  senderConfig,
  operatorId,
  overlayClientId,
  overlayVersion,
  overlayClientName,
  overlayHash,
  fulfillmentClient,
}: Props) {
  const { jobId } = useParams<{ jobId: string }>();

  // Fulfillment mode: client IS the supply, demand-only compose
  const isFulfillment = !!fulfillmentClient?.profile;

  // All non-vetoed pairs are eligible
  const eligibleMatches = matches.filter(m => !m.vetoed);
  // 3b. enrichedPairs fork — fulfillment only needs demand-side enrichment
  const enrichedPairs = isFulfillment
    ? getDemandEnrichedPairs(eligibleMatches, enrichResults)
    : getEnrichedPairs(eligibleMatches, enrichResults);
  const enrichStatus = countEnrichmentStatus(eligibleMatches, enrichResults);

  // All enriched matches sorted by combined score (descending)
  // Classification is a quality signal, not a gate — operator already vetoed what they don't want
  const composeMatches = useMemo(() =>
    [...enrichedPairs].sort((a, b) => b.scores.combined - a.scores.combined),
    [enrichedPairs],
  );

  // ── State ──
  const [referenceEvalId, setReferenceEvalId] = useState<string>('');
  const [supplyDraft, setSupplyDraft] = useState('');
  const [demandDraft, setDemandDraft] = useState('');
  const [drafts, setDrafts] = useState<Map<string, ComposedDraft>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendProgress, setSendProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [sendSkipped, setSendSkipped] = useState<Array<{ email: string; reason: string; detail: string | null }>>([]);
  // composeSessionId: unique per mount, makes send_ids fresh per compose session
  const [composeSessionId] = useState(() => crypto.randomUUID());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [animateIntros, setAnimateIntros] = useState(false);
  const [refDropdownOpen, setRefDropdownOpen] = useState(false);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [saved, setSaved] = useState(false);
  const [previewSupplyKey, setPreviewSupplyKey] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'supply' | string>('supply'); // 'supply' or evalId
  const [showClientProfile, setShowClientProfile] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const saveFlashRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-select top PASS match as reference
  useEffect(() => {
    if (!referenceEvalId && composeMatches.length > 0) {
      setReferenceEvalId(composeMatches[0].evalId);
    }
  }, [composeMatches, referenceEvalId]);

  // Persist drafts to localStorage — _ff suffix prevents key collision with two-sided mode
  const sfx = isFulfillment ? '_ff' : '';
  const storageKey = jobId ? `compose_draft_${jobId}${sfx}` : null;
  const draftsStorageKey = jobId ? `compose_drafts_${jobId}${sfx}` : null;

  // Restore reference + AI drafts from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const { supplyDraft: sd, demandDraft: dd, referenceEvalId: ref } = JSON.parse(saved);
        if (sd) setSupplyDraft(sd);
        if (dd) setDemandDraft(dd);
        if (ref) setReferenceEvalId(ref);
      }
    } catch { /* ignore */ }
    if (!draftsStorageKey) return;
    try {
      const savedDrafts = localStorage.getItem(draftsStorageKey);
      if (savedDrafts) {
        const arr: ComposedDraft[] = JSON.parse(savedDrafts);
        if (Array.isArray(arr) && arr.length > 0) {
          setDrafts(new Map(arr.map(d => [d.evalId, d])));
        }
      }
    } catch { /* ignore */ }
  }, [storageKey, draftsStorageKey]);

  // Persist reference draft
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ supplyDraft, demandDraft, referenceEvalId }));
    } catch { /* ignore */ }
    // Debounced save flash — only after typing pauses
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      if (supplyDraft || demandDraft) {
        setSaved(true);
        clearTimeout(saveFlashRef.current);
        saveFlashRef.current = setTimeout(() => setSaved(false), 1500);
      }
    }, 600);
  }, [storageKey, supplyDraft, demandDraft, referenceEvalId]);

  // Persist AI-generated drafts
  useEffect(() => {
    if (!draftsStorageKey || drafts.size === 0) return;
    try {
      localStorage.setItem(draftsStorageKey, JSON.stringify([...drafts.values()]));
    } catch { /* ignore */ }
  }, [draftsStorageKey, drafts]);

  const referenceMatch = composeMatches.find(m => m.evalId === referenceEvalId) || null;
  const remaining = composeMatches.filter(m => m.evalId !== referenceEvalId);

  // Single-match mode: sync reference draft directly so send works without generate
  const refDraftReady = referenceMatch && demandDraft.trim() && (isFulfillment || supplyDraft.trim());
  useEffect(() => {
    if (remaining.length === 0 && refDraftReady && referenceMatch) {
      setDrafts(new Map([[referenceMatch.evalId, {
        evalId: referenceMatch.evalId,
        supplyIntro: isFulfillment ? '' : supplyDraft,
        demandIntro: demandDraft,
      }]]));
    }
  }, [remaining.length, refDraftReady, referenceMatch, supplyDraft, demandDraft, isFulfillment]);

  // =========================================================================
  // GENERATE
  // =========================================================================

  const handleGenerate = useCallback(async () => {
    if (!aiConfig || !referenceMatch) return;
    setGenerating(true);
    setError(null);
    setDrafts(new Map());

    try {
      let composed: ComposedDraft[];

      if (isFulfillment && fulfillmentClient?.profile) {
        // Fulfillment mode — demand-only with demandKey dedup
        composed = await generateFulfillmentIntros(
          aiConfig,
          { match: referenceMatch, demandDraft },
          remaining,
          canonicals,
          enrichResults,
          fulfillmentClient.profile,
        );
      } else {
        // Standard two-sided compose
        composed = await generateGroupedIntros(
          aiConfig,
          { match: referenceMatch, supplyDraft, demandDraft },
          remaining,
          canonicals,
          enrichResults,
        );
      }

      const map = new Map<string, ComposedDraft>();
      // Include reference as first draft
      map.set(referenceMatch.evalId, {
        evalId: referenceMatch.evalId,
        supplyIntro: isFulfillment ? '' : supplyDraft,
        demandIntro: demandDraft,
      });
      for (const d of composed) {
        map.set(d.evalId, d);
      }
      setDrafts(map);

      // Trigger typewriter animation
      setAnimateIntros(true);
      clearTimeout(animateTimerRef.current);
      animateTimerRef.current = setTimeout(() => setAnimateIntros(false), 6000);
    } catch (e) {
      setError(`AI generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  }, [aiConfig, referenceMatch, supplyDraft, demandDraft, remaining, canonicals, enrichResults, isFulfillment, fulfillmentClient]);

  // =========================================================================
  // INLINE EDIT
  // =========================================================================

  const handleEditSupply = useCallback((evalId: string, text: string) => {
    const match = composeMatches.find(m => m.evalId === evalId);
    if (!match) return;
    setDrafts(prev => {
      const next = new Map(prev);
      // Sync supply intro to all drafts sharing the same supplyKey
      for (const [id, draft] of next) {
        const m = composeMatches.find(x => x.evalId === id);
        if (m && m.supplyKey === match.supplyKey) {
          next.set(id, { ...draft, supplyIntro: text });
        }
      }
      return next;
    });
  }, [composeMatches]);

  const handleEditDemand = useCallback((evalId: string, text: string) => {
    setDrafts(prev => {
      const next = new Map(prev);
      const existing = next.get(evalId);
      if (existing) next.set(evalId, { ...existing, demandIntro: text });
      return next;
    });
  }, []);

  // =========================================================================
  // SEND VIA INSTANTLY
  // =========================================================================

  const handleSend = useCallback(async () => {
    if (!senderConfig) return;
    setSending(true);
    setSendDone(false);
    setSendSkipped([]);
    const limiter = getLimiter('instantly');
    const config: SenderConfig = {
      apiKey: senderConfig.apiKey,
      demandCampaignId: null,
      supplyCampaignId: senderConfig.supplyCampaignId,
    };

    let sent = 0;
    let errors = 0;
    const skipped: { evalId: string; reason: string }[] = [];
    const safetySkipped: Array<{ email: string; reason: string; detail: string | null }> = [];
    const introRecords: CreateIntroductionParams[] = [];
    const confirmedSendIds: string[] = []; // parallel with introRecords — sendId per intro
    const successLeadIds = new Set<string>();
    const sendablePairs = enrichedPairs.filter(m => drafts.has(m.evalId));

    if (isFulfillment) {
      // ── FULFILLMENT SEND — demand-only, dedup by normalized demand email, safety layer ──
      const demandEmailToPrimary = new Map<string, string>();
      for (const match of sendablePairs) {
        const email = enrichResults.get(match.evalId)?.demand?.email;
        if (email) {
          const norm = normalizeEmail(email);
          if (!demandEmailToPrimary.has(norm)) {
            demandEmailToPrimary.set(norm, match.evalId);
          }
        }
      }

      const total = demandEmailToPrimary.size;
      setSendProgress({ sent: 0, errors: 0, total });

      for (const match of sendablePairs) {
        const draft = drafts.get(match.evalId)!;
        const enrichResult = enrichResults.get(match.evalId);
        const demandEnrich = enrichResult?.demand;
        const demandCanon = canonicals.get(match.demandKey);
        const supplyCanon = canonicals.get(match.supplyKey);

        if (!demandEnrich || typeof demandEnrich !== 'object' || demandEnrich.outcome !== 'ENRICHED' || !demandEnrich.email) {
          skipped.push({ evalId: match.evalId, reason: 'No enriched demand email' });
          continue;
        }

        // Layer 3 dedup: one email per unique demand person (normalized)
        if (demandEmailToPrimary.get(normalizeEmail(demandEnrich.email)) !== match.evalId) continue;

        // ── SAFETY LAYER: normalize → reserve → send → confirm/fail ──
        const rawEmail = demandEnrich.email;
        const normalized = normalizeEmail(rawEmail);
        const rootDomain = extractRootDomain(normalized);
        const emailDomain = normalized.split('@')[1] || '';
        const sendId = buildSendId(jobId!, match.evalId, normalized, composeSessionId);
        const messageHash = hashText(draft.demandIntro);

        // Step 1: Reserve
        const reservation = await reserveSend({
          email: rawEmail,
          normalizedEmail: normalized,
          emailDomain,
          rootDomain,
          clientId: fulfillmentClient?.id || null,
          clientName: fulfillmentClient?.name || null,
          operatorId,
          jobId: jobId!,
          evalId: match.evalId,
          sendId,
          messageHash,
        });

        if (!reservation.allowed) {
          safetySkipped.push({ email: rawEmail, reason: reservation.reason, detail: reservation.detail });
          continue;
        }

        // Step 2: Send via Instantly
        const demandParams: SendLeadParams = {
          type: 'DEMAND',
          campaignId: senderConfig.supplyCampaignId,
          email: rawEmail,
          firstName: demandEnrich.firstName || '',
          lastName: demandEnrich.lastName || '',
          companyName: demandCanon?.company || match.demandKey,
          companyDomain: demandCanon?.domain || '',
          introText: draft.demandIntro,
          contactTitle: demandEnrich.title || undefined,
        };

        try {
          const result = await limiter.sendLead(config, demandParams);
          if (result.success) {
            sent++;
            if (result.leadId) successLeadIds.add(result.leadId);

            // Step 3a: Confirm — ledger row transitions to 'sent'
            const introRecord: CreateIntroductionParams = {
              operatorId,
              demandDomain: demandCanon?.domain || '',
              demandCompany: demandCanon?.company,
              demandContactEmail: demandEnrich.email,
              demandContactName: `${demandEnrich.firstName || ''} ${demandEnrich.lastName || ''}`.trim() || undefined,
              demandContactTitle: demandEnrich.title || undefined,
              supplyDomain: supplyCanon?.domain || '',
              supplyCompany: supplyCanon?.company,
              supplyContactEmail: '',
              supplyContactName: fulfillmentClient?.name || '',
              matchScore: match.scores.combined,
              matchTier: match.classification === 'PASS' ? 'strong' : match.classification === 'MARGINAL' ? 'good' : 'open',
              matchReasons: match.reasoning ? [match.reasoning] : [],
              supplyIntroText: '',
              demandIntroText: draft.demandIntro,
              introSource: 'ai-v2-fulfillment',
              supplyCampaignId: senderConfig.supplyCampaignId,
              demandLeadId: result.leadId,
              overlayClientId,
              overlayVersion,
              overlayClientName,
              overlayHash,
            };
            introRecords.push(introRecord);
            confirmedSendIds.push(sendId);
          } else {
            errors++;
            // Step 3b: Fail — cooldown NOT burned
            failSend(sendId).catch(console.error);
          }
        } catch {
          errors++;
          failSend(sendId).catch(console.error);
        }

        setSendProgress({ sent, errors, total });
      }

      setSendSkipped(safetySkipped);
    } else {
      // ── STANDARD SEND — supply + demand two-sided, with safety layer ──
      // Dedup: first evalId per unique normalized supply email is the "primary" sender
      const supplyEmailToPrimary = new Map<string, string>();
      for (const match of sendablePairs) {
        const email = enrichResults.get(match.evalId)?.supply?.email;
        if (email) {
          const norm = normalizeEmail(email);
          if (!supplyEmailToPrimary.has(norm)) {
            supplyEmailToPrimary.set(norm, match.evalId);
          }
        }
      }

      // Dedup: first evalId per unique normalized demand email is the "primary" sender
      const demandEmailToPrimary = new Map<string, string>();
      for (const match of sendablePairs) {
        const email = enrichResults.get(match.evalId)?.demand?.email;
        if (email) {
          const norm = normalizeEmail(email);
          if (!demandEmailToPrimary.has(norm)) {
            demandEmailToPrimary.set(norm, match.evalId);
          }
        }
      }

      const total = supplyEmailToPrimary.size;
      setSendProgress({ sent: 0, errors: 0, total });

      for (const match of sendablePairs) {
        const draft = drafts.get(match.evalId)!;
        const enrichResult = enrichResults.get(match.evalId);
        const supplyEnrich = enrichResult?.supply;
        const demandEnrich = enrichResult?.demand;
        const demandCanon = canonicals.get(match.demandKey);
        const supplyCanon = canonicals.get(match.supplyKey);

        // Guard: skip if supply enrichment is missing or not enriched
        if (!supplyEnrich || typeof supplyEnrich !== 'object' || supplyEnrich.outcome !== 'ENRICHED' || !supplyEnrich.email) {
          skipped.push({ evalId: match.evalId, reason: 'No enriched supply email' });
          continue;
        }

        // Supply send — only for the primary evalId per unique email (dedup)
        if (supplyEmailToPrimary.get(normalizeEmail(supplyEnrich.email)) === match.evalId) {
          // Safety: normalize → reserve → send → confirm/fail
          const sNorm = normalizeEmail(supplyEnrich.email);
          const sRootDomain = extractRootDomain(sNorm);
          const sEmailDomain = sNorm.split('@')[1] || '';
          const sSendId = buildSendId(jobId!, match.evalId + '_s', sNorm, composeSessionId);
          const sMessageHash = hashText(draft.supplyIntro);

          const sReservation = await reserveSend({
            email: supplyEnrich.email,
            normalizedEmail: sNorm,
            emailDomain: sEmailDomain,
            rootDomain: sRootDomain,
            clientId: overlayClientId || null,
            clientName: overlayClientName || null,
            operatorId,
            jobId: jobId!,
            evalId: match.evalId,
            sendId: sSendId,
            messageHash: sMessageHash,
          });

          if (!sReservation.allowed) {
            safetySkipped.push({ email: supplyEnrich.email, reason: sReservation.reason, detail: sReservation.detail });
          } else {
            const supplyParams: SendLeadParams = {
              type: 'SUPPLY',
              campaignId: senderConfig.supplyCampaignId,
              email: supplyEnrich.email,
              firstName: supplyEnrich.firstName || '',
              lastName: supplyEnrich.lastName || '',
              companyName: supplyCanon?.company || match.supplyKey,
              companyDomain: supplyCanon?.domain || '',
              introText: draft.supplyIntro,
              contactTitle: supplyEnrich.title || undefined,
            };

            try {
              const result = await limiter.sendLead(config, supplyParams);
              if (result.success) {
                sent++;
                if (result.leadId) successLeadIds.add(result.leadId);
                introRecords.push({
                  operatorId,
                  demandDomain: demandCanon?.domain || '',
                  demandCompany: demandCanon?.company,
                  demandContactEmail: demandEnrich?.email || undefined,
                  demandContactName: demandEnrich?.firstName ? `${demandEnrich.firstName} ${demandEnrich.lastName || ''}`.trim() : undefined,
                  demandContactTitle: demandEnrich?.title || undefined,
                  supplyDomain: supplyCanon?.domain || '',
                  supplyCompany: supplyCanon?.company,
                  supplyContactEmail: supplyEnrich.email,
                  supplyContactName: `${supplyEnrich.firstName} ${supplyEnrich.lastName}`.trim(),
                  supplyContactTitle: supplyEnrich.title,
                  matchScore: match.scores.combined,
                  matchTier: match.classification === 'PASS' ? 'strong' : match.classification === 'MARGINAL' ? 'good' : 'open',
                  matchReasons: match.reasoning ? [match.reasoning] : [],
                  supplyIntroText: draft.supplyIntro,
                  demandIntroText: draft.demandIntro,
                  introSource: 'ai-v2',
                  supplyCampaignId: senderConfig.supplyCampaignId,
                  supplyLeadId: result.leadId,
                  overlayClientId,
                  overlayVersion,
                  overlayClientName,
                  overlayHash,
                });
                confirmedSendIds.push(sSendId);
              } else {
                errors++;
                failSend(sSendId).catch(console.error);
              }
            } catch {
              errors++;
              failSend(sSendId).catch(console.error);
            }
          }

          setSendProgress({ sent, errors, total });
        }

        // Demand send — only for the primary evalId per unique demand email (dedup)
        if (demandEnrich && typeof demandEnrich === 'object' && demandEnrich.outcome === 'ENRICHED' && demandEnrich.email && config.demandCampaignId) {
          if (demandEmailToPrimary.get(normalizeEmail(demandEnrich.email)) === match.evalId) {
            // Safety: normalize → reserve → send → confirm/fail
            const dNorm = normalizeEmail(demandEnrich.email);
            const dRootDomain = extractRootDomain(dNorm);
            const dEmailDomain = dNorm.split('@')[1] || '';
            const dSendId = buildSendId(jobId!, match.evalId + '_d', dNorm, composeSessionId);
            const dMessageHash = hashText(draft.demandIntro);

            const dReservation = await reserveSend({
              email: demandEnrich.email,
              normalizedEmail: dNorm,
              emailDomain: dEmailDomain,
              rootDomain: dRootDomain,
              clientId: overlayClientId || null,
              clientName: overlayClientName || null,
              operatorId,
              jobId: jobId!,
              evalId: match.evalId,
              sendId: dSendId,
              messageHash: dMessageHash,
            });

            if (!dReservation.allowed) {
              safetySkipped.push({ email: demandEnrich.email, reason: dReservation.reason, detail: dReservation.detail });
            } else {
              const demandParams: SendLeadParams = {
                type: 'DEMAND',
                campaignId: config.demandCampaignId,
                email: demandEnrich.email,
                firstName: demandEnrich.firstName || '',
                lastName: demandEnrich.lastName || '',
                companyName: demandCanon?.company || match.demandKey,
                companyDomain: demandCanon?.domain || '',
                introText: draft.demandIntro,
                contactTitle: demandEnrich.title || undefined,
              };

              try {
                const result = await limiter.sendLead(config, demandParams);
                if (result.success) {
                  if (result.leadId) successLeadIds.add(result.leadId);
                  // Demand sends share the intro record with their supply counterpart
                  // Confirm without intro ID — safety layer still prevents double-send
                  confirmSend(dSendId, '00000000-0000-0000-0000-000000000000').catch(console.error);
                } else {
                  failSend(dSendId).catch(console.error);
                }
              } catch {
                failSend(dSendId).catch(console.error);
              }
            }
          }
        }
      }

      setSendSkipped(safetySkipped);
    }

    if (skipped.length > 0) {
      console.warn('[Send] skipped pairs:', skipped);
    }

    // Batch insert intros → confirm send ledger with real IDs
    if (introRecords.length > 0) {
      createIntroductionsBatch(introRecords)
        .then(ids => {
          for (let i = 0; i < ids.length && i < confirmedSendIds.length; i++) {
            confirmSend(confirmedSendIds[i], ids[i]).catch(console.error);
          }
        })
        .catch(console.error);
    }

    // Execution tier — count unique confirmed dispatches
    if (successLeadIds.size > 0) recordSends(successLeadIds.size);

    setSending(false);
    setSendDone(true);
  }, [senderConfig, enrichedPairs, drafts, enrichResults, canonicals, operatorId, overlayClientId, overlayVersion, overlayClientName, overlayHash, isFulfillment, fulfillmentClient, composeSessionId, jobId]);

  // =========================================================================
  // RENDER
  // =========================================================================

  const hasDrafts = drafts.size > 0;
  // 3d. canGenerate — fulfillment only needs demandDraft, standard needs both
  const canGenerate = aiConfig && referenceMatch && demandDraft.trim() && remaining.length > 0
    && (isFulfillment || supplyDraft.trim());
  const canSend = senderConfig && hasDrafts && !sending;

  // Group remaining matches by supplier for the results view
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, MatchResult[]>();
    for (const m of remaining) {
      if (!drafts.has(m.evalId)) continue;
      const group = groups.get(m.supplyKey) || [];
      group.push(m);
      groups.set(m.supplyKey, group);
    }
    return [...groups.entries()].map(([supplyKey, matches]) => {
      const canon = canonicals.get(supplyKey);
      // Resolve contact name from first enriched match
      let contactName = canon?.who || '';
      for (const m of matches) {
        const se = enrichResults.get(m.evalId)?.supply;
        if (se?.outcome === 'ENRICHED' && se.firstName) {
          contactName = `${se.firstName} ${se.lastName || ''}`.trim();
          break;
        }
      }
      return {
        supplyKey,
        companyName: canon?.company || supplyKey,
        contactName,
        matches,
      };
    });
  }, [remaining, drafts, canonicals, enrichResults]);

  // Fulfillment: group results by demandKey (not supplyKey) — dedup same founder across supply matches
  const demandGroups = useMemo(() => {
    if (!isFulfillment) return [];
    const groups = new Map<string, MatchResult[]>();
    for (const m of remaining) {
      if (!drafts.has(m.evalId)) continue;
      const group = groups.get(m.demandKey) || [];
      group.push(m);
      groups.set(m.demandKey, group);
    }
    return [...groups.entries()].map(([demandKey, matches]) => {
      const canon = canonicals.get(demandKey);
      let contactName = canon?.who || '';
      for (const m of matches) {
        const de = enrichResults.get(m.evalId)?.demand;
        if (de?.outcome === 'ENRICHED' && de.firstName) {
          contactName = `${de.firstName} ${de.lastName || ''}`.trim();
          break;
        }
      }
      return { demandKey, companyName: canon?.company || demandKey, contactName, matches };
    });
  }, [isFulfillment, remaining, drafts, canonicals, enrichResults]);

  // Fulfillment: dedup dropdown + remaining count by demandKey
  const dropdownMatches = useMemo(() => {
    if (!isFulfillment) return composeMatches;
    const seen = new Set<string>();
    return composeMatches.filter(m => {
      if (seen.has(m.demandKey)) return false;
      seen.add(m.demandKey);
      return true;
    });
  }, [isFulfillment, composeMatches]);

  const uniqueRemainingCount = useMemo(() => {
    if (!isFulfillment) return remaining.length;
    const seen = new Set<string>();
    for (const m of remaining) seen.add(m.demandKey);
    return seen.size;
  }, [isFulfillment, remaining]);

  // Unique contacts for bottom bar label — demand-side in fulfillment, supply-side otherwise
  const uniqueContactCount = useMemo(() => {
    const emails = new Set<string>();
    for (const [evalId] of drafts) {
      const side = isFulfillment ? 'demand' : 'supply';
      const email = enrichResults.get(evalId)?.[side]?.email;
      if (email) emails.add(email);
    }
    return emails.size;
  }, [drafts, enrichResults, isFulfillment]);

  // Resolve contact names for reference match
  const refD = referenceMatch ? canonicals.get(referenceMatch.demandKey) : null;
  const refS = referenceMatch ? canonicals.get(referenceMatch.supplyKey) : null;
  const refEnrich = referenceMatch ? enrichResults.get(referenceMatch.evalId) : null;
  const supplyContact = refEnrich?.supply?.outcome === 'ENRICHED' && refEnrich.supply.firstName
    ? `${refEnrich.supply.firstName} ${refEnrich.supply.lastName || ''}`.trim()
    : refS?.who || 'Supply contact';
  const demandContact = refEnrich?.demand?.outcome === 'ENRICHED' && refEnrich.demand.firstName
    ? `${refEnrich.demand.firstName} ${refEnrich.demand.lastName || ''}`.trim()
    : refD?.who || 'Demand contact';

  // Config problems — only show what needs attention
  const configIssues: string[] = [];
  if (!aiConfig) configIssues.push('AI key missing');
  if (!senderConfig) configIssues.push('Sender not configured');
  else if (!senderConfig.supplyCampaignId) configIssues.push('No campaign ID');

  return (
    <div className="flex flex-col h-full">

      {/* ── SCROLLABLE CONTENT ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'none', paddingBottom: hasDrafts ? '72px' : '24px' }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 32px' }}>

          {/* Config dots — inline, compact */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: aiConfig ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.30)' }} />
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: senderConfig ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.30)' }} />
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: senderConfig?.supplyCampaignId ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.15)' }} />
            </div>
            {configIssues.length > 0 && (
              <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>
                {configIssues.join(' · ')}
              </span>
            )}
            {configIssues.length === 0 && (
              <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
                Ready
              </span>
            )}
          </div>

          {/* Empty state */}
          {enrichStatus.eitherEnriched === 0 && eligibleMatches.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="font-mono text-white/30 mb-2" style={{ fontSize: '13px' }}>
                No enriched contacts yet
              </p>
              <p className="font-mono text-white/15" style={{ fontSize: '11px' }}>
                Enrich contacts on the run detail page, then return here to compose.
              </p>
            </div>
          )}

          {/* ── COMPOSE AREA ── */}
          {composeMatches.length > 0 && referenceMatch && (
            <>
              {/* Match header — clean, minimal */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-white/60" style={{ fontSize: '13px' }}>
                    {refD?.company || referenceMatch.demandKey}
                  </span>
                  {!isFulfillment && (
                    <>
                      <span className="font-mono text-white/30" style={{ fontSize: '11px' }}>x</span>
                      <span className="font-mono text-white/60" style={{ fontSize: '13px' }}>
                        {refS?.company || referenceMatch.supplyKey}
                      </span>
                    </>
                  )}
                  {isFulfillment && fulfillmentClient && (
                    <button
                      onClick={() => setShowClientProfile(true)}
                      className="font-mono transition-colors hover:text-white/40"
                      style={{ fontSize: '10px', color: 'rgba(255,255,255,0.20)', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
                    >
                      {fulfillmentClient.name || 'Client'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {saved && (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(52,211,153,0.50)', animation: 'savedFade 1.5s ease-out forwards' }}>
                      Saved
                    </span>
                  )}
                  {composeMatches.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={() => setRefDropdownOpen(v => !v)}
                        className="font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] transition-colors flex items-center justify-between px-3"
                        style={{ height: '28px', minWidth: '180px', border: '1px solid rgba(255,255,255,0.06)', outline: 'none', boxShadow: 'none' }}
                      >
                        <span className="text-white/70 truncate">
                          {isFulfillment
                            ? (refD?.company || referenceMatch.demandKey)
                            : `${refD?.company || referenceMatch.demandKey} × ${refS?.company || referenceMatch.supplyKey}`}
                        </span>
                        <span className="text-white/20 ml-2">▾</span>
                      </button>
                      {refDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setRefDropdownOpen(false)} />
                          <div className="absolute top-full right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', minWidth: '240px' }}>
                            {dropdownMatches.map(m => {
                              const dd = canonicals.get(m.demandKey);
                              const ss = canonicals.get(m.supplyKey);
                              return (
                                <button
                                  key={m.evalId}
                                  onClick={() => {
                                    setReferenceEvalId(m.evalId);
                                    setDrafts(new Map());
                                    setRefDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                                    referenceEvalId === m.evalId
                                      ? 'text-white/90 bg-white/[0.06]'
                                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'
                                  }`}
                                  style={{ border: 'none', outline: 'none' }}
                                >
                                  {isFulfillment
                                    ? (dd?.company || m.demandKey)
                                    : `${dd?.company || m.demandKey} × ${ss?.company || m.supplyKey}`}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Textareas — the hero */}
              {isFulfillment ? (
                /* Fulfillment: single full-width demand textarea only */
                <div className="mb-8">
                  <div className="font-mono text-white/25 mb-2" style={{ fontSize: '10px' }}>
                    To {demandContact} at {refD?.company || 'demand'}
                  </div>
                  <textarea
                    className="w-full font-mono bg-transparent text-white/80 resize-none outline-none transition-colors"
                    style={{
                      fontSize: '13px',
                      lineHeight: '1.65',
                      padding: '16px',
                      minHeight: '200px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                    value={demandDraft}
                    onChange={e => setDemandDraft(e.target.value)}
                    placeholder={`Write the intro you'd send to ${demandContact}...`}
                  />
                </div>
              ) : (
                /* Standard: two-column grid — supply + demand */
                <div className="grid grid-cols-2 gap-5 mb-8">
                  <div>
                    <div className="font-mono text-white/25 mb-2" style={{ fontSize: '10px' }}>
                      To {supplyContact} at {refS?.company || 'supply'}
                    </div>
                    <textarea
                      className="w-full font-mono bg-transparent text-white/80 resize-none outline-none transition-colors"
                      style={{
                        fontSize: '13px',
                        lineHeight: '1.65',
                        padding: '16px',
                        minHeight: '200px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                      value={supplyDraft}
                      onChange={e => setSupplyDraft(e.target.value)}
                      placeholder={`Write the intro you'd send to ${supplyContact}...`}
                    />
                  </div>
                  <div>
                    <div className="font-mono text-white/25 mb-2" style={{ fontSize: '10px' }}>
                      To {demandContact} at {refD?.company || 'demand'}
                    </div>
                    <textarea
                      className="w-full font-mono bg-transparent text-white/80 resize-none outline-none transition-colors"
                      style={{
                        fontSize: '13px',
                        lineHeight: '1.65',
                        padding: '16px',
                        minHeight: '200px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                      value={demandDraft}
                      onChange={e => setDemandDraft(e.target.value)}
                      placeholder={`Write the intro you'd send to ${demandContact}...`}
                    />
                  </div>
                </div>
              )}

              {/* ── GENERATE ── */}
              {remaining.length > 0 && (
                <div className="mb-8">
                  {generating ? (
                    <div className="flex flex-col items-center py-8" style={{ animation: 'breatheIn 0.4s ease-out' }}>
                      {/* Orbital ring */}
                      <div style={{ position: 'relative', width: '48px', height: '48px', marginBottom: '16px' }}>
                        {/* Outer ring — slow orbit */}
                        <div style={{
                          position: 'absolute', inset: 0,
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '50%',
                          animation: 'orbitSpin 3s linear infinite',
                        }}>
                          <div style={{
                            position: 'absolute', top: '-2px', left: '50%', marginLeft: '-2px',
                            width: '4px', height: '4px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.50)',
                            boxShadow: '0 0 8px rgba(255,255,255,0.30)',
                          }} />
                        </div>
                        {/* Inner ring — fast counter-orbit */}
                        <div style={{
                          position: 'absolute', inset: '10px',
                          border: '1px solid rgba(255,255,255,0.04)',
                          borderRadius: '50%',
                          animation: 'orbitSpin 1.8s linear infinite reverse',
                        }}>
                          <div style={{
                            position: 'absolute', top: '-1.5px', left: '50%', marginLeft: '-1.5px',
                            width: '3px', height: '3px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.35)',
                            boxShadow: '0 0 6px rgba(255,255,255,0.20)',
                          }} />
                        </div>
                        {/* Core pulse */}
                        <div style={{
                          position: 'absolute', inset: '20px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.08)',
                          animation: 'corePulse 2s ease-in-out infinite',
                        }} />
                      </div>
                      {/* Text */}
                      <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', animation: 'textBreathe 2.5s ease-in-out infinite' }}>
                        Writing {isFulfillment ? uniqueRemainingCount : remaining.length} intros
                      </span>
                      {/* Particle line */}
                      <div style={{ width: '120px', height: '1px', marginTop: '12px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%', width: '30px',
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)',
                          animation: 'particleDrift 1.6s ease-in-out infinite',
                        }} />
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%', width: '20px',
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
                          animation: 'particleDrift 1.6s ease-in-out infinite 0.5s',
                        }} />
                      </div>
                    </div>
                  ) : canGenerate ? (
                    <button
                      onClick={handleGenerate}
                      className="font-mono transition-all"
                      style={{
                        fontSize: '12px',
                        padding: '10px 20px',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.60)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; }}
                    >
                      {hasDrafts
                        ? `Regenerate ${isFulfillment ? uniqueRemainingCount : remaining.length} intros`
                        : isFulfillment
                          ? `Generate for ${uniqueRemainingCount} contacts`
                          : `Generate for ${remaining.length} matches`}
                    </button>
                  ) : (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.20)' }}>
                      {!aiConfig ? 'Configure AI in Settings to generate' :
                       !demandDraft.trim() || (!isFulfillment && !supplyDraft.trim()) ? (isFulfillment ? `Write the demand intro, then generate for ${uniqueRemainingCount} more` : `Write both intros, then generate for ${remaining.length} more`) : ''}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p className="font-mono mb-6" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>
              {error}
            </p>
          )}

          {/* ── RESULTS ── */}
          {hasDrafts && (
            <div
              style={{
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '8px',
                overflow: 'hidden',
                animation: 'resultsEnter 0.5s ease-out',
              }}
            >
              {/* Reference pinned on top */}
              {referenceMatch && drafts.has(referenceMatch.evalId) && (
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)', animation: 'rowReveal 0.35s ease-out' }}>
                  <button
                    onClick={() => setExpandedId(expandedId === referenceMatch.evalId ? null : referenceMatch.evalId)}
                    className="w-full text-left flex items-center gap-3"
                    style={{ padding: '12px 16px', background: 'none', border: 'none', outline: 'none', cursor: 'pointer' }}
                  >
                    <span className="font-mono uppercase" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)', letterSpacing: '0.08em', width: '56px', flexShrink: 0, animation: 'tagGlow 2s ease-in-out infinite' }}>
                      Yours
                    </span>
                    <span className="font-mono truncate" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', flex: 1 }}>
                      {canonicals.get(referenceMatch.demandKey)?.company || referenceMatch.demandKey}
                    </span>
                    {!isFulfillment && (
                      <>
                        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>x</span>
                        <span className="font-mono truncate" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', flex: 1 }}>
                          {canonicals.get(referenceMatch.supplyKey)?.company || referenceMatch.supplyKey}
                        </span>
                      </>
                    )}
                    <span className="font-mono" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.12)', width: '20px', textAlign: 'center' }}>
                      {expandedId === referenceMatch.evalId ? '\u2212' : '+'}
                    </span>
                  </button>

                  {expandedId === referenceMatch.evalId && (
                    <div className="px-4 pb-4" style={{ paddingLeft: '72px', animation: 'detailFadeIn 0.15s ease-out' }}>
                      {!isFulfillment && (
                        <div className="mb-4">
                          <div className="font-mono uppercase tracking-widest mb-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
                            Supply
                          </div>
                          <textarea
                            value={drafts.get(referenceMatch.evalId)!.supplyIntro}
                            onChange={e => handleEditSupply(referenceMatch.evalId, e.target.value)}
                            className="w-full font-mono bg-transparent outline-none text-white/70 resize-none"
                            style={{ fontSize: '12px', lineHeight: '1.6', padding: '8px', minHeight: '72px', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '4px' }}
                          />
                        </div>
                      )}
                      <div>
                        <div className="font-mono uppercase tracking-widest mb-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
                          {isFulfillment ? 'Intro' : 'Demand'}
                        </div>
                        <textarea
                          value={drafts.get(referenceMatch.evalId)!.demandIntro}
                          onChange={e => handleEditDemand(referenceMatch.evalId, e.target.value)}
                          className="w-full font-mono bg-transparent outline-none text-white/45 resize-none"
                          style={{ fontSize: '12px', lineHeight: '1.6', padding: '8px', minHeight: '72px', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '4px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI-generated drafts — fulfillment: by demand, standard: by supplier */}
              {isFulfillment ? demandGroups.map((group, groupIdx) => (
                <button
                  key={group.demandKey}
                  onClick={() => { setPreviewSupplyKey(group.demandKey); setPreviewTab(group.matches[0].evalId); }}
                  className="w-full text-left flex items-center gap-3 transition-colors"
                  style={{
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    outline: 'none',
                    cursor: 'pointer',
                    ...(animateIntros ? { animation: `rowReveal 0.35s ease-out ${groupIdx * 80}ms both` } : {}),
                  }}
                >
                  <span className="font-mono truncate" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.70)', flex: 1 }}>
                    {group.contactName || group.companyName}
                    <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: '6px', fontSize: '11px' }}>
                      {group.companyName}
                    </span>
                  </span>
                </button>
              )) : supplierGroups.map((group, groupIdx) => (
                <button
                  key={group.supplyKey}
                  onClick={() => { setPreviewSupplyKey(group.supplyKey); setPreviewTab('supply'); }}
                  className="w-full text-left flex items-center gap-3 transition-colors"
                  style={{
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    outline: 'none',
                    cursor: 'pointer',
                    ...(animateIntros ? { animation: `rowReveal 0.35s ease-out ${groupIdx * 80}ms both` } : {}),
                  }}
                >
                  <span className="font-mono truncate" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.70)', flex: 1 }}>
                    {group.contactName || group.companyName}
                    <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: '6px', fontSize: '11px' }}>
                      {group.companyName}
                    </span>
                  </span>
                  <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>
                    {group.matches.length} {group.matches.length === 1 ? 'demand' : 'demands'}
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* ── FIXED BOTTOM BAR ── */}
      {hasDrafts && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-8"
          style={{
            height: '56px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(9,9,11,0.95)',
            backdropFilter: 'blur(12px)',
            animation: 'barSlideUp 0.4s ease-out',
          }}
        >
          <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
            {uniqueContactCount} {uniqueContactCount === 1 ? 'contact' : 'contacts'} ready
          </span>

          {!sending && !sendDone ? (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="font-mono transition-all"
              style={{
                fontSize: '12px',
                padding: '8px 24px',
                background: canSend ? 'rgba(52,211,153,0.10)' : 'rgba(255,255,255,0.02)',
                color: canSend ? 'rgba(52,211,153,0.80)' : 'rgba(255,255,255,0.20)',
                border: `1px solid ${canSend ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '6px',
                cursor: canSend ? 'pointer' : 'default',
                outline: 'none',
              }}
            >
              Route Intros
            </button>
          ) : sending ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.40)', animation: 'sendDot 1.2s ease-in-out infinite' }} />
                <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.40)', animation: 'sendDot 1.2s ease-in-out infinite 0.2s' }} />
                <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.40)', animation: 'sendDot 1.2s ease-in-out infinite 0.4s' }} />
              </div>
              <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)' }}>
                {sendProgress.sent} / {sendProgress.total}
                {sendProgress.errors > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.30)' }}> · {sendProgress.errors} errors</span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2" style={{ animation: 'sendComplete 0.5s ease-out' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: 'rgba(52,211,153,0.60)',
                  boxShadow: '0 0 8px rgba(52,211,153,0.30)',
                  animation: 'completePulse 2s ease-in-out infinite',
                }} />
                <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(52,211,153,0.60)' }}>
                  {sendProgress.sent} sent
                  {sendProgress.errors > 0 && (
                    <span style={{ color: 'rgba(255,255,255,0.30)' }}> · {sendProgress.errors} errors</span>
                  )}
                  {sendSkipped.length > 0 && (
                    <span style={{ color: 'rgba(251,191,36,0.50)' }}> · {sendSkipped.length} skipped</span>
                  )}
                </span>
              </div>
              {/* Safety skipped details */}
              {sendSkipped.length > 0 && (
                <div className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', maxHeight: '120px', overflowY: 'auto', paddingLeft: '14px' }}>
                  {sendSkipped.map((s, i) => (
                    <div key={i} style={{ lineHeight: '1.6' }}>
                      {s.email} — {s.detail || s.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CLIENT PROFILE MODAL (fulfillment only) ── */}
      {showClientProfile && isFulfillment && fulfillmentClient?.profile && (() => {
        const p = fulfillmentClient.profile;
        const fields: { label: string; value: string }[] = [];
        if (p.companyDescription) fields.push({ label: 'What they do', value: p.companyDescription });
        if (p.specialization) fields.push({ label: 'Specialization', value: p.specialization });
        if (p.differentiators?.length) fields.push({ label: 'Differentiators', value: p.differentiators.join(' · ') });
        if (p.painPoints?.length) fields.push({ label: 'Problems they solve', value: p.painPoints.join(' · ') });
        if (p.desiredOutcomes?.length) fields.push({ label: 'Outcomes', value: p.desiredOutcomes.join(' · ') });
        if (p.caseStudy) fields.push({ label: 'Proof', value: p.caseStudy });
        if (p.icpDescription) fields.push({ label: 'Ideal client', value: p.icpDescription });
        if (p.icpTitles?.length) fields.push({ label: 'Titles', value: p.icpTitles.join(', ') });
        if (p.icpIndustries?.length) fields.push({ label: 'Industries', value: p.icpIndustries.join(', ') });
        if (p.icpCompanySize) fields.push({ label: 'Company size', value: p.icpCompanySize });
        if (p.icpGeography) fields.push({ label: 'Geography', value: p.icpGeography });
        if (p.messagingTone) fields.push({ label: 'Tone', value: p.messagingTone });
        if (p.prospectingQuestions?.length) fields.push({ label: 'Prospecting angles', value: p.prospectingQuestions.join(' · ') });
        if (p.fullBrief) fields.push({ label: 'Brief', value: p.fullBrief });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={() => setShowClientProfile(false)}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
            <div className="relative flex flex-col" style={{ width: '100%', maxWidth: '520px', maxHeight: '85vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>
                  {fulfillmentClient.name}
                </span>
                <button onClick={() => setShowClientProfile(false)} className="font-mono" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}>x</button>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', padding: '16px 24px 24px' }}>
                {fields.map((f, i) => (
                  <div key={i} style={{ marginBottom: i < fields.length - 1 ? '14px' : 0 }}>
                    <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{f.label}</p>
                    <p className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.6' }}>{f.value}</p>
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.20)' }}>No profile data configured.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── FROSTED GLASS PREVIEW ── */}
      {previewSupplyKey && (() => {
        // Fulfillment mode: previewSupplyKey holds a demandKey, demand-only preview
        if (isFulfillment) {
          const dGroup = demandGroups.find(g => g.demandKey === previewSupplyKey);
          if (!dGroup) return null;
          const activeDraft = drafts.get(dGroup.matches[0].evalId);
          const activeText = activeDraft?.demandIntro || '';
          const dCanon = canonicals.get(dGroup.demandKey);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={() => setPreviewSupplyKey(null)}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
              <div className="relative flex flex-col" style={{ width: '100%', maxWidth: '580px', maxHeight: '85vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>
                    {dGroup.contactName || dGroup.companyName}
                    <span style={{ color: 'rgba(255,255,255,0.20)', marginLeft: '6px', fontSize: '11px' }}>{dGroup.companyName}</span>
                  </span>
                  <button onClick={() => setPreviewSupplyKey(null)} className="font-mono" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}>x</button>
                </div>
                <div className="px-5 pt-3">
                  <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                    To {dGroup.contactName || dCanon?.company || dGroup.companyName}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  <textarea
                    autoFocus
                    value={activeText}
                    onChange={e => handleEditDemand(dGroup.matches[0].evalId, e.target.value)}
                    className="w-full font-mono bg-transparent outline-none text-white/75 resize-none"
                    style={{ fontSize: '13px', lineHeight: '1.7', padding: '12px 24px 24px', minHeight: '220px', border: 'none' }}
                  />
                </div>
              </div>
            </div>
          );
        }

        // Standard mode: supply-grouped preview with tabs
        const group = supplierGroups.find(g => g.supplyKey === previewSupplyKey);
        if (!group) return null;
        const firstDraft = drafts.get(group.matches[0].evalId);
        const isSupplyTab = previewTab === 'supply';
        const activeDraft = isSupplyTab
          ? firstDraft
          : drafts.get(previewTab);
        const activeText = isSupplyTab
          ? (activeDraft?.supplyIntro || '')
          : (activeDraft?.demandIntro || '');
        const activeDemandCanon = isSupplyTab ? null : canonicals.get(
          group.matches.find(m => m.evalId === previewTab)?.demandKey || ''
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ animation: 'overlayFadeIn 0.2s ease-out' }}
            onClick={() => setPreviewSupplyKey(null)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />

            {/* Card */}
            <div
              className="relative flex flex-col"
              style={{
                width: '100%',
                maxWidth: '580px',
                maxHeight: '85vh',
                margin: '0 24px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                overflow: 'hidden',
                animation: 'cardFloat 0.3s ease-out',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>
                  {group.contactName || group.companyName}
                  <span style={{ color: 'rgba(255,255,255,0.20)', marginLeft: '6px', fontSize: '11px' }}>
                    {group.companyName}
                  </span>
                </span>
                <button
                  onClick={() => setPreviewSupplyKey(null)}
                  className="font-mono"
                  style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}
                >
                  x
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', scrollbarWidth: 'none' }}>
                <button
                  onClick={() => setPreviewTab('supply')}
                  className="font-mono flex-shrink-0"
                  style={{
                    fontSize: '10px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    background: isSupplyTab ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: isSupplyTab ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.30)',
                  }}
                >
                  Supply
                </button>
                {group.matches.map(m => {
                  const dc = canonicals.get(m.demandKey);
                  const isActive = previewTab === m.evalId;
                  return (
                    <button
                      key={m.evalId}
                      onClick={() => setPreviewTab(m.evalId)}
                      className="font-mono flex-shrink-0 truncate"
                      style={{
                        fontSize: '10px',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: 'none',
                        outline: 'none',
                        cursor: 'pointer',
                        maxWidth: '120px',
                        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: isActive ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.30)',
                      }}
                    >
                      {dc?.company || m.demandKey}
                    </button>
                  );
                })}
              </div>

              {/* Label */}
              <div className="px-5 pt-3">
                <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                  {isSupplyTab
                    ? `To ${group.contactName || group.companyName}`
                    : `To ${activeDemandCanon?.who || activeDemandCanon?.company || ''} at ${activeDemandCanon?.company || ''}`
                  }
                </span>
              </div>

              {/* Body — editable */}
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                <textarea
                  key={previewTab}
                  autoFocus
                  value={activeText}
                  onChange={e => {
                    const newText = e.target.value;
                    if (isSupplyTab) {
                      handleEditSupply(group.matches[0].evalId, newText);
                    } else {
                      handleEditDemand(previewTab, newText);
                    }
                  }}
                  className="w-full font-mono bg-transparent outline-none text-white/75 resize-none"
                  style={{
                    fontSize: '13px',
                    lineHeight: '1.7',
                    padding: '12px 24px 24px',
                    minHeight: '220px',
                    border: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes detailFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowReveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes savedFade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes breatheIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes orbitSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes corePulse {
          0%, 100% { transform: scale(1); opacity: 0.08; }
          50% { transform: scale(1.6); opacity: 0.20; }
        }
        @keyframes textBreathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.55; }
        }
        @keyframes particleDrift {
          0% { transform: translateX(-30px); opacity: 0; }
          30% { opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateX(120px); opacity: 0; }
        }
        @keyframes resultsEnter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tagGlow {
          0%, 100% { opacity: 0.20; }
          50% { opacity: 0.40; }
        }
        @keyframes demandSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes barSlideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sendDot {
          0%, 100% { opacity: 0.15; transform: scale(0.8); }
          50% { opacity: 0.60; transform: scale(1.2); }
        }
        @keyframes sendComplete {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes completePulse {
          0%, 100% { opacity: 0.60; box-shadow: 0 0 8px rgba(52,211,153,0.30); }
          50% { opacity: 1; box-shadow: 0 0 14px rgba(52,211,153,0.50); }
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
