/**
 * ClientProfileModal — Edit client profile (ICP, identity, pain/outcome, proof, messaging, brief)
 *
 * Same dark modal pattern as overlay editor.
 * Save button, no auto-save.
 */

import { useState, useEffect } from 'react';
import type { ClientProfile } from '../../types/station';

// =============================================================================
// HELPERS
// =============================================================================

/** Split comma-separated string to array, trim empties. */
function toArray(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

/** Join array to comma-separated string. */
function fromArray(arr: string[] | undefined): string {
  return (arr ?? []).join(', ');
}

// =============================================================================
// SECTION FIELD — reusable input row
// =============================================================================

function SectionField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-1">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-2 py-1.5 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-sm text-white/80 placeholder-white/20 outline-none focus:border-white/20 resize-y"
          style={{ minHeight: '48px' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-7 px-2 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-sm text-white/80 placeholder-white/20 outline-none focus:border-white/20"
        />
      )}
    </div>
  );
}

// =============================================================================
// MODAL
// =============================================================================

export default function ClientProfileModal({
  clientName,
  profile,
  onSave,
  onClose,
}: {
  clientName: string;
  profile: ClientProfile | undefined;
  onSave: (profile: ClientProfile) => void;
  onClose: () => void;
}) {
  // Local draft state — initialized from props
  const [draft, setDraft] = useState<ClientProfile>(() => ({ ...profile }));

  // Re-sync when profile prop changes (different client opened)
  useEffect(() => {
    setDraft({ ...profile });
  }, [profile]);

  const update = (partial: Partial<ClientProfile>) => {
    setDraft(prev => ({ ...prev, ...partial }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="w-[520px] max-h-[85vh] overflow-y-auto bg-[#09090b] border border-white/[0.10] rounded-sm flex flex-col"
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] sticky top-0 bg-[#09090b] z-10">
          <div>
            <p className="text-[13px] text-white/90 font-medium">Client Profile</p>
            <p className="text-[10px] font-mono text-white/30 mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* ── IDENTITY ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Identity</p>
            <SectionField
              label="Company Description"
              value={draft.companyDescription ?? ''}
              onChange={v => update({ companyDescription: v })}
              placeholder="Twin Focus Capital Partners is a multi-family office..."
              multiline
            />
            <SectionField
              label="Specialization"
              value={draft.specialization ?? ''}
              onChange={v => update({ specialization: v })}
              placeholder="Multi-family office, Creative production SaaS"
            />
          </div>

          {/* ── ICP ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">ICP — Who they want to reach</p>
            <SectionField
              label="Target Titles (comma-separated)"
              value={fromArray(draft.icpTitles)}
              onChange={v => update({ icpTitles: toArray(v) })}
              placeholder="CEO, Founder, CFO"
            />
            <SectionField
              label="Target Industries (comma-separated)"
              value={fromArray(draft.icpIndustries)}
              onChange={v => update({ icpIndustries: toArray(v) })}
              placeholder="Technology, Finance, Biotech"
            />
            <SectionField
              label="Company Size"
              value={draft.icpCompanySize ?? ''}
              onChange={v => update({ icpCompanySize: v })}
              placeholder="50M+ net worth, 5-50 people"
            />
            <SectionField
              label="Geography"
              value={draft.icpGeography ?? ''}
              onChange={v => update({ icpGeography: v })}
              placeholder="US-based, North America"
            />
            <SectionField
              label="ICP Description"
              value={draft.icpDescription ?? ''}
              onChange={v => update({ icpDescription: v })}
              placeholder="Free-text summary of ideal client profile"
              multiline
            />
          </div>

          {/* ── PAIN & OUTCOME ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Pain & Outcome</p>
            <SectionField
              label="Pain Points (comma-separated)"
              value={fromArray(draft.painPoints)}
              onChange={v => update({ painPoints: toArray(v) })}
              placeholder="Scattered investments, No unified strategy"
            />
            <SectionField
              label="Desired Outcomes (comma-separated)"
              value={fromArray(draft.desiredOutcomes)}
              onChange={v => update({ desiredOutcomes: toArray(v) })}
              placeholder="Consolidated wealth plan, Tax optimization"
            />
          </div>

          {/* ── PROOF ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Proof</p>
            <SectionField
              label="Case Study"
              value={draft.caseStudy ?? ''}
              onChange={v => update({ caseStudy: v })}
              placeholder="Tech founder, $200M exit, consolidated assets..."
              multiline
            />
            <SectionField
              label="Differentiators (comma-separated)"
              value={fromArray(draft.differentiators)}
              onChange={v => update({ differentiators: toArray(v) })}
              placeholder="Direct PE access, In-house tax team"
            />
          </div>

          {/* ── MESSAGING ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Messaging</p>
            <SectionField
              label="Tone"
              value={draft.messagingTone ?? ''}
              onChange={v => update({ messagingTone: v })}
              placeholder="Professional, discreet, exclusive"
            />
            <SectionField
              label="Prospecting Questions (comma-separated)"
              value={fromArray(draft.prospectingQuestions)}
              onChange={v => update({ prospectingQuestions: toArray(v) })}
              placeholder="What does your current wealth setup look like?"
            />
          </div>

          {/* ── RAW BRIEF ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Raw Brief</p>
            <SectionField
              label="Full Brief (paste Typeform / onboarding doc)"
              value={draft.fullBrief ?? ''}
              onChange={v => update({ fullBrief: v })}
              placeholder="Paste the full client brief here..."
              multiline
            />
          </div>

          {/* ── ACTIONS ── */}
          <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
            <button
              onClick={() => onSave(draft)}
              className="h-7 px-4 text-[11px] rounded bg-white/[0.08] text-white/80 hover:bg-white/[0.12] transition-colors"
            >
              Save Profile
            </button>
            <button
              onClick={onClose}
              className="h-7 px-3 text-[11px] rounded text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
