/**
 * TemplateBuilder — Template editor with dual-body textareas
 *
 * Layout:
 * - Name + description inputs
 * - Edit / Preview toggle
 * - Two textareas: SUPPLY COPY (left) / DEMAND COPY (right)
 * - Variable chip bar above each textarea
 * - VARIABLES section below with per-variable config
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { IntroTemplate, TemplateVariable } from '../types';
import { extractPlaceholders, interpolate } from '../engine';
import { callAI, type IntroAIConfig } from '../../../services/IntroAI';

interface Props {
  template: IntroTemplate;
  onChange: (template: IntroTemplate) => void;
  onSave: (template: IntroTemplate) => void;
  onBack: () => void;
  aiConfig?: IntroAIConfig | null;
}

// =============================================================================
// VARIABLE CHIPS
// =============================================================================

const SUPPLY_CHIPS: { key: string; label: string }[] = [
  { key: 'supply.firstName', label: 'First Name' },
  { key: 'supply.company', label: 'Company' },
];

const DEMAND_CHIPS: { key: string; label: string }[] = [
  { key: 'demand.firstName', label: 'First Name' },
  { key: 'demand.company', label: 'Company' },
];

const SITUATION_CHIPS: { key: string; label: string }[] = [
  { key: 'momentum', label: 'Momentum' },
  { key: 'bridge', label: 'Bridge' },
  { key: 'opportunity', label: 'Opportunity' },
];

/** Known AI variable definitions — auto-populated when detected in any template.
 * Situation vars (momentum, bridge, opportunity) are resolved by the Situation layer,
 * not per-pair AI calls. Legacy var signalObservation resolves from Situation
 * via backward-compat alias in engine.ts.
 */
const KNOWN_AI_VARS: Record<string, { label: string; fallback: string; instruction: string }> = {};

function ChipBar({
  side,
  textareaRef,
  onInsert,
}: {
  side: 'supply' | 'demand';
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (key: string) => void;
}) {
  const sideChips = side === 'supply' ? SUPPLY_CHIPS : DEMAND_CHIPS;
  const chipColor = 'rgba(255,255,255,0.45)';
  const chipBorder = 'rgba(255,255,255,0.10)';

  const insert = (key: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      const insertion = `{{${key}}}`;
      const newText = text.slice(0, start) + insertion + text.slice(end);
      // Trigger change via native input event pattern
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value',
      )?.set;
      nativeInputValueSetter?.call(ta, newText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // Restore cursor
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + insertion.length;
        ta.focus();
      });
    }
    onInsert(key);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap mb-2">
      {sideChips.map(c => (
        <button
          key={c.key}
          onClick={() => insert(c.key)}
          className="font-mono var-chip"
          style={{
            fontSize: '9px',
            padding: '2px 7px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.04)',
            color: chipColor,
            border: `1px solid ${chipBorder}`,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {c.label}
        </button>
      ))}
      {SITUATION_CHIPS.map(c => (
        <button
          key={c.key}
          onClick={() => insert(c.key)}
          className="font-mono var-chip"
          style={{
            fontSize: '9px',
            padding: '2px 7px',
            borderRadius: '3px',
            background: 'rgba(52,211,153,0.06)',
            color: 'rgba(52,211,153,0.60)',
            border: `1px solid rgba(52,211,153,0.15)`,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TemplateBuilder({ template, onChange, onSave, onBack, aiConfig }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [aiPromptText, setAiPromptText] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const supplyRef = useRef<HTMLTextAreaElement>(null);
  const demandRef = useRef<HTMLTextAreaElement>(null);

  // Detect all placeholders from both bodies
  const allPlaceholders = useMemo(() => {
    const supplyKeys = extractPlaceholders(template.supplyBody);
    const demandKeys = extractPlaceholders(template.demandBody);
    return [...new Set([...supplyKeys, ...demandKeys])];
  }, [template.supplyBody, template.demandBody]);

  // Sync variables with detected placeholders — add new, prune stale
  useEffect(() => {
    const placeholderSet = new Set(allPlaceholders);
    const existingKeys = new Set(template.variables.map(v => v.key));

    // Add new placeholders as variables
    const newVars: TemplateVariable[] = [];
    for (const key of allPlaceholders) {
      if (!existingKeys.has(key)) {
        const isBuiltIn = key.startsWith('demand.') || key.startsWith('supply.') || key === 'article' || ['momentum', 'bridge', 'opportunity'].includes(key);
        const known = KNOWN_AI_VARS[key];
        newVars.push({
          key,
          label: known?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
          fallback: known?.fallback || '',
          instruction: known?.instruction || '',
          side: key.startsWith('demand.') ? 'demand' : key.startsWith('supply.') ? 'supply' : 'both',
          builtIn: isBuiltIn,
        });
      }
    }

    // Prune variables no longer in any body (keep AI vars with custom instructions)
    const pruned = template.variables.filter(v =>
      placeholderSet.has(v.key) || (v.instruction && v.instruction.trim() !== '')
    );

    const changed = newVars.length > 0 || pruned.length !== template.variables.length;
    if (changed) {
      onChange({ ...template, variables: [...pruned, ...newVars] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlaceholders.join(',')]);

  const updateField = useCallback((field: keyof IntroTemplate, value: string) => {
    onChange({ ...template, [field]: value });
  }, [template, onChange]);

  const updateVariable = useCallback((key: string, field: keyof TemplateVariable, value: string) => {
    const vars = template.variables.map(v =>
      v.key === key ? { ...v, [field]: value } : v
    );
    onChange({ ...template, variables: vars });
  }, [template, onChange]);

  // AI template generator — single call per side, no cleanup pass
  const generateFromDescription = useCallback(async () => {
    if (!aiConfig || !aiPromptText.trim()) return;
    setAiGenerating(true);
    setAiError('');

    const desc = aiPromptText.trim();

    const supplyVars = `VARIABLES — use {{double braces}} exactly as shown:

Identity:
  {{supply.firstName}} — the provider's first name (you're writing TO them)

Situation (these describe the DEMAND company's situation — NOT the provider's):
  {{momentum}} — 3-6 words. Present-tense action. What the other company is doing right now. Example: "rebuilding their sales team". NEVER say "you're in the middle of {{momentum}}" — the provider is NOT in this situation.
  {{bridge}} — 2-5 words. Single capability or friction. Where the provider's work fits. Example: "pipeline automation". No compound phrases.
  {{opportunity}} — 4-8 words. Casual outcome, active voice. What a conversation could unlock. Example: "skip two months of sourcing".

CRITICAL: {{momentum}} is the demand company's situation. {{bridge}} is where the provider fits. Never confuse whose situation it is.`;

    const demandVars = `VARIABLES — use {{double braces}} exactly as shown:

Identity:
  {{demand.firstName}} — the company's first name (you're writing TO them)
  {{demand.company}} — the company name

Situation (these describe what you've observed about THIS company):
  {{momentum}} — 3-6 words. Present-tense action. What's happening at their company. Example: "rebuilding their sales team". This is THEIR situation — they're living it.
  {{bridge}} — 2-5 words. Single capability or friction. The kind of work this triggers. Example: "pipeline automation". Do NOT say "your team handles {{bridge}}" — the supply side handles it.
  {{opportunity}} — 4-8 words. Casual outcome, active voice. What a conversation could unlock. Example: "skip two months of sourcing".

CRITICAL: {{momentum}} is THEIR situation. {{bridge}} is what it connects to. Never imply they solve {{bridge}} — someone else does.`;

    const rules = `OUTPUT RULES:
- 3-5 sentences max. Short paragraphs. White space matters.
- 5th grade reading level. Simple words. Keep niche-specific lingo that insiders use.
- Write like you're talking face to face over coffee. Not typing a LinkedIn post.
- No filler words. No throat-clearing. Direct.
- Broker tone — you have something, not offering something.
- No emojis. No exclamation marks. No corporate speak.
- BANNED PHRASES: "I'd love to", "reaching out because", "I hope this finds you", "just wanted to", "leveraging", "streamline", "optimize", "solutions", "enhance", "robust", "scalability".
- Each variable gets its own sentence. NEVER join two variables with "and", "which means", "leading to", "is why", "driving", "because of". Proximity implies relationship — the reader connects them.
- Variables MUST use {{double braces}}: {{variableName}}
- No signature, no sign-off, no closing. End with your last sentence.
- Return ONLY the email text. No markdown, no subject line, no explanation.`;

    const supplyPrompt = `Draft a short note from a third-party operator who spotted a situational alignment. Not selling — validating whether a conversation is worth having.

You're telling this provider about a live situation: a company triggered a signal. DO NOT name the demand company — that's behind the paywall.

Operator's voice/style: "${desc}"

LANGUAGE DISCIPLINE:
- Never say "my client" — say "a company", "a team", "a situation that just triggered"
- Never promise meetings or results — promise you can share what you know
- Never offer anything free — you have selective access
- CTA drives a reply or a call, not a connection
- You're writing TO this provider — use "you" and "your team", not {{supply.company}}

${supplyVars}

Start with: Hey {{supply.firstName}} —

${rules}`;

    const demandPrompt = `Draft a short note to a company where a recent shift may justify a relevant introduction. Not selling services — offering to route a conversation if useful.

You've observed something about this company and have access to people who handle exactly this kind of situation. DO NOT name any provider — that's behind the paywall.

Operator's voice/style: "${desc}"

LANGUAGE DISCIPLINE:
- Never say "my client" or name the supply side — say "people I work with", "someone who handles this"
- Never promise meetings or results — promise you can break it down for them
- Never offer anything free — you're selective about who gets this
- CTA drives a reply or a call, not a connection
- Lead with what you've observed about THEM
- Use "you" and "your team" alongside {{demand.company}} naturally. Don't repeat their name every sentence.

${demandVars}

Start with: Hey {{demand.firstName}} —

${rules}`;

    try {
      const strip = (s: string) => s.replace(/```[a-z]*\n?/g, '').replace(/```\n?/g, '').trim();

      // Single call per side, 600 tokens each — enough for a full template
      const [supplyRaw, demandRaw] = await Promise.all([
        callAI(aiConfig, supplyPrompt, 600),
        callAI(aiConfig, demandPrompt, 600),
      ]);

      const supplyBody = strip(supplyRaw);
      const demandBody = strip(demandRaw);

      if (!supplyBody && !demandBody) {
        setAiError('Generation returned empty. Try a different description.');
        return;
      }

      onChange({
        ...template,
        name: template.name || desc.slice(0, 40),
        description: desc,
        supplyBody: supplyBody || template.supplyBody,
        demandBody: demandBody || template.demandBody,
      });
    } catch (err) {
      console.error('[TemplateBuilder] AI generation failed:', err);
      setAiError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setAiGenerating(false);
    }
  }, [aiConfig, aiPromptText, template, onChange]);

  // Preview with mock data — relational Situation values, not entity properties
  const previewVars: Record<string, string> = {};
  for (const v of template.variables) {
    previewVars[v.key] = v.fallback || `[${v.key}]`;
  }
  previewVars['demand.firstName'] = 'Alex';
  previewVars['supply.firstName'] = 'Jordan';
  previewVars['demand.company'] = 'Acme Corp';
  previewVars['supply.company'] = 'Verdant AI';
  previewVars['momentum'] = 'a post-funding security build-out';
  previewVars['bridge'] = 'compliance work and growth-stage scaling';
  previewVars['opportunity'] = 'get audit-ready before their Q3 deadline';
  // Backward compat aliases resolve from Situation
  previewVars['supply.offers'] = 'compliance work and growth-stage scaling';
  previewVars['demand.wants'] = 'compliance work and growth-stage scaling';
  previewVars['demand.whyNow'] = 'a post-funding security build-out';
  previewVars['signalObservation'] = 'a post-funding security build-out';

  const isReadonly = template.builtIn;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <button
          onClick={onBack}
          className="font-mono text-white/30 hover:text-white/50 transition-colors"
          style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '11px', padding: 0 }}
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          {(['edit', 'preview'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="font-mono transition-colors"
              style={{
                fontSize: '10px',
                padding: '4px 12px',
                borderRadius: '4px',
                background: mode === m ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: mode === m ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.25)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ scrollbarWidth: 'none' }}>
        {/* Name + Description */}
        <div className="mb-6">
          <input
            value={template.name}
            onChange={e => updateField('name', e.target.value)}
            placeholder="Template name"
            readOnly={isReadonly}
            className="w-full font-mono bg-transparent outline-none text-white/90"
            style={{
              fontSize: '14px',
              padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          />
          <input
            value={template.description}
            onChange={e => updateField('description', e.target.value)}
            placeholder="Brief description"
            readOnly={isReadonly}
            className="w-full font-mono bg-transparent outline-none text-white/50 mt-2"
            style={{
              fontSize: '12px',
              padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          />
        </div>

        {/* AI Template Generator */}
        {!isReadonly && aiConfig && (
          <div
            className="mb-6"
            style={{
              padding: '16px',
              background: 'rgba(52,211,153,0.04)',
              border: '1px solid rgba(52,211,153,0.10)',
              borderRadius: '8px',
            }}
          >
            <div
              className="font-mono uppercase tracking-widest mb-2"
              style={{ fontSize: '9px', color: 'rgba(52,211,153,0.60)', letterSpacing: '0.08em' }}
            >
              Introduction Drafting
            </div>
            <p className="font-mono mb-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', lineHeight: '1.5' }}>
              Describe your voice and tone. The generator drafts both sides — supply and demand — using your match variables. You edit after.
            </p>
            <textarea
              value={aiPromptText}
              onChange={e => { setAiPromptText(e.target.value); setAiError(''); }}
              placeholder='e.g. "direct, no fluff. lead with what I noticed about their company. position me as someone with selective deal flow, not a salesperson. short sentences."'
              disabled={aiGenerating}
              className="w-full font-mono bg-transparent outline-none text-white/70 resize-none mb-3"
              style={{
                fontSize: '12px',
                lineHeight: '1.5',
                padding: '10px 12px',
                minHeight: '56px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '6px',
              }}
            />
            {aiError && (
              <p className="font-mono mb-2" style={{ fontSize: '10px', color: 'rgba(239,68,68,0.70)' }}>
                {aiError}
              </p>
            )}
            <button
              onClick={generateFromDescription}
              disabled={aiGenerating || !aiPromptText.trim()}
              className="font-mono transition-colors"
              style={{
                fontSize: '11px',
                padding: '8px 20px',
                borderRadius: '6px',
                background: aiGenerating ? 'rgba(52,211,153,0.10)' : 'rgba(52,211,153,0.15)',
                color: aiGenerating ? 'rgba(52,211,153,0.40)' : 'rgba(52,211,153,0.80)',
                border: '1px solid rgba(52,211,153,0.15)',
                cursor: aiGenerating || !aiPromptText.trim() ? 'not-allowed' : 'pointer',
                outline: 'none',
                animation: !aiGenerating && aiPromptText.trim() ? 'btnPulse 2.5s ease-in-out infinite' : 'none',
              }}
            >
              {aiGenerating ? 'Generating...' : 'Generate Template'}
            </button>
          </div>
        )}

        {/* Dual textareas */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* SUPPLY COPY */}
          <div>
            <div
              className="font-mono uppercase tracking-widest mb-2"
              style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}
            >
              Supply Copy
            </div>
            {mode === 'edit' && !isReadonly && (
              <ChipBar side="supply" textareaRef={supplyRef} onInsert={() => {}} />
            )}
            {mode === 'edit' ? (
              <textarea
                ref={supplyRef}
                value={template.supplyBody}
                onChange={e => updateField('supplyBody', e.target.value)}
                readOnly={isReadonly}
                className="w-full font-mono bg-transparent outline-none text-white/75 resize-none"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  padding: '12px',
                  minHeight: '160px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                }}
              />
            ) : (
              <div
                className="font-mono whitespace-pre-wrap text-white/70"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  padding: '12px',
                  minHeight: '160px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                }}
              >
                {interpolate(template.supplyBody, previewVars)}
              </div>
            )}
          </div>

          {/* DEMAND COPY */}
          <div>
            <div
              className="font-mono uppercase tracking-widest mb-2"
              style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}
            >
              Demand Copy
            </div>
            {mode === 'edit' && !isReadonly && (
              <ChipBar side="demand" textareaRef={demandRef} onInsert={() => {}} />
            )}
            {mode === 'edit' ? (
              <textarea
                ref={demandRef}
                value={template.demandBody}
                onChange={e => updateField('demandBody', e.target.value)}
                readOnly={isReadonly}
                className="w-full font-mono bg-transparent outline-none text-white/75 resize-none"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  padding: '12px',
                  minHeight: '160px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                }}
              />
            ) : (
              <div
                className="font-mono whitespace-pre-wrap text-white/70"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.6',
                  padding: '12px',
                  minHeight: '160px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                }}
              >
                {interpolate(template.demandBody, previewVars)}
              </div>
            )}
          </div>
        </div>

        {/* VARIABLES section */}
        <div className="mb-6">
          <div
            className="font-mono uppercase tracking-widest mb-2"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}
          >
            Variables
          </div>
          {!isReadonly && (
            <p className="font-mono mb-4" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
              Type {'{{name}}'} in either body to create a variable — or click a chip above to insert at cursor.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {template.variables.map(v => (
              <div
                key={v.key}
                style={{
                  padding: '12px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '6px',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.70)' }}>
                    {`{{${v.key}}}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {v.builtIn && (
                      <span className="font-mono" style={{ fontSize: '8px', color: 'rgba(52,211,153,0.50)', letterSpacing: '0.06em' }}>
                        BUILT-IN
                      </span>
                    )}
                    <span className="font-mono" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.30)' }}>
                      {v.side.toUpperCase()}
                    </span>
                  </div>
                </div>

                {v.builtIn ? (
                  <p className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
                    Resolved automatically from record data
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      value={v.fallback}
                      onChange={e => updateVariable(v.key, 'fallback', e.target.value)}
                      placeholder="Fallback value (used when no API key configured)"
                      readOnly={isReadonly}
                      className="w-full font-mono bg-transparent outline-none text-white/60"
                      style={{
                        fontSize: '11px',
                        padding: '6px 8px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '4px',
                      }}
                    />
                    <textarea
                      value={v.instruction}
                      onChange={e => updateVariable(v.key, 'instruction', e.target.value)}
                      placeholder="Fill instruction (e.g., 'Describe in 3-8 words...')"
                      readOnly={isReadonly}
                      className="w-full font-mono bg-transparent outline-none text-white/40 resize-none"
                      style={{
                        fontSize: '11px',
                        padding: '6px 8px',
                        minHeight: '48px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        {!isReadonly && (
          <button
            onClick={() => onSave(template)}
            className="font-mono text-white/70 hover:text-white/90 transition-colors"
            style={{
              fontSize: '12px',
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '6px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            Save Template
          </button>
        )}
      </div>

      <style>{`
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(52,211,153,0.0); }
          50% { box-shadow: 0 0 12px rgba(52,211,153,0.25); }
        }
        .var-chip {
          transition: color 0.15s, text-shadow 0.15s, border-color 0.15s;
        }
        .var-chip:hover {
          color: rgba(52,211,153,0.80) !important;
          text-shadow: 0 0 8px rgba(52,211,153,0.35);
          border-color: rgba(52,211,153,0.25) !important;
        }
      `}</style>
    </div>
  );
}
