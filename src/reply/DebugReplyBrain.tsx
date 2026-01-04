/**
 * /debug/reply-brain - v20 Debug Page (SELF UNLOCK v1)
 *
 * Test classification, view telemetry, diagnose issues.
 * Includes automated smoke tests for critical invariants.
 */

import { useState } from 'react';

const EDGE_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/reply-brain';

interface Anchor {
  prospect_label: string;
  pain_sentence: string;
  offer_sentence: string;
  outbound_summary: string;
  quality: string;
  missing: string[];
}

interface Telemetry {
  version: string;
  runtimeMode: string;
  stagePrimary: string;
  stageSecondary: string[];
  negationDetected: boolean;
  anchorQuality: string;
  usedMicroRewrite: boolean;
  microRewriteAccepted: boolean;
  embarrassmentGateHit: boolean;
  unknownTriggers: string[];
  forbidTriggered: string[];
  latencyMs: number;
}

interface ReplyBrainResponse {
  stage: string;
  reply: string;
  meaning: string;
  response: string;
  next_move: string;
  anchor: Anchor;
  telemetry: Telemetry;
  error?: string;
}

// SELF UNLOCK v1: Smoke test cases
interface SmokeTestCase {
  name: string;
  inbound: string;
  outbound?: string;
  assert: (result: ReplyBrainResponse) => { pass: boolean; reason: string };
}

const SMOKE_TESTS: SmokeTestCase[] = [
  {
    name: 'Industry question: no "varies"',
    inbound: 'what industries are they in?',
    assert: (r) => {
      const hasVaries = /\bvaries\b|\bdepends\b/i.test(r.reply);
      return {
        pass: !hasVaries,
        reason: hasVaries ? 'Reply contains "varies" or "depends"' : 'OK',
      };
    },
  },
  {
    name: 'Pricing: deflect to call',
    inbound: 'what do you charge?',
    assert: (r) => {
      const forbidden = /\bfree\b|\bcommission\b|\breferral\b|\d+%/i.test(r.reply);
      const hasCall = /call|10-15|10–15|week/i.test(r.reply);
      return {
        pass: !forbidden && hasCall,
        reason: forbidden ? 'Contains money language' : !hasCall ? 'Missing call CTA' : 'OK',
      };
    },
  },
  {
    name: 'Pricing (terse): deflect to call',
    inbound: 'price?',
    assert: (r) => {
      const forbidden = /\bfree\b|\bcommission\b|\breferral\b|\d+%/i.test(r.reply);
      return {
        pass: !forbidden && r.stage === 'PRICING',
        reason: forbidden ? 'Contains money language' : r.stage !== 'PRICING' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
  {
    name: 'Negative: no call CTA',
    inbound: 'remove me from your list',
    assert: (r) => {
      const hasCall = /call|10-15|10–15|week|calendar/i.test(r.reply);
      return {
        pass: !hasCall && (r.stage === 'NEGATIVE' || r.stage === 'HOSTILE'),
        reason: hasCall ? 'Contains call CTA' : r.stage !== 'NEGATIVE' && r.stage !== 'HOSTILE' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
  {
    name: 'Hostile: no call CTA',
    inbound: 'fuck off spammer',
    assert: (r) => {
      const hasCall = /call|10-15|10–15|week|calendar/i.test(r.reply);
      return {
        pass: !hasCall && (r.stage === 'HOSTILE' || r.stage === 'NEGATIVE'),
        reason: hasCall ? 'Contains call CTA' : r.stage !== 'HOSTILE' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
  {
    name: 'Scheduling: provides CTA',
    inbound: 'send me your calendar',
    assert: (r) => {
      const hasCall = /call|10-15|10–15|week|calendar|book|schedule/i.test(r.reply);
      return {
        pass: hasCall && r.stage === 'SCHEDULING',
        reason: !hasCall ? 'Missing call/calendar CTA' : r.stage !== 'SCHEDULING' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
  {
    name: 'Interest: call-first',
    inbound: "i'm interested, tell me more",
    assert: (r) => {
      const hasCall = /call|10-15|10–15|week|align/i.test(r.reply);
      return {
        pass: hasCall && r.stage === 'INTEREST',
        reason: !hasCall ? 'Missing call CTA' : r.stage !== 'INTEREST' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
  {
    name: 'Identity: explains model',
    inbound: 'how does this work?',
    assert: (r) => {
      return {
        pass: r.stage === 'IDENTITY' || r.stage === 'SCOPE',
        reason: r.stage !== 'IDENTITY' && r.stage !== 'SCOPE' ? `Stage is ${r.stage}` : 'OK',
      };
    },
  },
];

interface SmokeTestResult {
  name: string;
  pass: boolean;
  reason: string;
  stage: string;
  reply: string;
  latencyMs: number;
}

export default function DebugReplyBrain() {
  const [inbound, setInbound] = useState('');
  const [outbound, setOutbound] = useState('');
  const [result, setResult] = useState<ReplyBrainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ inbound: string; stage: string; latency: number }>>([]);

  // Smoke test state
  const [smokeResults, setSmokeResults] = useState<SmokeTestResult[]>([]);
  const [smokeTesting, setSmokeTesting] = useState(false);

  // Run all smoke tests
  const runSmokeTests = async () => {
    setSmokeTesting(true);
    setSmokeResults([]);

    const results: SmokeTestResult[] = [];

    for (const test of SMOKE_TESTS) {
      const start = Date.now();
      try {
        const response = await fetch(EDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pastedReply: test.inbound,
            initialMessage: test.outbound,
          }),
        });

        const data = await response.json();
        const assertion = test.assert(data);

        results.push({
          name: test.name,
          pass: assertion.pass,
          reason: assertion.reason,
          stage: data.stage,
          reply: data.reply,
          latencyMs: Date.now() - start,
        });
      } catch (error) {
        results.push({
          name: test.name,
          pass: false,
          reason: `Error: ${error}`,
          stage: 'ERROR',
          reply: '',
          latencyMs: Date.now() - start,
        });
      }

      // Update results progressively
      setSmokeResults([...results]);
    }

    setSmokeTesting(false);
  };

  const testClassification = async () => {
    if (!inbound.trim()) return;

    setLoading(true);
    const start = Date.now();

    try {
      const response = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pastedReply: inbound,
          initialMessage: outbound || undefined,
        }),
      });

      const data = await response.json();
      const latency = Date.now() - start;

      setResult(data);
      setHistory(prev => [{ inbound, stage: data.stage, latency }, ...prev.slice(0, 19)]);
    } catch (error) {
      setResult({ error: String(error) } as ReplyBrainResponse);
    } finally {
      setLoading(false);
    }
  };

  const stageColor = (stage: string) => {
    const colors: Record<string, string> = {
      INTEREST: 'text-emerald-400',
      SCHEDULING: 'text-emerald-400',
      IDENTITY: 'text-blue-400',
      PRICING: 'text-blue-400',
      PROOF: 'text-blue-400',
      SCOPE: 'text-blue-400',
      CONFUSION: 'text-amber-400',
      NEGATIVE: 'text-red-400',
      HOSTILE: 'text-red-500',
      OOO: 'text-gray-400',
      BOUNCE: 'text-gray-500',
      UNKNOWN: 'text-gray-600',
    };
    return colors[stage] || 'text-white';
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Reply Brain v20</h1>
            <p className="text-white/50 text-sm mt-1">Debug classification, smoke tests, telemetry</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={runSmokeTests}
              disabled={smokeTesting}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                smokeTesting ? 'bg-amber-500/20 text-amber-400' :
                smokeResults.length > 0 && smokeResults.every(r => r.pass)
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : smokeResults.length > 0 && smokeResults.some(r => !r.pass)
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/[0.06] text-white/60 hover:bg-white/10'
              }`}
            >
              {smokeTesting ? `Running ${smokeResults.length}/${SMOKE_TESTS.length}...` :
               smokeResults.length > 0 ? `${smokeResults.filter(r => r.pass).length}/${smokeResults.length} Passed` :
               'Run Smoke Tests'}
            </button>
            <a
              href="/launcher"
              className="text-white/40 hover:text-white/60 text-sm"
            >
              ← Back to app
            </a>
          </div>
        </div>

        {/* Smoke Test Results */}
        {smokeResults.length > 0 && (
          <div className="mb-8 p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
            <div className="text-white/50 text-xs uppercase tracking-wider mb-3">
              Smoke Tests
              {smokeResults.every(r => r.pass) && (
                <span className="ml-2 text-emerald-400">ALL PASSED</span>
              )}
              {smokeResults.some(r => !r.pass) && (
                <span className="ml-2 text-red-400">
                  {smokeResults.filter(r => !r.pass).length} FAILED
                </span>
              )}
            </div>
            <div className="space-y-2">
              {smokeResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-2 rounded text-sm ${
                    r.pass ? 'bg-emerald-500/5' : 'bg-red-500/5'
                  }`}
                >
                  <span className={`font-mono text-xs ${r.pass ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.pass ? 'PASS' : 'FAIL'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/80">{r.name}</div>
                    {!r.pass && (
                      <div className="text-red-400/70 text-xs mt-1">{r.reason}</div>
                    )}
                    <div className="text-white/30 text-xs mt-1 truncate">
                      {r.stage}: {r.reply.substring(0, 80)}...
                    </div>
                  </div>
                  <span className="text-white/30 text-xs">{r.latencyMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Section */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">
              Inbound Reply (required)
            </label>
            <textarea
              value={inbound}
              onChange={(e) => setInbound(e.target.value)}
              placeholder="Paste the reply to classify..."
              className="w-full h-32 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wider mb-2">
              Initial Outbound (optional)
            </label>
            <textarea
              value={outbound}
              onChange={(e) => setOutbound(e.target.value)}
              placeholder="Paste your original message for anchor extraction..."
              className="w-full h-32 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
          </div>
        </div>

        <button
          onClick={testClassification}
          disabled={loading || !inbound.trim()}
          className="w-full py-3 bg-white/[0.06] hover:bg-white/10 disabled:opacity-50 rounded-lg font-medium transition-colors"
        >
          {loading ? 'Classifying...' : 'Test Classification'}
        </button>

        {/* Result Section */}
        {result && (
          <div className="mt-8 space-y-6">
            {result.error ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                Error: {result.error}
              </div>
            ) : (
              <>
                {/* Stage Badge */}
                <div className="flex items-center gap-4">
                  <div className={`text-3xl font-bold ${stageColor(result.stage)}`}>
                    {result.stage}
                  </div>
                  {result.telemetry?.stageSecondary?.length > 0 && (
                    <div className="text-white/40 text-sm">
                      + {result.telemetry.stageSecondary.join(', ')}
                    </div>
                  )}
                  <div className="text-white/30 text-sm ml-auto">
                    {result.telemetry?.latencyMs}ms
                  </div>
                </div>

                {/* Reply */}
                <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                  <div className="text-white/50 text-xs uppercase tracking-wider mb-2">Generated Reply</div>
                  <div className="text-white whitespace-pre-wrap">{result.reply}</div>
                </div>

                {/* Meaning / Response / Next Move */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-white/[0.02] rounded-lg">
                    <div className="text-white/40 text-xs mb-1">Meaning</div>
                    <div className="text-sm">{result.meaning}</div>
                  </div>
                  <div className="p-3 bg-white/[0.02] rounded-lg">
                    <div className="text-white/40 text-xs mb-1">Response</div>
                    <div className="text-sm">{result.response}</div>
                  </div>
                  <div className="p-3 bg-white/[0.02] rounded-lg">
                    <div className="text-white/40 text-xs mb-1">Next Move</div>
                    <div className="text-sm">{result.next_move}</div>
                  </div>
                </div>

                {/* Anchor */}
                {result.anchor && (
                  <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-white/50 text-xs uppercase tracking-wider">Anchor</div>
                      <div className={`text-xs px-2 py-0.5 rounded ${
                        result.anchor.quality === 'good' ? 'bg-emerald-500/20 text-emerald-400' :
                        result.anchor.quality === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-white/10 text-white/40'
                      }`}>
                        {result.anchor.quality}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-white/40">Prospect:</span> {result.anchor.prospect_label || '—'}
                      </div>
                      <div>
                        <span className="text-white/40">Pain:</span> {result.anchor.pain_sentence || '—'}
                      </div>
                      <div>
                        <span className="text-white/40">Offer:</span> {result.anchor.offer_sentence || '—'}
                      </div>
                      <div>
                        <span className="text-white/40">Summary:</span> {result.anchor.outbound_summary || '—'}
                      </div>
                    </div>
                    {result.anchor.missing?.length > 0 && (
                      <div className="mt-2 text-xs text-white/30">
                        Missing: {result.anchor.missing.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Telemetry */}
                {result.telemetry && (
                  <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-3">Telemetry</div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-white/40">Version:</span> {result.telemetry.version}
                      </div>
                      <div>
                        <span className="text-white/40">Mode:</span> {result.telemetry.runtimeMode}
                      </div>
                      <div>
                        <span className="text-white/40">Negation:</span> {result.telemetry.negationDetected ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <span className="text-white/40">Micro-rewrite:</span> {result.telemetry.usedMicroRewrite ? 'Used' : 'No'}
                      </div>
                      <div>
                        <span className="text-white/40">Accepted:</span> {result.telemetry.microRewriteAccepted ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <span className="text-white/40">Embarrassment:</span>{' '}
                        <span className={result.telemetry.embarrassmentGateHit ? 'text-red-400' : ''}>
                          {result.telemetry.embarrassmentGateHit ? 'HIT' : 'Clear'}
                        </span>
                      </div>
                    </div>
                    {result.telemetry.unknownTriggers?.length > 0 && (
                      <div className="mt-2 text-xs text-amber-400/70">
                        Unknown triggers: {result.telemetry.unknownTriggers.join(', ')}
                      </div>
                    )}
                    {result.telemetry.forbidTriggered?.length > 0 && (
                      <div className="mt-2 text-xs text-red-400/70">
                        Forbid triggered: {result.telemetry.forbidTriggered.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-8">
            <div className="text-white/50 text-xs uppercase tracking-wider mb-3">Recent Tests</div>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 bg-white/[0.02] rounded text-sm cursor-pointer hover:bg-white/[0.04]"
                  onClick={() => setInbound(h.inbound)}
                >
                  <span className={`font-mono text-xs ${stageColor(h.stage)}`}>{h.stage}</span>
                  <span className="text-white/60 truncate flex-1">{h.inbound}</span>
                  <span className="text-white/30 text-xs">{h.latency}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Tests */}
        <div className="mt-8 pt-8 border-t border-white/[0.06]">
          <div className="text-white/50 text-xs uppercase tracking-wider mb-3">Quick Tests</div>
          <div className="flex flex-wrap gap-2">
            {[
              'interested',
              'not interested',
              "what's in it for you?",
              'how does this work?',
              'who are these people?',
              'send me your calendar',
              'this is spam',
              'I am out of office',
              'ok but not ok with this',
            ].map((text) => (
              <button
                key={text}
                onClick={() => {
                  setInbound(text);
                  setTimeout(() => testClassification(), 100);
                }}
                className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] rounded text-sm text-white/60 hover:text-white transition-colors"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
