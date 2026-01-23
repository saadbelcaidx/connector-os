/**
 * BUTTON STYLES — Apple-calm design system
 *
 * SINGLE SOURCE OF TRUTH for button styling across the app.
 * Philosophy: Minimal, calm, no heavy chrome.
 * - No shadows (Apple avoids shadow depth)
 * - Subtle opacity transitions
 * - scale(0.98) on active creates "press"
 * - No color for primary CTAs - color is for feedback AFTER actions
 */

export const BTN = {
  // Primary: White, for main actions (Begin Matching, Generate Intros, Send)
  primary: `
    px-6 py-3 text-[13px] font-medium rounded-xl
    bg-white text-black
    hover:bg-white/90
    active:scale-[0.98]
    disabled:opacity-40 disabled:cursor-not-allowed
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim(),

  // Secondary: Ghost, for alternate actions (Export, Try different)
  secondary: `
    px-5 py-2.5 text-[13px] font-medium rounded-xl
    bg-white/[0.06] text-white/70
    hover:bg-white/[0.1] hover:text-white/90
    active:scale-[0.98]
    disabled:opacity-40 disabled:cursor-not-allowed
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim(),

  // Danger: Subtle red, only for system-broken states
  danger: `
    px-5 py-2.5 text-[13px] font-medium rounded-xl
    bg-red-500/[0.08] text-red-400/90
    hover:bg-red-500/[0.12]
    active:scale-[0.98]
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim(),

  // Icon: Small, square, for icon-only buttons
  icon: `
    p-2 rounded-lg
    text-white/40 hover:text-white/70
    hover:bg-white/[0.04]
    active:scale-[0.95]
    transition-all duration-150
  `.replace(/\s+/g, ' ').trim(),

  // Small: Compact version for inline actions
  small: `
    px-3 py-1.5 text-[11px] font-medium rounded-lg
    bg-white/[0.06] text-white/70
    border border-white/[0.08]
    hover:bg-white/[0.08] hover:text-white/90
    active:scale-[0.98]
    transition-all duration-150
  `.replace(/\s+/g, ' ').trim(),

  // Link: Text-only, for inline text actions
  link: `
    text-[11px] text-white/25 hover:text-white/50
    transition-all duration-300 tracking-wide
  `.replace(/\s+/g, ' ').trim(),
} as const;

export type ButtonVariant = keyof typeof BTN;
