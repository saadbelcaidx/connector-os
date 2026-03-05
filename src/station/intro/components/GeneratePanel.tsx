/**
 * GeneratePanel — Generation + preview + send
 *
 * Shows config status, generates intros in batch, previews results,
 * and sends via Instantly.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { IntroTemplate, GeneratedIntro, PairContext } from '../types';
import type { MatchResult, CanonicalInfo } from '../../hooks/useMCPJob';
import type { IntroAIConfig } from '../../../services/IntroAI';
import { generateIntrosBatch } from '../engine';
import { buildPairContext, getEnrichedPairs, countEnrichmentStatus } from '../context';
import { deriveSituationBatch } from '../situation';
import { getLimiter } from '../../../services/senders/limiters';
import type { SenderConfig, SendLeadParams } from '../../../services/senders/SenderAdapter';
import { createIntroductionsBatch, type CreateIntroductionParams } from '../../../services/IntroductionsService';
import { recordSends } from '../../lib/executionTier';

interface Props {
  template: IntroTemplate;
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>;
  aiConfig: IntroAIConfig | null;
  senderConfig: { apiKey: string; supplyCampaignId: string } | null;
  operatorId: string;
  onEditTemplate?: () => void;
  // Overlay tracking — stamped onto every intro record
  overlayClientId?: string;
  overlayVersion?: number;
  overlayClientName?: string;
  overlayHash?: string;
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
  intro,
  demandName,
  supplyName,
  isExpanded,
  onToggle,
  onEditSupply,
  onEditDemand,
  animate,
  index,
}: {
  intro: GeneratedIntro;
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
        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>→</span>
        <span className="font-mono truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', flex: 1 }}>
          {animate ? <Typewriter text={supplyName} speed={20} delay={(index || 0) * 80 + demandName.length * 20} /> : supplyName}
        </span>
        {intro.error && (
          <span className="font-mono" style={{ fontSize: '9px', color: 'rgba(248,113,113,0.60)' }}>ERR</span>
        )}
        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
          {isExpanded ? '−' : '+'}
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
              value={intro.supplyIntro}
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
              value={intro.demandIntro}
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

export default function GeneratePanel({
  template,
  matches,
  canonicals,
  enrichResults,
  aiConfig,
  senderConfig,
  operatorId,
  onEditTemplate,
  overlayClientId,
  overlayVersion,
  overlayClientName,
  overlayHash,
}: Props) {
  const [intros, setIntros] = useState<Map<string, GeneratedIntro>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [sendDone, setSendDone] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [animateIntros, setAnimateIntros] = useState(false);
  const abortRef = useRef(false);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // All non-vetoed pairs are eligible — curation is a quality signal, not a gate
  const eligibleMatches = matches.filter(m => !m.vetoed);
  const enrichedPairs = getEnrichedPairs(eligibleMatches, enrichResults);
  const enrichStatus = countEnrichmentStatus(eligibleMatches, enrichResults);

  // =========================================================================
  // GENERATE
  // =========================================================================

  const handleGenerate = useCallback(async () => {
    abortRef.current = false;
    setGenerating(true);
    setGenProgress({ current: 0, total: enrichedPairs.length });
    setIntros(new Map());

    // Step 1: Derive Situations from evaluation outputs (one batch AI call)
    console.log('[Generate] Step 1 — deriveSituationBatch', { pairCount: enrichedPairs.length, hasAiConfig: !!aiConfig });
    console.log('[Generate] Sample match framing/reasoning:', enrichedPairs.slice(0, 2).map(m => ({ evalId: m.evalId, framing: m.framing, reasoning: m.reasoning?.slice(0, 80) })));
    const situations = await deriveSituationBatch(enrichedPairs, aiConfig, canonicals);
    console.log('[Generate] Situations derived:', situations.size, 'entries');
    for (const [id, sit] of situations) {
      console.log(`[Generate] Situation ${id}: momentum="${sit.momentum}" bridge="${sit.bridge}" opportunity="${sit.opportunity}"`);
    }

    // Step 2: Build pairs with Situation context
    const pairs = enrichedPairs.map(m => {
      const sit = situations.get(m.evalId);
      const enrichResult = enrichResults.get(m.evalId);
      let supplyEnrich: any;
      let demandEnrich: any;
      if (enrichResult && typeof enrichResult === 'object' && 'supply' in enrichResult) {
        const s = enrichResult.supply;
        supplyEnrich = s && typeof s === 'object' && s.outcome === 'ENRICHED' ? s : undefined;
        const d = enrichResult.demand;
        demandEnrich = d && typeof d === 'object' && d.outcome === 'ENRICHED' ? d : undefined;
      }
      const ctx = buildPairContext(m, canonicals, supplyEnrich, demandEnrich, sit);
      console.log(`[Generate] Context ${m.evalId}: situation.momentum="${ctx.situation.momentum}" situation.bridge="${ctx.situation.bridge}"`);
      return { evalId: m.evalId, context: ctx };
    });

    const results = await generateIntrosBatch(
      template,
      pairs,
      aiConfig,
      5,
      (current, total) => {
        if (!abortRef.current) {
          setGenProgress({ current, total });
        }
      },
    );

    if (!abortRef.current) {
      const map = new Map<string, GeneratedIntro>();
      for (const r of results) {
        map.set(r.evalId, r);
      }
      setIntros(map);

      // Trigger typewriter animation on preview rows
      setAnimateIntros(true);
      clearTimeout(animateTimerRef.current);
      animateTimerRef.current = setTimeout(() => setAnimateIntros(false), 6000);
    }
    setGenerating(false);
  }, [template, enrichedPairs, canonicals, enrichResults, aiConfig]);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    setGenerating(false);
  }, []);

  // =========================================================================
  // INLINE EDIT
  // =========================================================================

  const handleEditSupply = useCallback((evalId: string, text: string) => {
    setIntros(prev => {
      const next = new Map(prev);
      const existing = next.get(evalId);
      if (existing) next.set(evalId, { ...existing, supplyIntro: text });
      return next;
    });
  }, []);

  const handleEditDemand = useCallback((evalId: string, text: string) => {
    setIntros(prev => {
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
    const limiter = getLimiter('instantly');
    const config: SenderConfig = {
      apiKey: senderConfig.apiKey,
      demandCampaignId: null,
      supplyCampaignId: senderConfig.supplyCampaignId,
    };

    let sent = 0;
    let errors = 0;
    const skipped: { evalId: string; reason: string }[] = [];
    const introRecords: CreateIntroductionParams[] = [];
    const successLeadIds = new Set<string>();
    const sendablePairs = enrichedPairs.filter(m => intros.has(m.evalId) && !intros.get(m.evalId)!.error);
    setSendProgress({ sent: 0, errors: 0, total: sendablePairs.length });

    for (const match of sendablePairs) {
      const intro = intros.get(match.evalId)!;
      const enrichResult = enrichResults.get(match.evalId);
      const supplyEnrich = enrichResult?.supply;
      const demandEnrich = enrichResult?.demand;
      const demandCanon = canonicals.get(match.demandKey);
      const supplyCanon = canonicals.get(match.supplyKey);

      // Guard: skip if supply enrichment is missing or not enriched
      if (!supplyEnrich || typeof supplyEnrich !== 'object' || supplyEnrich.outcome !== 'ENRICHED' || !supplyEnrich.email) {
        skipped.push({ evalId: match.evalId, reason: 'No enriched supply email' });
        setSendProgress({ sent, errors, total: sendablePairs.length });
        continue;
      }

      // Supply send
      const supplyParams: SendLeadParams = {
        type: 'SUPPLY',
        campaignId: senderConfig.supplyCampaignId,
        email: supplyEnrich.email,
        firstName: supplyEnrich.firstName || '',
        lastName: supplyEnrich.lastName || '',
        companyName: supplyCanon?.company || match.supplyKey,
        companyDomain: supplyCanon?.domain || '',
        introText: intro.supplyIntro,
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
            supplyDomain: supplyCanon?.domain || '',
            supplyCompany: supplyCanon?.company,
            supplyContactEmail: supplyEnrich.email,
            supplyContactName: `${supplyEnrich.firstName} ${supplyEnrich.lastName}`.trim(),
            supplyContactTitle: supplyEnrich.title,
            matchScore: match.scores.combined,
            matchTier: match.classification === 'PASS' ? 'strong' : match.classification === 'MARGINAL' ? 'good' : 'open',
            matchReasons: match.reasoning ? [match.reasoning] : [],
            supplyIntroText: intro.supplyIntro,
            demandIntroText: intro.demandIntro,
            introSource: aiConfig ? 'ai' : 'template',
            supplyCampaignId: senderConfig.supplyCampaignId,
            supplyLeadId: result.leadId,
            overlayClientId,
            overlayVersion,
            overlayClientName,
            overlayHash,
          });
        } else {
          errors++;
        }
      } catch {
        errors++;
      }

      // Demand send — only if we have demand enrichment with email
      if (demandEnrich && typeof demandEnrich === 'object' && demandEnrich.outcome === 'ENRICHED' && demandEnrich.email && config.demandCampaignId) {
        const demandParams: SendLeadParams = {
          type: 'DEMAND',
          campaignId: config.demandCampaignId,
          email: demandEnrich.email,
          firstName: demandEnrich.firstName || '',
          lastName: demandEnrich.lastName || '',
          companyName: demandCanon?.company || match.demandKey,
          companyDomain: demandCanon?.domain || '',
          introText: intro.demandIntro,
          contactTitle: demandEnrich.title || undefined,
        };

        try {
          await limiter.sendLead(config, demandParams);
        } catch {
          // Don't block supply — demand send failure is non-fatal
        }
      }

      setSendProgress({ sent, errors, total: sendablePairs.length });
    }

    if (skipped.length > 0) {
      console.warn('[Send] skipped pairs:', skipped);
    }

    // Fire-and-forget lifecycle tracking
    if (introRecords.length > 0) {
      createIntroductionsBatch(introRecords).catch(console.error);
    }

    // Execution tier — count unique confirmed dispatches
    if (successLeadIds.size > 0) recordSends(successLeadIds.size);

    setSending(false);
    setSendDone(true);
  }, [senderConfig, enrichedPairs, intros, enrichResults, canonicals, aiConfig, operatorId, overlayClientId, overlayVersion, overlayClientName, overlayHash]);

  // =========================================================================
  // RENDER
  // =========================================================================

  const hasIntros = intros.size > 0;
  const canSend = senderConfig && hasIntros && !sending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-white/60" style={{ fontSize: '11px' }}>
            {template.name}
          </span>
          {onEditTemplate && (
            <button
              onClick={onEditTemplate}
              className="font-mono text-white/30 hover:text-white/50 transition-colors"
              style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '10px', padding: 0 }}
            >
              Edit
            </button>
          )}
        </div>
        <span className="font-mono text-white/40" style={{ fontSize: '10px' }}>
          {enrichStatus.supplyEnriched}S {enrichStatus.demandEnriched}D enriched / {enrichStatus.total} matches
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ scrollbarWidth: 'none' }}>
        {/* Config status */}
        <div className="flex flex-col gap-2 mb-6">
          <ConfigStatus
            label="Variables"
            ok={!!aiConfig}
            message={aiConfig ? `${aiConfig.provider}` : 'No API key — variables will use fallback values'}
          />
          <ConfigStatus
            label="Sender"
            ok={!!senderConfig}
            message={senderConfig ? 'Connected' : 'Configure sender in Settings to route'}
          />
          {senderConfig && !senderConfig.supplyCampaignId && (
            <ConfigStatus
              label="Campaign"
              ok={false}
              message="Add a supply campaign ID in Settings"
            />
          )}
        </div>

        {enrichStatus.eitherEnriched === 0 && eligibleMatches.length > 0 && (
          <p className="font-mono mb-4" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)' }}>
            Enrich contacts on the run detail page first, then return here to generate and send.
          </p>
        )}

        {/* Generate button */}
        <div className="flex items-center gap-3 mb-6">
          {!generating ? (
            <button
              onClick={handleGenerate}
              disabled={enrichedPairs.length === 0}
              className="font-mono transition-colors"
              style={{
                fontSize: '12px',
                padding: '10px 24px',
                background: enrichedPairs.length > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                color: enrichedPairs.length > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.30)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '6px',
                cursor: enrichedPairs.length > 0 ? 'pointer' : 'default',
                outline: 'none',
              }}
            >
              {hasIntros ? 'Regenerate Intros' : 'Generate Intros'}
            </button>
          ) : (
            <>
              <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)' }}>
                Generating {genProgress.current} / {genProgress.total}…
              </span>
              <button
                onClick={handleAbort}
                className="font-mono text-white/30 hover:text-white/50 transition-colors"
                style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '10px', padding: 0 }}
              >
                Abort
              </button>
            </>
          )}
        </div>

        {/* Generation progress bar with scan line */}
        {generating && (
          <div className="mb-6" style={{ height: '2px', background: 'rgba(255,255,255,0.04)', borderRadius: '1px', position: 'relative', overflow: 'hidden' }}>
            {/* Filled progress */}
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${genProgress.total > 0 ? (genProgress.current / genProgress.total) * 100 : 0}%`,
                background: 'rgba(52,211,153,0.40)',
                borderRadius: '1px',
              }}
            />
            {/* Scanning sweep */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '60px',
                background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.80), transparent)',
                animation: 'scanSweep 1.4s ease-in-out infinite',
              }}
            />
          </div>
        )}

        {/* Preview list */}
        {hasIntros && (
          <div
            className="mb-6"
            style={{
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {enrichedPairs.map((m, idx) => {
              const intro = intros.get(m.evalId);
              if (!intro) return null;
              return (
                <IntroPreviewRow
                  key={m.evalId}
                  intro={intro}
                  demandName={canonicals.get(m.demandKey)?.company || m.demandKey}
                  supplyName={canonicals.get(m.supplyKey)?.company || m.supplyKey}
                  isExpanded={expandedId === m.evalId}
                  onToggle={() => setExpandedId(expandedId === m.evalId ? null : m.evalId)}
                  onEditSupply={(text) => handleEditSupply(m.evalId, text)}
                  onEditDemand={(text) => handleEditDemand(m.evalId, text)}
                  animate={animateIntros}
                  index={idx}
                />
              );
            })}
          </div>
        )}

        {/* Send button */}
        {hasIntros && (
          <div className="mb-6">
            {!sending && !sendDone ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSend}
                  disabled={!canSend || enrichedPairs.length === 0}
                  className="font-mono transition-colors"
                  style={{
                    fontSize: '12px',
                    padding: '10px 24px',
                    background: canSend && enrichedPairs.length > 0 ? 'rgba(52,211,153,0.10)' : 'rgba(255,255,255,0.02)',
                    color: canSend && enrichedPairs.length > 0 ? 'rgba(52,211,153,0.80)' : 'rgba(255,255,255,0.20)',
                    border: `1px solid ${canSend && enrichedPairs.length > 0 ? 'rgba(52,211,153,0.20)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '6px',
                    cursor: canSend && enrichedPairs.length > 0 ? 'pointer' : 'default',
                    outline: 'none',
                  }}
                >
                  Route Intros
                </button>
                <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)' }}>
                  {enrichedPairs.filter(m => intros.has(m.evalId) && !intros.get(m.evalId)!.error).length} ready
                </span>
              </div>
            ) : sending ? (
              <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)' }}>
                Sending {sendProgress.sent} / {sendProgress.total}…
                {sendProgress.errors > 0 && (
                  <span style={{ color: 'rgba(248,113,113,0.60)' }}> ({sendProgress.errors} errors)</span>
                )}
              </span>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(52,211,153,0.60)' }}>
                  {sendProgress.sent} sent
                </span>
                {sendProgress.errors > 0 && (
                  <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(248,113,113,0.60)' }}>
                    {sendProgress.errors} errors
                  </span>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @keyframes detailFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanSweep {
          0% { transform: translateX(-60px); }
          100% { transform: translateX(calc(100vw)); }
        }
        @keyframes rowReveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
