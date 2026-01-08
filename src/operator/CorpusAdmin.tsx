import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Plus, Check, X, Database, RefreshCw, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STAGES = [
  'BOUNCE', 'OOO', 'NEGATIVE', 'HOSTILE', 'SCHEDULING',
  'PRICING', 'PROOF', 'IDENTITY', 'SCOPE', 'INTEREST',
  'CONFUSION', 'UNKNOWN'
];

interface CorpusCase {
  id: string;
  inbound_text: string;
  outbound_seed_text: string | null;
  stage_label: string;
  approved: boolean;
  tags: string[];
  created_at: string;
}

async function fetchCorpusCases(): Promise<CorpusCase[]> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/corpus_cases?select=id,inbound_text,outbound_seed_text,stage_label,approved,tags,created_at&order=created_at.desc&limit=500`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('[CorpusAdmin] Fetch error:', error);
    return [];
  }
}

async function toggleApproval(id: string, approved: boolean): Promise<boolean> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/corpus_cases?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ approved }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export default function CorpusAdmin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cases, setCases] = useState<CorpusCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending'>('all');

  // New case form
  const [showForm, setShowForm] = useState(false);
  const [newInbound, setNewInbound] = useState('');
  const [newOutbound, setNewOutbound] = useState('');
  const [newStage, setNewStage] = useState('INTEREST');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);
    const data = await fetchCorpusCases();
    setCases(data);
    setLoading(false);
  }

  async function handleToggleApproval(id: string, currentApproved: boolean) {
    const success = await toggleApproval(id, !currentApproved);
    if (success) {
      setCases(cases.map(c => c.id === id ? { ...c, approved: !currentApproved } : c));
    }
  }

  async function handleBulkApprove() {
    if (pendingCount === 0) return;

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/corpus_cases?approved=eq.false`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ approved: true }),
        }
      );
      if (response.ok) {
        setCases(cases.map(c => ({ ...c, approved: true })));
      }
    } catch (error) {
      console.error('[CorpusAdmin] Bulk approve error:', error);
    }
  }

  async function handleSubmitCase() {
    if (!newInbound.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/corpus_cases`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            inbound_text: newInbound.trim(),
            outbound_seed_text: newOutbound.trim() || null,
            stage_label: newStage,
            approved: false,
            tags: ['manual'],
          }),
        }
      );

      if (response.ok) {
        const inserted = await response.json();
        setCases([inserted[0], ...cases]);
        setNewInbound('');
        setNewOutbound('');
        setNewStage('INTEREST');
        setShowForm(false);
      }
    } catch (error) {
      console.error('[CorpusAdmin] Submit error:', error);
    }
    setSubmitting(false);
  }

  const filteredCases = cases.filter(c => {
    if (filter === 'approved') return c.approved;
    if (filter === 'pending') return !c.approved;
    return true;
  });

  const approvedCount = cases.filter(c => c.approved).length;
  const pendingCount = cases.filter(c => !c.approved).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-black/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white/60" />
            </button>
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-indigo-400" />
              <h1 className="text-[15px] font-medium">Corpus Admin</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadCases}
              className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {pendingCount > 0 && (
              <button
                onClick={handleBulkApprove}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[13px] font-medium transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                Approve All ({pendingCount})
              </button>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[13px] font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Case
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <div className="text-[24px] font-semibold">{cases.length}</div>
            <div className="text-[13px] text-white/50">Total Cases</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <div className="text-[24px] font-semibold text-emerald-400">{approvedCount}</div>
            <div className="text-[13px] text-white/50">Approved</div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <div className="text-[24px] font-semibold text-amber-400">{pendingCount}</div>
            <div className="text-[13px] text-white/50">Pending</div>
          </div>
        </div>

        {/* Progress to 300 */}
        {approvedCount < 300 && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-amber-400">Corpus Target: 300 approved cases</span>
              <span className="text-[13px] text-white/60">{approvedCount}/300</span>
            </div>
            <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, (approvedCount / 300) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'approved', 'pending'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                filter === tab
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'approved' && ` (${approvedCount})`}
              {tab === 'pending' && ` (${pendingCount})`}
            </button>
          ))}
        </div>

        {/* Cases list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            No corpus cases found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map(c => (
              <div
                key={c.id}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                        c.stage_label === 'PRICING' ? 'bg-purple-500/20 text-purple-400' :
                        c.stage_label === 'NEGATIVE' ? 'bg-red-500/20 text-red-400' :
                        c.stage_label === 'HOSTILE' ? 'bg-red-500/20 text-red-400' :
                        c.stage_label === 'INTEREST' ? 'bg-emerald-500/20 text-emerald-400' :
                        c.stage_label === 'SCHEDULING' ? 'bg-blue-500/20 text-blue-400' :
                        c.stage_label === 'OOO' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-white/10 text-white/60'
                      }`}>
                        {c.stage_label}
                      </span>
                      <span className={`px-2 py-0.5 text-[11px] rounded ${
                        c.approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {c.approved ? 'Approved' : 'Pending'}
                      </span>
                      {c.tags?.length > 0 && (
                        <span className="text-[11px] text-white/30">{c.tags.join(', ')}</span>
                      )}
                    </div>
                    <p className="text-[14px] text-white/90 font-mono break-all">
                      "{c.inbound_text.substring(0, 200)}{c.inbound_text.length > 200 ? '...' : ''}"
                    </p>
                    {c.outbound_seed_text && (
                      <p className="text-[12px] text-white/40 mt-1 truncate">
                        Outbound: {c.outbound_seed_text.substring(0, 80)}...
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleApproval(c.id, c.approved)}
                    className={`p-2 rounded-lg transition-colors ${
                      c.approved
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                    }`}
                    title={c.approved ? 'Revoke approval' : 'Approve'}
                  >
                    {c.approved ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Case Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-white/[0.08] rounded-xl w-full max-w-lg">
            <div className="p-6 border-b border-white/[0.06]">
              <h2 className="text-[16px] font-medium">Add Corpus Case</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[13px] text-white/60 mb-2">
                  Inbound Reply (what they said)
                </label>
                <textarea
                  value={newInbound}
                  onChange={e => setNewInbound(e.target.value)}
                  placeholder="e.g., price?"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-white/20 resize-none"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-[13px] text-white/60 mb-2">
                  Outbound Context (optional - your original message)
                </label>
                <textarea
                  value={newOutbound}
                  onChange={e => setNewOutbound(e.target.value)}
                  placeholder="e.g., noticed your team is hiring..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-white/20 resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-[13px] text-white/60 mb-2">
                  Expected Stage
                </label>
                <select
                  value={newStage}
                  onChange={e => setNewStage(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-white/20"
                >
                  {STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-[13px] text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCase}
                disabled={!newInbound.trim() || submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[13px] font-medium transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple hash function
function hashText(text: string): string {
  let hash = 0;
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
