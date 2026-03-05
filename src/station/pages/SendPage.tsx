/**
 * SendPage — V2 Compose page
 *
 * Route: /station/run/:jobId/send
 *
 * Full-width ComposePanel — operator writes first, AI adapts.
 *
 * Data loading:
 *   - useMCPJob().resume(jobId) for matches + canonicals
 *   - enrichResults from route state (passed by RunDetailPageV2)
 *   - AI config from localStorage
 *   - Sender config from localStorage
 */

import { useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMCPJob } from '../hooks/useMCPJob';
import { Breadcrumb } from './Breadcrumb';
import ComposePanel from '../intro/components/ComposePanel';
import ExecutionBadge from '../components/ExecutionBadge';
import type { IntroAIConfig } from '../../services/IntroAI';
import type { FulfillmentClient, ClientOverlay } from '../../types/station';
import { hashOverlaySpecSync } from '../lib/overlayHash';
import { applyOverlayV2 } from '../lib/applyOverlayV2';

// =============================================================================
// AI CONFIG LOADER
// =============================================================================

function loadAIConfig(): IntroAIConfig | null {
  try {
    const raw = localStorage.getItem('ai_settings');
    if (!raw) return null;
    const s = JSON.parse(raw);

    if (s.aiProvider === 'azure' && s.azureApiKey) {
      return {
        provider: 'azure',
        apiKey: s.azureApiKey,
        azureEndpoint: s.azureEndpoint,
        azureDeployment: s.azureDeployment,
        model: s.aiModel,
        openaiApiKeyFallback: s.openaiApiKey,
      };
    }
    if (s.aiProvider === 'anthropic' && s.claudeApiKey) {
      return { provider: 'anthropic', apiKey: s.claudeApiKey, model: s.aiModel };
    }
    if (s.openaiApiKey) {
      return { provider: 'openai', apiKey: s.openaiApiKey, model: s.aiModel };
    }
    return null;
  } catch {
    return null;
  }
}

function loadSenderConfig(): { apiKey: string; supplyCampaignId: string } | null {
  try {
    // Check guest_settings first
    const gs = localStorage.getItem('guest_settings');
    if (gs) {
      const { settings } = JSON.parse(gs);
      if (settings?.instantlyApiKey) {
        return {
          apiKey: settings.instantlyApiKey,
          supplyCampaignId: settings.instantlyCampaignSupply || '',
        };
      }
    }
    // Check standalone key
    const apiKey = localStorage.getItem('outreach_api_key');
    if (apiKey) {
      return { apiKey, supplyCampaignId: '' };
    }
    return null;
  } catch {
    return null;
  }
}

function loadOperatorId(): string {
  try {
    const gs = localStorage.getItem('guest_settings');
    if (gs) {
      const { settings } = JSON.parse(gs);
      return settings?.operatorId || 'guest';
    }
    return 'guest';
  } catch {
    return 'guest';
  }
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SendPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const job = useMCPJob();
  const resumedRef = useRef(false);

  // Enrichment results: prefer route state, fallback to localStorage (survives refresh)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichResults: Map<string, any> = useMemo(() => {
    // Primary: route state from RunDetailPageV2 navigation
    const state = location.state as { enrichResults?: Record<string, unknown> } | null;
    if (state?.enrichResults) {
      return new Map(Object.entries(state.enrichResults));
    }
    // Fallback: localStorage (RunDetailPageV2 persists here)
    if (jobId) {
      try {
        const stored = localStorage.getItem(`enrichResults_${jobId}`);
        if (stored) {
          const entries: Array<[string, unknown]> = JSON.parse(stored);
          if (entries.length > 0) return new Map(entries);
        }
      } catch {}
    }
    return new Map();
  }, [location.state, jobId]);

  // Resume job on mount
  useEffect(() => {
    if (jobId && !resumedRef.current) {
      resumedRef.current = true;
      job.resume(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const aiConfig = useMemo(() => loadAIConfig(), []);
  const senderConfig = useMemo(() => loadSenderConfig(), []);
  const operatorId = useMemo(() => loadOperatorId(), []);

  // Overlay context — read from localStorage (same keys Station.tsx uses)
  const overlayContext = useMemo(() => {
    try {
      const clientId = localStorage.getItem('station_active_lens_client_id');
      if (!clientId) return null;

      const clientsRaw = localStorage.getItem('station_fulfillment_clients');
      const overlaysRaw = localStorage.getItem('station_client_overlays');
      if (!clientsRaw || !overlaysRaw) return null;

      const clients: FulfillmentClient[] = JSON.parse(clientsRaw);
      const overlays: ClientOverlay[] = JSON.parse(overlaysRaw);

      const client = clients.find(c => c.id === clientId);
      if (!client) return null;

      const versions = overlays
        .filter(o => o.clientId === clientId)
        .sort((a, b) => b.version - a.version);
      const active = versions.find(o => o.isActive) ?? versions[0];
      if (!active) return null;

      const ecoSide = client.economicSide === 'demand' || client.economicSide === 'supply'
        ? client.economicSide
        : undefined;

      return {
        overlayClientId: clientId,
        overlayVersion: active.version,
        overlayClientName: client.name,
        overlayHash: hashOverlaySpecSync(active.overlay),
        overlaySpec: active.overlay,
        profile: client.profile ?? null,
        economicSide: ecoSide,
      };
    } catch {
      return null;
    }
  }, []);

  // Fulfillment client — constructed when economicSide === 'supply' (client IS the supply)
  const fulfillmentClient = useMemo(() => {
    if (overlayContext?.economicSide !== 'supply') return undefined;
    if (!overlayContext.profile) return undefined;
    return {
      id: overlayContext.overlayClientId,
      name: overlayContext.overlayClientName,
      economicSide: 'supply' as const,
      profile: overlayContext.profile,
      status: 'active' as const,
      createdAt: '',
    } satisfies FulfillmentClient;
  }, [overlayContext]);

  // Effective matches — apply overlay filter (mirrors RunDetailPageV2)
  const effectiveMatches = useMemo(() => {
    const nonVetoed = job.matches.filter(m => !m.vetoed);
    if (!overlayContext?.overlaySpec) return nonVetoed;
    const results = applyOverlayV2(
      nonVetoed,
      job.canonicals,
      overlayContext.overlaySpec,
      overlayContext.profile ?? undefined,
      overlayContext.economicSide,
    );
    return results.filter(r => !r.excluded).map(r => r.match);
  }, [job.matches, job.canonicals, overlayContext]);

  const shortId = jobId ? jobId.slice(-6) : '...';

  return (
    <div className="flex flex-col h-screen bg-[#09090b]" style={{ animation: 'pageIn 0.25s ease-out' }}>

      {/* ── HEADER ── */}
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <Breadcrumb
          items={[
            { label: 'Station', to: '/station' },
            { label: 'Runs', to: '/station/runs' },
            { label: `#${shortId}`, to: `/station/run/${jobId}` },
            { label: 'Compose' },
          ]}
        />
        <div className="flex items-center gap-3 font-mono" style={{ fontSize: '10px' }}>
          {overlayContext?.overlayClientName && (
            <span className="text-white/30 px-2 py-0.5 border border-white/[0.06] rounded-sm">
              Lens: {overlayContext.overlayClientName}
            </span>
          )}
          {effectiveMatches.filter(m => m.evalStatus === 'curated').length > 0 && (
            <span style={{ color: '#34d399' }}>
              {effectiveMatches.filter(m => m.evalStatus === 'curated').length} vetted
            </span>
          )}
          <span className="text-white/20">
            {effectiveMatches.length} total
          </span>
          <button
            onClick={() => navigate('/settings')}
            className="font-mono text-white/20 hover:text-white/40 underline underline-offset-2 transition-colors"
            style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '10px', padding: 0 }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* ── EXECUTION TIER ── */}
      <div className="flex items-center justify-end px-5 py-1 border-b border-white/[0.04] bg-white/[0.01]">
        <ExecutionBadge mode="global" />
      </div>

      {/* ── COMPOSE PANEL (full-width) ── */}
      <div className="flex-1 min-h-0">
        <ComposePanel
          matches={effectiveMatches}
          canonicals={job.canonicals}
          enrichResults={enrichResults}
          aiConfig={aiConfig}
          senderConfig={senderConfig}
          operatorId={operatorId}
          overlayClientId={overlayContext?.overlayClientId}
          overlayVersion={overlayContext?.overlayVersion}
          overlayClientName={overlayContext?.overlayClientName}
          overlayHash={overlayContext?.overlayHash}
          fulfillmentClient={fulfillmentClient}
        />
      </div>

      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
