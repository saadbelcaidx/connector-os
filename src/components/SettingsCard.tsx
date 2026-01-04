/**
 * SettingsCard — Premium card component for Settings
 *
 * Consistent styling. Hover effects. Clean.
 */

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export function SettingsCard({ children, className = '' }: SettingsCardProps) {
  return (
    <div
      className={`
        bg-gradient-to-b from-white/[0.03] to-white/[0.01]
        border border-white/[0.06]
        rounded-xl
        transition-all duration-300
        hover:border-white/[0.1]
        hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
        ${className}
      `}
      style={{
        animation: 'settings-card-fade-in 400ms ease-out backwards',
      }}
    >
      {children}
      <style>{`
        @keyframes settings-card-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * SettingsRow — Row inside a card with label, hint, and input
 */
interface SettingsRowProps {
  label: string;
  hint?: string;
  description?: string;
  icon?: LucideIcon;
  link?: { href: string; text: string };
  children: ReactNode;
  noBorder?: boolean;
}

export function SettingsRow({
  label,
  hint,
  description,
  icon: Icon,
  link,
  children,
  noBorder = false,
}: SettingsRowProps) {
  return (
    <div
      className={`
        px-5 py-4
        ${!noBorder ? 'border-b border-white/[0.04]' : ''}
        last:border-b-0
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon size={16} strokeWidth={1.5} className="text-white/50" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white/90">{label}</span>
              {hint && <InfoTip content={hint} />}
              {link && (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors"
                >
                  {link.text} →
                </a>
              )}
            </div>
            {description && (
              <p className="text-[12px] text-white/40 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 w-[280px]">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * SettingsSectionHeader — Section title with optional description
 */
interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
}

export function SettingsSectionHeader({ title, description }: SettingsSectionHeaderProps) {
  return (
    <div className="mb-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">{title}</h2>
      {description && (
        <p className="text-[12px] text-white/40 mt-1">{description}</p>
      )}
    </div>
  );
}

/**
 * SettingsInput — Styled input for settings
 */
interface SettingsInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  disabled?: boolean;
}

export function SettingsInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: SettingsInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`
        w-full h-9 px-3
        bg-white/[0.03] border border-white/[0.08]
        rounded-lg
        text-[13px] text-white placeholder-white/25
        transition-all duration-200
        focus:outline-none focus:border-white/[0.15] focus:bg-white/[0.04]
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    />
  );
}

/**
 * SettingsButton — Action button
 */
interface SettingsButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  children: ReactNode;
}

export function SettingsButton({
  onClick,
  disabled,
  loading,
  success,
  children,
}: SettingsButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        h-9 px-4
        rounded-lg
        text-[12px] font-medium
        flex items-center justify-center gap-2
        transition-all duration-200
        ${
          success
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : disabled || loading
            ? 'bg-white/[0.03] text-white/30 cursor-not-allowed'
            : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white active:scale-[0.98]'
        }
      `}
    >
      {children}
    </button>
  );
}

export default SettingsCard;
