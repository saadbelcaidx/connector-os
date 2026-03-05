/**
 * TestComposeV2 — Operator-writes-first compose proof of concept
 *
 * Throwaway test page. Pick a completed run, write intros for the first PASS match,
 * then let GPT-4o mimic your voice across remaining matches.
 *
 * If it works -> build the real engine. If it drifts -> kill the approach.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { callAI } from '../../services/IntroAI';
import type { IntroAIConfig } from '../../services/IntroAI';
import { cleanCompanyName } from '../intro/engine';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';

// AI config loaded from localStorage — never hardcode keys
const AI_CONFIG: IntroAIConfig = (() => {
  try {
    const raw = localStorage.getItem('ai_settings');
    if (!raw) return { provider: 'azure' as const, apiKey: '', azureEndpoint: '', azureDeployment: 'gpt-4o' };
    const s = JSON.parse(raw);
    return {
      provider: 'azure' as const,
      apiKey: s.azureApiKey || '',
      azureEndpoint: s.azureEndpoint || 'https://outreachking.openai.azure.com',
      azureDeployment: s.azureDeployment || 'gpt-4o',
    };
  } catch {
    return { provider: 'azure' as const, apiKey: '', azureEndpoint: '', azureDeployment: 'gpt-4o' };
  }
})();

interface GeneratedDraft {
  id: string;
  supplyIntro: string;
  demandIntro: string;
}

interface JobOption {
  job_id: string;
  market_name: string;
  completed_at: string;
  total_pairs: number;
}

export default function TestComposeV2() {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [canonicals, setCanonicals] = useState<Map<string, CanonicalInfo>>(new Map());
  const [supplyDraft, setSupplyDraft] = useState('');
  const [demandDraft, setDemandDraft] = useState('');
  const [generatedDrafts, setGeneratedDrafts] = useState<GeneratedDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load completed jobs on mount
  useEffect(() => {
    async function loadJobs() {
      const { data } = await supabase
        .from('mcp_jobs')
        .select('job_id, market_name, completed_at, total_pairs')
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(20);
      if (data) setJobs(data);
    }
    loadJobs();
  }, []);

  // Load matches + canonicals when job selected
  useEffect(() => {
    if (!selectedJobId) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setMatches([]);
      setCanonicals(new Map());
      setGeneratedDrafts([]);
      setSupplyDraft('');
      setDemandDraft('');

      // 1. Load evaluations
      const { data: evals, error: evalErr } = await supabase
        .from('mcp_evaluations')
        .select('*')
        .eq('job_id', selectedJobId)
        .in('eval_status', ['reasoned', 'curated'])
        .order('scores->combined', { ascending: false });

      if (evalErr) {
        setError(evalErr.message);
        setLoading(false);
        return;
      }

      // 2. Filter to PASS only (combined >= 0.5)
      const passMatches: MatchResult[] = (evals || [])
        .filter((row) => (row.scores?.combined || 0) >= 0.5)
        .map((row) => ({
          id: row.id,
          evalId: row.eval_id,
          demandKey: row.demand_key,
          supplyKey: row.supply_key,
          scores: row.scores || { fit: 0, timing: 0, combined: 0 },
          classification: 'PASS' as const,
          readiness: (row.readiness || 'NOT_YET') as MatchResult['readiness'],
          vetoed: row.vetoed || false,
          vetoReason: row.veto_reason || null,
          risks: row.risks || [],
          framing: row.framing || '',
          reasoning: row.reasoning || '',
          similarity: row.similarity || 0,
          rank: row.rank || 0,
          evaluatedAt: row.evaluated_at || '',
          evalStatus: (row.eval_status || 'reasoned') as MatchResult['evalStatus'],
        }));

      if (passMatches.length === 0) {
        setError('No PASS matches found for this run.');
        setLoading(false);
        return;
      }

      // 3. Load canonicals
      const allKeys = [...new Set(passMatches.flatMap((m) => [m.demandKey, m.supplyKey]))];
      const { data: canonData } = await supabase
        .from('dmcb_canonicals')
        .select('record_key, canonical')
        .in('record_key', allKeys);

      const cMap = new Map<string, CanonicalInfo>();
      for (const row of canonData || []) {
        const c: Record<string, unknown> = (row.canonical as Record<string, unknown>) || {};
        cMap.set(row.record_key, {
          company: cleanCompanyName((c.company as string) || (c.who as string) || ''),
          wants: (c.wants as string) || '',
          offers: (c.offers as string) || (c.wants as string) || '',
          role: ((c.role as string) || '') as CanonicalInfo['role'],
          who: (c.who as string) || '',
          whyNow: (c.why_now as string) || '',
          industry: (c.industry as string) || null,
          title: (c.title as string) || null,
          seniority: (c.seniority as string) || null,
          keywords: Array.isArray(c.keywords) ? (c.keywords as string[]) : [],
          domain: (c.domain as string) || null,
          entityType: c.entity_type === 'person' ? 'person' : 'organization',
        });
      }

      setMatches(passMatches);
      setCanonicals(cMap);
      setLoading(false);
    }
    loadData();
  }, [selectedJobId]);

  // Build PairContext string from match + canonicals
  function buildPairContext(match: MatchResult): string {
    const d = canonicals.get(match.demandKey);
    const s = canonicals.get(match.supplyKey);
    return [
      `Demand: ${d?.company || match.demandKey} (contact: ${d?.who || 'unknown'}) — industry: ${d?.industry || 'n/a'} — wants: ${d?.wants || 'n/a'} — why now: ${d?.whyNow || 'n/a'}`,
      `Supply: ${s?.company || match.supplyKey} (contact: ${s?.who || 'unknown'}) — industry: ${s?.industry || 'n/a'} — offers: ${s?.offers || 'n/a'}`,
      `Match framing: ${match.framing || 'n/a'}`,
      `Reasoning: ${match.reasoning || 'n/a'}`,
    ].join('\n');
  }

  // Generate remaining intros via AI
  async function handleGenerate() {
    if (matches.length < 2) {
      setError('Need at least 2 PASS matches to generate.');
      return;
    }
    if (!supplyDraft.trim() || !demandDraft.trim()) {
      setError('Write both supply and demand intros first.');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedDrafts([]);

    const ref = matches[0];
    const refD = canonicals.get(ref.demandKey);
    const refS = canonicals.get(ref.supplyKey);
    const remaining = matches.slice(1, 11); // Cap at 10

    const prompt = `You are ghostwriting outreach intros for a market operator. Below is ONE example pair the operator wrote by hand for a specific match. Your job: figure out the operator's voice, structure, and style yourself — then write NEW intros for each remaining match.

STEP 1 — THE REFERENCE:
The operator wrote these intros for this specific match:

Match context:
${buildPairContext(ref)}
Supply contact: ${refS?.who || '?'} at ${refS?.company || '?'}
Demand contact: ${refD?.who || '?'} at ${refD?.company || '?'}

Supply intro (sent to ${refS?.who || 'supply contact'}):
${supplyDraft}

Demand intro (sent to ${refD?.who || 'demand contact'}):
${demandDraft}

STEP 2 — ANALYZE IT YOURSELF:
Look at the reference intros and figure out:
- How many paragraphs? What role does each one play?
- What's the tone and sentence rhythm?
- Which parts are this operator's STYLE (reusable across any match)?
- Which parts are SPECIFIC to the reference match's context (industry, signal, timing, capability)?

STEP 3 — WRITE NEW INTROS:
For each match below, write a supply intro and demand intro that:
- Follow the SAME structure, paragraph count, and approximate length as the reference
- Sound like the SAME person wrote them
- Replace all match-specific content with details from the NEW match's context
- Supply intro is sent to the supply contact
- Demand intro is sent to the demand contact
- NEVER copy full sentences from the reference. Reconstruct from pattern + new context.
- If the reference names companies or contacts, do the same with the new match's real names. If it doesn't, don't.

Return ONLY a JSON array: [{ "id": "eval_id", "supplyIntro": "...", "demandIntro": "..." }]

MATCHES:
${remaining.map((m, i) => {
      const md = canonicals.get(m.demandKey);
      const ms = canonicals.get(m.supplyKey);
      return `[${i + 1}] id: ${m.evalId}
Demand: ${md?.company || '?'} (contact: ${md?.who || '?'}) — industry: ${md?.industry || '?'} — wants: ${md?.wants || '?'} — whyNow: ${md?.whyNow || '?'}
Supply: ${ms?.company || '?'} (contact: ${ms?.who || '?'}) — industry: ${ms?.industry || '?'} — offers: ${ms?.offers || '?'}
Framing: ${m.framing || '?'}`;
    }).join('\n\n')}`;

    try {
      const maxTokens = Math.min(300 * remaining.length, 6000);
      const raw = await callAI(AI_CONFIG, prompt, maxTokens);

      // Parse JSON from response (strip markdown fences if present)
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as GeneratedDraft[];
      setGeneratedDrafts(parsed);
    } catch (e) {
      setError(`AI generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  }

  const referenceMatch = matches[0] || null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <h1 className="text-2xl font-bold mb-2">V2 Compose Test</h1>
      <p className="text-white/50 text-sm mb-6">
        Operator writes first, AI mimics voice across remaining matches.
      </p>

      {/* Job picker */}
      <div className="mb-6">
        <label className="block text-sm text-white/60 mb-1">Pick a completed run</label>
        <select
          className="bg-[#14141f] border border-white/10 rounded px-3 py-2 text-white w-full max-w-md"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
        >
          <option value="">Select a run...</option>
          {jobs.map((j) => (
            <option key={j.job_id} value={j.job_id}>
              {j.market_name || j.job_id} — {j.total_pairs} pairs —{' '}
              {new Date(j.completed_at).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-white/40">Loading matches...</p>}
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Reference match + textareas */}
      {referenceMatch && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Reference Match ({matches.length} PASS total)
          </h2>

          <div className="bg-[#14141f] border border-white/10 rounded p-4 mb-4 text-sm font-mono whitespace-pre-wrap">
            {buildPairContext(referenceMatch)}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-white/60 mb-1">Supply Intro (your voice)</label>
              <textarea
                className="w-full bg-[#14141f] border border-white/10 rounded p-3 text-sm font-mono text-white resize-none"
                rows={6}
                value={supplyDraft}
                onChange={(e) => setSupplyDraft(e.target.value)}
                placeholder="Write the supply-side intro for the reference match above..."
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1">Demand Intro (your voice)</label>
              <textarea
                className="w-full bg-[#14141f] border border-white/10 rounded p-3 text-sm font-mono text-white resize-none"
                rows={6}
                value={demandDraft}
                onChange={(e) => setDemandDraft(e.target.value)}
                placeholder="Write the demand-side intro for the reference match above..."
              />
            </div>
          </div>

          <button
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-medium"
            onClick={handleGenerate}
            disabled={generating || !supplyDraft.trim() || !demandDraft.trim() || matches.length < 2}
          >
            {generating
              ? 'Generating...'
              : `Generate Rest (${Math.min(matches.length - 1, 10)} matches)`}
          </button>
        </div>
      )}

      {/* Generated drafts */}
      {generatedDrafts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">AI-Generated Drafts</h2>

          {/* Reference card pinned on top */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded p-4 mb-4">
            <div className="text-xs text-blue-400 uppercase tracking-wider mb-2">Your Reference</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-white/40 text-xs mb-1">Supply</div>
                <div className="whitespace-pre-wrap">{supplyDraft}</div>
              </div>
              <div>
                <div className="text-white/40 text-xs mb-1">Demand</div>
                <div className="whitespace-pre-wrap">{demandDraft}</div>
              </div>
            </div>
          </div>

          {/* AI drafts */}
          {generatedDrafts.map((draft, i) => {
            const match = matches.find((m) => m.evalId === draft.id);
            const d = match ? canonicals.get(match.demandKey) : null;
            const s = match ? canonicals.get(match.supplyKey) : null;
            return (
              <div key={draft.id || i} className="bg-[#14141f] border border-white/10 rounded p-4 mb-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-white/30">#{i + 1}</span>
                  <span className="text-sm font-medium">
                    {d?.company || '?'} × {s?.company || '?'}
                  </span>
                  {match && (
                    <span className="text-xs text-white/30">
                      combined: {match.scores.combined.toFixed(2)}
                    </span>
                  )}
                </div>
                {match && (
                  <div className="text-xs text-white/30 mb-2 font-mono truncate">
                    Framing: {match.framing}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/40 text-xs mb-1">Supply Intro</div>
                    <div className="whitespace-pre-wrap">{draft.supplyIntro}</div>
                  </div>
                  <div>
                    <div className="text-white/40 text-xs mb-1">Demand Intro</div>
                    <div className="whitespace-pre-wrap">{draft.demandIntro}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
