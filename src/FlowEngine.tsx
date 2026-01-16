/**
 * FLOW ENGINE — Premium Matching Experience
 *
 * Linear/Vercel/Apple aesthetic
 * Connector language (no lead gen)
 * Premium, breathing, minimal
 *
 * 5 Steps: START → SCAN → RESULTS → ENRICH → ROUTE
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Services
import { fetchJobSignals } from './services/SignalsClient';
import { fetchSupplySignals, SupplyCompany } from './services/SupplySignalsClient';
import { generateIntro } from './services/AIService';
import { enrichPerson, EnrichmentConfig } from './services/PersonEnrichmentService';
import { sendToInstantly, DualSendParams } from './services/InstantlyService';
import { isFromHub, hasHubContacts, getHubContactsAsDemandSignals } from './services/ConnectorHubAdapter';

// Types - Niche agnostic
interface DemandSignal {
  id: string;
  domain: string;
  companyName: string;
  signalSummary: string;  // Whatever signal triggered this (generic)
  raw: any;               // Keep original data
  contact?: {
    email: string;
    name: string;
    title: string;
  };
  intro?: string;
}

interface MatchedPair {
  demand: DemandSignal;
  supply: SupplyCompany;
}

interface FlowState {
  step: 'start' | 'scanning' | 'results' | 'enriching' | 'ready' | 'sending' | 'complete';
  demandSignals: DemandSignal[];
  supplyCompanies: SupplyCompany[];
  matches: MatchedPair[];
  enrichedCount: number;
  introsGenerated: number;
  sentCount: number;
  error: string | null;
}

// =============================================================================
// SETTINGS LOADER
// =============================================================================

async function loadSettings() {
  // Load from localStorage (guest) or would load from Supabase (auth)
  const stored = localStorage.getItem('guest_settings');
  console.log('[FlowEngine] Raw localStorage:', stored ? 'exists' : 'empty');

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const { settings } = parsed;
      console.log('[FlowEngine] Parsed settings:', settings);
      console.log('[FlowEngine] demandDatasetId:', settings?.demandDatasetId);
      console.log('[FlowEngine] apifyToken:', settings?.apifyToken ? 'set' : 'missing');
      console.log('[FlowEngine] enrichmentApiKey (Apollo):', settings?.enrichmentApiKey ? 'set' : 'MISSING');

      if (!settings) return null;

      // Map to FlowEngine's expected keys (matching Settings.tsx key names)
      const mapped = {
        apifyToken: settings.apifyToken,
        demandDatasetId: settings.demandDatasetId,
        supplyDatasetId: settings.supplyDatasetId,
        // Enrichment keys (Settings uses apolloApiKey, anymailApiKey)
        apolloApiKey: settings.apolloApiKey,
        anymailFinderApiKey: settings.anymailApiKey,
        ssmApiKey: settings.ssmApiKey,
        // Instantly
        instantlyApiKey: settings.instantlyApiKey,
        demandCampaignId: settings.instantlyCampaignDemand,
        supplyCampaignId: settings.instantlyCampaignSupply,
        // AI keys (Settings uses openaiApiKey, claudeApiKey, azureApiKey)
        aiProvider: settings.aiProvider || 'openai',
        openaiKey: settings.openaiApiKey,
        anthropicKey: settings.claudeApiKey,
        azureKey: settings.azureApiKey,
        azureEndpoint: settings.azureEndpoint,
        azureDeployment: settings.azureDeployment,
      };
      console.log('[FlowEngine] Mapped settings:', mapped);
      return mapped;
    } catch (e) {
      console.error('[FlowEngine] Parse error:', e);
      return null;
    }
  }
  return null;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function FlowEngine() {
  const [state, setState] = useState<FlowState>({
    step: 'start',
    demandSignals: [],
    supplyCompanies: [],
    matches: [],
    enrichedCount: 0,
    introsGenerated: 0,
    sentCount: 0,
    error: null,
  });

  const [settings, setSettings] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const abortRef = useRef(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // =============================================================================
  // STEP 1: SCAN FOR SIGNALS
  // =============================================================================

  const startScanning = useCallback(async () => {
    if (!settings) return;

    abortRef.current = false;
    setState(prev => ({ ...prev, step: 'scanning', error: null }));
    setProgress({ current: 0, total: 100, message: 'Loading signals...' });

    try {
      // =========================================================================
      // HUB ADAPTER: Check if contacts came from Connector Hub
      // This is a side-channel - does NOT modify existing flow logic
      // =========================================================================
      if (isFromHub() && hasHubContacts()) {
        console.log('[FlowEngine] Hub source detected - using adapter');
        setProgress({ current: 30, total: 100, message: 'Loading Hub contacts...' });

        // Get Hub contacts transformed to DemandSignal format
        const hubSignals = getHubContactsAsDemandSignals();
        console.log('[FlowEngine] Hub adapter returned', hubSignals.length, 'signals');

        // Dedupe by domain
        const seenDomains = new Set<string>();
        const dedupedDemand = hubSignals.filter(d => {
          if (seenDomains.has(d.domain)) return false;
          seenDomains.add(d.domain);
          return true;
        });

        setProgress({ current: 60, total: 100, message: 'Finding providers...' });

        // Fetch supply signals (same as normal flow)
        let supplyCompanies: SupplyCompany[] = [];
        if (settings.supplyDatasetId && settings.apifyToken) {
          const supplyResult = await fetchSupplySignals(
            settings.supplyDatasetId,
            undefined,
            undefined,
            settings.apifyToken
          );
          supplyCompanies = supplyResult.companies || [];
        }

        setProgress({ current: 80, total: 100, message: 'Matching...' });

        // Simple matching - pair each demand with supply
        const matches: MatchedPair[] = [];
        for (let i = 0; i < dedupedDemand.length; i++) {
          const demand = dedupedDemand[i];
          const supply = supplyCompanies.length > 0
            ? supplyCompanies[i % supplyCompanies.length]
            : null;
          if (supply) {
            matches.push({ demand, supply });
          }
        }

        setProgress({ current: 100, total: 100, message: 'Done' });

        // Clear URL param after processing
        window.history.replaceState({}, '', window.location.pathname);

        setState(prev => ({
          ...prev,
          step: 'results',
          demandSignals: dedupedDemand,
          supplyCompanies,
          matches,
        }));
        return; // Exit early - Hub flow complete
      }
      // =========================================================================
      // END HUB ADAPTER - Normal flow continues below
      // =========================================================================

      // Build config from settings
      const config = {
        demandDatasetId: settings.demandDatasetId,
        supplyDatasetId: settings.supplyDatasetId,
        apifyToken: settings.apifyToken,
      };

      if (!config.demandDatasetId) {
        throw new Error('Add a demand dataset in Settings');
      }

      // Fetch demand signals
      setProgress({ current: 20, total: 100, message: 'Finding companies with signals...' });
      const demandResult = await fetchJobSignals(config, '');
      console.log('[FlowEngine] demandResult:', demandResult);

      // Handle both formats: rawPayload can be array directly OR { data: [...] }
      const rawDemand = Array.isArray(demandResult.rawPayload)
        ? demandResult.rawPayload
        : demandResult.rawPayload?.data || demandResult.rawPayload?.original || [];

      console.log('[FlowEngine] rawDemand count:', rawDemand.length);
      console.log('[FlowEngine] First item:', rawDemand[0]);

      if (!rawDemand.length) {
        throw new Error('No demand signals found in dataset');
      }

      // Parse demand signals - niche agnostic
      // Debug first item's keys
      console.log('[FlowEngine] First item keys:', Object.keys(rawDemand[0]));
      console.log('[FlowEngine] companyWebsite:', rawDemand[0].companyWebsite);

      // Detect schema from first item fingerprint
      const sample = rawDemand[0]?.raw || rawDemand[0];
      let detectedSchema: 'B2B_CONTACTS' | 'STARTUP_JOBS' = 'STARTUP_JOBS';
      if ('first_name' in sample && 'company_domain' in sample) {
        detectedSchema = 'B2B_CONTACTS';
      } else if ('job_id' in sample && 'job_title' in sample) {
        detectedSchema = 'STARTUP_JOBS';
      }
      console.log('[FlowEngine] Detected schema:', detectedSchema);

      const demandSignals: DemandSignal[] = rawDemand.slice(0, 100).map((item: any, idx: number) => {
        // Use raw data if available (before normalization), otherwise use item directly
        const source = item.raw || item;
        const domain = extractDomain(source);
        const companyName = extractCompanyName(source, domain);
        const signalSummary = extractSignalSummary(source, detectedSchema);
        const existingContact = extractExistingContact(source);

        if (idx < 3) {
          console.log(`[FlowEngine] Item ${idx}: domain="${domain}" company="${companyName}"`);
        }

        return {
          id: `demand-${idx}`,
          domain,
          companyName,
          signalSummary,
          raw: source,
          contact: existingContact,
        };
      }).filter((d: DemandSignal) => d.domain);

      console.log('[FlowEngine] After filter:', demandSignals.length);

      // Dedupe by domain
      const seenDomains = new Set<string>();
      const dedupedDemand = demandSignals.filter(d => {
        if (seenDomains.has(d.domain)) return false;
        seenDomains.add(d.domain);
        return true;
      });

      setProgress({ current: 50, total: 100, message: 'Finding providers...' });

      // Fetch supply signals
      let supplyCompanies: SupplyCompany[] = [];
      if (config.supplyDatasetId) {
        const supplyResult = await fetchSupplySignals(
          config.supplyDatasetId,
          undefined,
          undefined,
          config.apifyToken
        );
        supplyCompanies = supplyResult.companies || [];
      }

      setProgress({ current: 80, total: 100, message: 'Matching...' });

      // Simple matching - pair each demand with supply (round-robin if multiple)
      const matches: MatchedPair[] = [];
      for (let i = 0; i < dedupedDemand.length; i++) {
        if (abortRef.current) break;

        const demand = dedupedDemand[i];
        // Round-robin supply assignment, or use first if only one
        const supply = supplyCompanies.length > 0
          ? supplyCompanies[i % supplyCompanies.length]
          : null;

        if (supply) {
          matches.push({ demand, supply });
        }
      }

      setProgress({ current: 100, total: 100, message: 'Done' });

      setState(prev => ({
        ...prev,
        step: 'results',
        demandSignals: dedupedDemand,
        supplyCompanies,
        matches,
      }));

    } catch (err) {
      console.error('[MatchingFlow] Scan failed:', err);
      setState(prev => ({
        ...prev,
        step: 'start',
        error: err instanceof Error ? err.message : 'Failed to scan',
      }));
    }
  }, [settings]);

  // =============================================================================
  // STEP 2: ENRICH CONTACTS (Real Apollo)
  // =============================================================================

  const startEnriching = useCallback(async () => {
    setState(prev => ({ ...prev, step: 'enriching' }));

    const { matches } = state;
    const needsEnrichment = matches.filter(m => !m.demand.contact?.email);
    const alreadyEnriched = matches.filter(m => m.demand.contact?.email).length;

    console.log('[FlowEngine] Enrichment starting');
    console.log('[FlowEngine] Total matches:', matches.length);
    console.log('[FlowEngine] Already have contact:', alreadyEnriched);
    console.log('[FlowEngine] Need enrichment:', needsEnrichment.length);

    setProgress({ current: 0, total: needsEnrichment.length, message: 'Finding decision makers...' });

    // Build enrichment config from settings
    const enrichmentConfig: EnrichmentConfig = {
      provider: settings?.apolloApiKey ? 'apollo' : 'none',
      apiKey: settings?.apolloApiKey,
      anymailFinderApiKey: settings?.anymailFinderApiKey,
    };

    if (enrichmentConfig.provider === 'none') {
      console.log('[FlowEngine] No Apollo API key configured');
      setState(prev => ({
        ...prev,
        step: 'ready',
        enrichedCount: alreadyEnriched,
        error: 'Configure Apollo API key in Settings to enrich contacts',
      }));
      return;
    }

    console.log('[FlowEngine] Apollo configured, starting enrichment loop');
    let successCount = 0;

    for (let i = 0; i < needsEnrichment.length; i++) {
      if (abortRef.current) break;

      const match = needsEnrichment[i];
      const matchIndex = matches.findIndex(m => m.demand.id === match.demand.id);

      console.log(`[FlowEngine] Enriching ${i + 1}/${needsEnrichment.length}: ${match.demand.domain}`);

      try {
        // Call real Apollo enrichment - niche agnostic
        const person = await enrichPerson(
          match.demand.domain,
          [], // No specific titles - let Apollo find decision makers
          enrichmentConfig,
          [], // whoRoles
          {
            companyName: match.demand.companyName,
          }
        );

        console.log(`[FlowEngine] Apollo result for ${match.demand.domain}:`, person?.email ? 'found' : 'not found');

        if (person?.email && person.status !== 'not_found') {
          successCount++;
          // Update the match with enriched contact
          setState(prev => ({
            ...prev,
            matches: prev.matches.map((m, idx) =>
              idx === matchIndex
                ? {
                    ...m,
                    demand: {
                      ...m.demand,
                      contact: {
                        email: person.email!,
                        name: person.name || '',
                        title: person.title || '',
                      },
                    },
                  }
                : m
            ),
          }));
        }
      } catch (err) {
        console.error('[FlowEngine] Enrichment failed for', match.demand.domain, err);
      }

      setProgress({ current: i + 1, total: needsEnrichment.length, message: `${i + 1} of ${needsEnrichment.length}` });
    }

    // Now generate intros for all enriched contacts
    const aiConfig = {
      enabled: Boolean(settings?.azureKey || settings?.openaiKey || settings?.anthropicKey),
      provider: (settings?.aiProvider || 'openai') as 'azure' | 'openai' | 'anthropic',
      model: settings?.aiModel || 'gpt-4o-mini',
      apiKey: settings?.azureKey || settings?.openaiKey || settings?.anthropicKey || '',
      endpoint: settings?.azureEndpoint,
      deployment: settings?.azureDeployment,
    };

    // Get updated matches with contacts
    const currentMatches = state.matches;
    const enrichedMatches = currentMatches.filter(m => m.demand.contact?.email);

    setProgress({ current: 0, total: enrichedMatches.length, message: 'Generating intros...' });

    let introCount = 0;
    for (let i = 0; i < enrichedMatches.length; i++) {
      if (abortRef.current) break;

      const match = enrichedMatches[i];
      const matchIndex = currentMatches.findIndex(m => m.demand.id === match.demand.id);

      const introResult = await generateIntro(
        {
          type: 'demand',
          signalDetail: match.demand.signalSummary,
          context: {
            firstName: match.demand.contact?.name?.split(' ')[0] || 'there',
            company: match.demand.companyName,
          },
        },
        aiConfig
      );

      if (introResult.intro) {
        introCount++;
        setState(prev => ({
          ...prev,
          matches: prev.matches.map((m, idx) =>
            idx === matchIndex ? { ...m, demand: { ...m.demand, intro: introResult.intro } } : m
          ),
        }));
      }

      setProgress({ current: i + 1, total: enrichedMatches.length, message: `${i + 1} of ${enrichedMatches.length}` });
    }

    // Move to ready state with counts
    setState(prev => ({
      ...prev,
      step: 'ready',
      enrichedCount: alreadyEnriched + successCount,
      introsGenerated: introCount,
    }));
  }, [state.matches, settings]);

  // =============================================================================
  // STEP 3: START SENDING (intros already generated during enrichment)
  // =============================================================================

  const startRouting = useCallback(async () => {
    const enrichedMatches = state.matches.filter(m => m.demand.contact?.email);

    if (enrichedMatches.length === 0) {
      setState(prev => ({ ...prev, error: 'No contacts to send to. Enrich first.' }));
      return;
    }

    // Intros already generated - go straight to sending
    setState(prev => ({ ...prev, step: 'sending' }));
    startSending();
  }, [state.matches]);

  // =============================================================================
  // STEP 4: SEND TO INSTANTLY
  // =============================================================================

  const startSending = useCallback(async () => {
    const instantlyApiKey = settings?.instantlyApiKey;
    const demandCampaignId = settings?.demandCampaignId;

    if (!instantlyApiKey || !demandCampaignId) {
      setState(prev => ({
        ...prev,
        step: 'complete',
        error: 'Configure Instantly API key and campaign in Settings',
      }));
      return;
    }

    // Only send matches with enriched contacts
    const toSend = state.matches.filter(m => m.demand.contact?.email);

    setProgress({ current: 0, total: toSend.length, message: 'Sending to Instantly...' });

    let sentCount = 0;

    for (let i = 0; i < toSend.length; i++) {
      if (abortRef.current) break;

      const match = toSend[i];
      const contact = match.demand.contact!;
      const nameParts = contact.name.split(' ');

      try {
        const params: DualSendParams = {
          campaignId: demandCampaignId,
          email: contact.email,
          first_name: nameParts[0] || 'there',
          last_name: nameParts.slice(1).join(' ') || '',
          company_name: match.demand.companyName,
          website: match.demand.domain,
          type: 'DEMAND',
          contact_title: contact.title,
          company_domain: match.demand.domain,
          intro_text: match.demand.intro,
          signal_metadata: {
            signal: match.demand.signalSummary,
          },
          supply_domain: match.supply.domain,
        };

        const result = await sendToInstantly(instantlyApiKey, params);

        if (result.success) {
          sentCount++;
        } else {
          console.error('[FlowEngine] Send failed:', match.demand.domain, result.error);
        }
      } catch (err) {
        console.error('[FlowEngine] Send exception:', match.demand.domain, err);
      }

      setProgress({ current: i + 1, total: toSend.length, message: `${i + 1} of ${toSend.length}` });
    }

    // Move to complete
    setState(prev => ({
      ...prev,
      step: 'complete',
      sentCount,
    }));
  }, [state.matches, settings]);

  // =============================================================================
  // HELPERS
  // =============================================================================

  // Niche-agnostic field extraction - tries common field names
  function extractDomain(item: any): string {
    // Try all common domain/website field variations
    // Check nested objects too (company.*, raw.*)
    const url = item.company_domain || item.companyDomain ||
                item.company_website || item.companyWebsite ||
                item.company_url || item.companyUrl ||
                item.website || item.domain || item.url ||
                // Nested in company object
                item.company?.website || item.company?.domain || item.company?.url ||
                // Original data in raw field (from normalization)
                item.raw?.companyWebsite || item.raw?.company_website ||
                item.raw?.companyDomain || item.raw?.company_domain ||
                item.raw?.website || item.raw?.domain || '';
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }

  function extractCompanyName(item: any, fallbackDomain: string): string {
    // Handle nested company object (STARTUP_JOBS / Wellfound)
    if (item.company && typeof item.company === 'object') {
      return item.company.name || item.company.company_name || fallbackDomain;
    }
    return item.company_name || item.companyName || item.company || item.name || item.organization || fallbackDomain;
  }

  function simplifyRole(signal: string): string {
    if (!signal) return 'talent';
    const s = signal.toLowerCase();
    if (/engineer|developer|programmer|software|swe\b|sde\b/i.test(s)) return 'engineers';
    if (/sales|account executive|ae\b|sdr\b|bdr\b|business development/i.test(s)) return 'sales reps';
    if (/marketing|growth|brand|content|seo|sem|ppc/i.test(s)) return 'marketers';
    if (/recruiter|talent|hr\b|human resources|people ops/i.test(s)) return 'recruiters';
    if (/product manager|product owner|pm\b/i.test(s)) return 'product people';
    if (/design|ux|ui\b|creative/i.test(s)) return 'designers';
    if (/data|analyst|analytics|scientist/i.test(s)) return 'data people';
    if (/finance|accounting|cfo|controller|fp&a/i.test(s)) return 'finance people';
    if (/operations|ops\b|supply chain|logistics/i.test(s)) return 'ops people';
    if (/customer success|support|client/i.test(s)) return 'customer success';
    if (/legal|lawyer|attorney|compliance/i.test(s)) return 'legal counsel';
    return 'talent';
  }

  function extractSignalSummary(item: any, schemaType: 'B2B_CONTACTS' | 'STARTUP_JOBS'): string {
    if (schemaType === 'STARTUP_JOBS') {
      // Hiring dataset → normalize job title into hiring signal
      const rawTitle = item.job_title || item.jobTitle || item.title || item.position;
      return rawTitle ? `hiring ${simplifyRole(rawTitle)}` : 'actively hiring';
    }

    if (schemaType === 'B2B_CONTACTS') {
      // Curated contacts → NO hiring inference
      return item.signal || item.summary || 'operating in market';
    }

    return 'active';
  }

  function extractExistingContact(item: any): DemandSignal['contact'] | undefined {
    // Try various email field names
    const email = item.email || item.contact_email || item.contactEmail ||
                  item.person_email || item.personal_email || item.work_email;
    if (!email || !email.includes('@')) return undefined;

    // Build name from various field combinations
    const name = item.full_name || item.fullName || item.contact_name || item.contactName ||
                 item.person_name || item.name ||
                 `${item.first_name || item.firstName || ''} ${item.last_name || item.lastName || ''}`.trim();

    return {
      email,
      name,
      title: item.job_title || item.jobTitle || item.contact_title || item.contactTitle ||
             item.person_title || item.title || item.position || '',
    };
  }

  const reset = () => {
    abortRef.current = true;
    setState({
      step: 'start',
      demandSignals: [],
      supplyCompanies: [],
      matches: [],
      enrichedCount: 0,
      introsGenerated: 0,
      sentCount: 0,
      error: null,
    });
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center">
      <div className="w-full max-w-[480px] px-6">
        <AnimatePresence mode="wait">
          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: START - Boot screen */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* System icon */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="mb-8"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center">
                  <div className="w-6 h-6 rounded-md bg-white/80" />
                </div>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-[17px] font-medium text-white/90 mb-2"
              >
                Flow Engine
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-[13px] text-white/40 mb-10"
              >
                Match · Enrich · Route
              </motion.p>

              {/* Error */}
              {state.error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-6"
                >
                  <p className="text-[12px] text-white/40 mb-3">
                    {state.error}
                  </p>
                  <a
                    href="/settings"
                    className="text-[12px] text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors"
                  >
                    Open Settings
                  </a>
                </motion.div>
              )}

              {/* Start button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                onClick={startScanning}
                disabled={!settings}
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Start
              </motion.button>

              {/* Status */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="mt-10 flex items-center justify-center gap-2"
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-violet-400"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                />
                <span className="text-[11px] text-white/30">System ready</span>
              </motion.div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: SCANNING */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Spinner */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-10 h-10 mx-auto mb-8 rounded-full border-2 border-white/10 border-t-white/60"
              />

              <h1 className="text-[17px] font-medium text-white/90 mb-2">
                Scanning
              </h1>

              <p className="text-[13px] text-white/40 mb-8">
                {progress.message}
              </p>

              {/* Progress */}
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white/50 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.current}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: RESULTS */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Count */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="text-[48px] font-light text-white mb-2"
              >
                {state.matches.length}
              </motion.div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">
                Matches found
              </h1>

              <p className="text-[13px] text-white/40 mb-10">
                {state.demandSignals.length} signals · {state.supplyCompanies.length} providers
              </p>

              {/* Actions */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-[13px] text-white/50 hover:text-white/70 transition-colors"
                >
                  Start over
                </button>
                <button
                  onClick={startEnriching}
                  className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
                >
                  Enrich
                </button>
              </div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: ENRICHING */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'enriching' && (
            <motion.div
              key="enriching"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Counter */}
              <div className="text-[48px] font-light text-white mb-2">
                {progress.current}<span className="text-white/30">/{progress.total}</span>
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">
                Enriching
              </h1>

              <p className="text-[13px] text-white/40 mb-8">
                Finding decision makers
              </p>

              {/* Progress */}
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-400/60 rounded-full"
                    style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              <p className="mt-8 text-[11px] text-white/25">
                Safe to leave
              </p>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: READY */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Success icon */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-16 h-16 mx-auto mb-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center"
              >
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">
                Ready to route
              </h1>

              <p className="text-[13px] text-white/40 mb-6">
                {state.enrichedCount} contacts · {state.introsGenerated} intros
              </p>

              {/* Intro previews */}
              {state.introsGenerated > 0 && (
                <div className="mb-8 space-y-3">
                  {state.matches
                    .filter(m => m.demand.intro)
                    .slice(0, 2)
                    .map((match, idx) => (
                      <motion.div
                        key={match.demand.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + idx * 0.1 }}
                        className="text-left p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <p className="text-[12px] text-white/30 mb-1.5">
                          {match.demand.contact?.name || 'Contact'} at {match.demand.companyName}
                        </p>
                        <p className="text-[13px] text-white/70 leading-relaxed">
                          {match.demand.intro}
                        </p>
                      </motion.div>
                    ))}
                  {state.introsGenerated > 2 && (
                    <p className="text-[11px] text-white/25">
                      +{state.introsGenerated - 2} more
                    </p>
                  )}
                </div>
              )}

              {state.error && (
                <div className="mb-6">
                  <p className="text-[12px] text-white/40 mb-3">
                    {state.error}
                  </p>
                  <a
                    href="/settings"
                    className="text-[12px] text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors"
                  >
                    Open Settings
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-[13px] text-white/50 hover:text-white/70 transition-colors"
                >
                  Start over
                </button>
                <button
                  onClick={startRouting}
                  className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
                >
                  Route to Instantly
                </button>
              </div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: SENDING */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'sending' && (
            <motion.div
              key="sending"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Counter */}
              <div className="text-[48px] font-light text-white mb-2">
                {progress.current}<span className="text-white/30">/{progress.total}</span>
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">
                Routing
              </h1>

              <p className="text-[13px] text-white/40 mb-8">
                Sending to Instantly
              </p>

              {/* Progress */}
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-400/60 rounded-full"
                    style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* STEP: COMPLETE */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {state.step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              {/* Success icon */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-16 h-16 mx-auto mb-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center"
              >
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">
                Complete
              </h1>

              <p className="text-[13px] text-white/40 mb-10">
                {state.sentCount} routed to Instantly
              </p>

              {state.error && (
                <div className="mb-6">
                  <p className="text-[12px] text-white/40 mb-3">
                    {state.error}
                  </p>
                  <a
                    href="/settings"
                    className="text-[12px] text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors"
                  >
                    Open Settings
                  </a>
                </div>
              )}

              {/* Action */}
              <button
                onClick={reset}
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
              >
                Run again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
