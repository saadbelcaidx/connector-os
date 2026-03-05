/**
 * TemplatePicker — Template selection panel
 *
 * Two sections: PRESETS (4 built-in) + MY TEMPLATES (custom).
 * Selected card gets brighter border.
 */

import type { IntroTemplate } from '../types';

interface Props {
  customTemplates: IntroTemplate[];
  selectedId: string | null;
  onSelect: (template: IntroTemplate) => void;
  onNew: () => void;
  onDuplicate: (template: IntroTemplate) => void;
  onDelete: (id: string) => void;
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  template: IntroTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const hasAI = template.variables.some(v => !v.builtIn && v.instruction);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left transition-all${isSelected ? ' tpl-card-trace' : ''}`}
      style={{
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${isSelected ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-mono"
          style={{
            fontSize: '12px',
            color: isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)',
          }}
        >
          {template.name}
        </span>
        <div className="flex items-center gap-2">
          {hasAI && (
            <span
              className="font-mono"
              style={{
                fontSize: '8px',
                color: 'rgba(52,211,153,0.60)',
                letterSpacing: '0.06em',
                padding: '2px 5px',
                border: '1px solid rgba(52,211,153,0.20)',
                borderRadius: '3px',
              }}
            >
              AUTO
            </span>
          )}
          {onDuplicate && (
            <span
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="font-mono cursor-pointer hover:text-white/40 transition-colors"
              style={{ fontSize: '9px', color: 'rgba(255,255,255,0.30)', padding: '2px 4px' }}
            >
              dup
            </span>
          )}
          {onDelete && (
            <span
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="font-mono cursor-pointer hover:text-red-400/60 transition-colors"
              style={{ fontSize: '9px', color: 'rgba(255,255,255,0.30)', padding: '2px 4px' }}
            >
              del
            </span>
          )}
        </div>
      </div>
      <p
        className="mt-1"
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.45)',
          lineHeight: '1.4',
        }}
      >
        {template.description}
      </p>
    </button>
  );
}

export default function TemplatePicker({
  customTemplates,
  selectedId,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className="font-mono text-white/60" style={{ fontSize: '11px' }}>
          Templates
        </span>
        <button
          onClick={onNew}
          className="font-mono text-white/50 hover:text-white/70 transition-colors"
          style={{
            fontSize: '11px',
            background: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          + New
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: 'none' }}>
        {customTemplates.length === 0 ? (
          <p className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>
            No templates yet. Click + New to build your first.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {customTemplates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                isSelected={selectedId === t.id}
                onSelect={() => onSelect(t)}
                onDuplicate={() => onDuplicate(t)}
                onDelete={() => onDelete(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .tpl-card-trace {
          animation: borderTrace 0.5s ease-out;
        }
        @keyframes borderTrace {
          0% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
          35% { box-shadow: 0 0 12px rgba(52,211,153,0.25), inset 0 0 8px rgba(52,211,153,0.04); }
          100% { box-shadow: 0 0 4px rgba(52,211,153,0.08); }
        }
      `}</style>
    </div>
  );
}
