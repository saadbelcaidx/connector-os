/**
 * ClientProfileModal — Edit client profile (ICP, identity, pain/outcome, proof, messaging, brief)
 *
 * Glass modal with collapsible sections.
 * Sections auto-expand if they have data, otherwise start collapsed.
 * Brief is always visible at top — the quick-paste entry point.
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
      <p className="font-mono tracking-widest uppercase mb-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full font-mono text-white/80 placeholder-white/15 outline-none resize-y"
          style={{ padding: '6px 10px', fontSize: '11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', minHeight: '48px' }}
          onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full font-mono text-white/80 placeholder-white/15 outline-none"
          style={{ height: '28px', padding: '0 10px', fontSize: '11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
          onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
        />
      )}
    </div>
  );
}

// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

function CollapsibleSection({
  title,
  hasData,
  defaultOpen,
  fieldCount,
  children,
}: {
  title: string;
  hasData: boolean;
  defaultOpen?: boolean;
  fieldCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? hasData);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between pb-1.5 font-mono transition-all group"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'none',
          border: 'none',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
          borderBottomColor: 'rgba(255,255,255,0.04)',
          cursor: 'pointer',
          outline: 'none',
          padding: '0 0 6px 0',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="transition-transform"
            style={{
              fontSize: '8px',
              color: 'rgba(255,255,255,0.20)',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
              transitionDuration: '200ms',
            }}
          >
            ▶
          </span>
          <span style={{ fontSize: '10px', color: open ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasData && !open && (
            <span style={{ fontSize: '9px', color: 'rgba(52,211,153,0.35)' }}>
              {fieldCount ?? ''} filled
            </span>
          )}
        </div>
      </button>
      <div
        style={{
          maxHeight: open ? '800px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out, opacity 0.2s ease-out',
          opacity: open ? 1 : 0,
        }}
      >
        <div className="space-y-3 pt-3">
          {children}
        </div>
      </div>
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

  // Count filled fields per section for the collapsed badge
  const identityCount = [draft.companyDescription, draft.specialization].filter(Boolean).length;
  const icpCount = [
    fromArray(draft.icpTitles), fromArray(draft.icpIndustries),
    draft.icpCompanySize, draft.icpGeography, draft.icpDescription,
  ].filter(Boolean).length;
  const painCount = [fromArray(draft.painPoints), fromArray(draft.desiredOutcomes)].filter(Boolean).length;
  const proofCount = [draft.caseStudy, fromArray(draft.differentiators)].filter(Boolean).length;
  const msgCount = [draft.messagingTone, fromArray(draft.prospectingQuestions)].filter(Boolean).length;

  return (
    <>
    <style>{`
      @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cardFloat { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    `}</style>
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
      <div
        className="relative flex flex-col"
        style={{ width: '100%', maxWidth: '520px', maxHeight: '85vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 sticky top-0 z-10" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
            <div>
              <p className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>{clientName}</p>
              <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-mono"
            style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5" style={{ scrollbarWidth: 'none', padding: '16px 24px 24px' }}>

          {/* ── BRIEF — always open, top position ── */}
          <div>
            <p className="font-mono tracking-widest uppercase pb-1" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Brief
            </p>
            <div className="pt-3">
              <SectionField
                label="Paste onboarding doc / Typeform / notes"
                value={draft.fullBrief ?? ''}
                onChange={v => update({ fullBrief: v })}
                placeholder="Paste the full client brief here — everything else below is optional refinement..."
                multiline
              />
            </div>
          </div>

          {/* ── IDENTITY ── */}
          <CollapsibleSection title="Identity" hasData={identityCount > 0} fieldCount={identityCount}>
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
          </CollapsibleSection>

          {/* ── ICP ── */}
          <CollapsibleSection title="ICP — Who they want to reach" hasData={icpCount > 0} fieldCount={icpCount}>
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
          </CollapsibleSection>

          {/* ── PAIN & OUTCOME ── */}
          <CollapsibleSection title="Pain & Outcome" hasData={painCount > 0} fieldCount={painCount}>
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
          </CollapsibleSection>

          {/* ── PROOF ── */}
          <CollapsibleSection title="Proof" hasData={proofCount > 0} fieldCount={proofCount}>
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
          </CollapsibleSection>

          {/* ── MESSAGING ── */}
          <CollapsibleSection title="Messaging" hasData={msgCount > 0} fieldCount={msgCount}>
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
          </CollapsibleSection>

          {/* ── ACTIONS ── */}
          <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
              onClick={() => onSave(draft)}
              className="font-mono transition-all"
              style={{
                height: '30px',
                padding: '0 16px',
                fontSize: '11px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.60)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                outline: 'none',
                transform: 'scale(1)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
            >
              Save Profile
            </button>
            <button
              onClick={onClose}
              className="font-mono transition-all"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '11px',
                borderRadius: '6px',
                background: 'transparent',
                color: 'rgba(255,255,255,0.30)',
                border: 'none',
                cursor: 'pointer',
                outline: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.30)'; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
