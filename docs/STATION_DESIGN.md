# STATION_DESIGN.md — Station UI Design System

> Extracted from Station.tsx (2,823 lines, worktree-keygen-v1 branch).
> Canonical loop: Signal -> Syndicate -> Match -> Route -> Print

## Design Doctrine

**Linear x Palantir** — data-dense rows, monospace values, near-monochrome, 4px grid.
No cards. No rounded-xl. No batch send.

---

## 1. Color Palette

### Backgrounds
| Token | Usage |
|-------|-------|
| `bg-[#09090b]` | Page background, dropdown menus, modal containers |
| `bg-[#0e0e0e]` | Elevated surfaces (industry popover) |
| `bg-black/70` | Modal backdrop overlay |
| `bg-white/[0.01]` | Subtle tint (Today's Progress banner) |
| `bg-white/[0.02]` | Explain drawer, dropdown item hover |
| `bg-white/[0.03]` | Input backgrounds (TokenInput, dropdowns) |
| `bg-white/[0.04]` | Mode toggle container, inline inputs, match row hover/selected |
| `bg-white/[0.06]` | Selected dropdown item, selected mode button |
| `bg-white/[0.08]` | Token chips, action button default |
| `bg-white/10` | "why" button active state |
| `bg-white/[0.12]` | Primary action button background, selected batch chips |
| `bg-white/[0.18]` | Primary button hover |

### Text (White Opacity Hierarchy)
| Token | Usage |
|-------|-------|
| `text-white` | Primary action button text |
| `text-white/90` | Company names, selected dropdown, modal headings |
| `text-white/80` | Action button text, industry chips, rank score, client name |
| `text-white/70` | Input values, token chip text, selected dropdown option |
| `text-white/60` | Signal detail (secondary), batch size buttons, score values |
| `text-white/50` | Dropdown item text, intro preview, muted content |
| `text-white/40` | Column headers, status labels, chip unselected, overlay weight labels |
| `text-white/30` | Section labels, phase labels, cancel/back buttons, counts |
| `text-white/25` | Loading phase labels, edit button text |
| `text-white/20` | Tertiary labels, dropdown caret, placeholder text, disabled |
| `text-white/15` | Inline annotation labels |

### Borders
| Token | Usage |
|-------|-------|
| `border-white/[0.04]` | Row dividers (`divide-y`), diagnostic borders |
| `border-white/[0.06]` | Primary structural borders (headers, columns, panels, inputs) |
| `border-white/[0.08]` | Unselected chip, input borders, client card |
| `border-white/[0.10]` | Modal container border |
| `border-white/[0.12]` | Dropdown hover border |
| `border-white/20` | Focus state on inputs, selected chip borders |
| `border-white/30` | Selected side button (client manager) |

### Accent Colors (Semantic Only)
| Token | Usage |
|-------|-------|
| `text-emerald-400` | Tier A / strong, send success |
| `text-emerald-400/70` | Gate "pass" indicator, active version |
| `text-blue-400` | Tier B / good |
| `text-amber-400/60` | Streak counter, supply exhausted warning |
| `text-red-400/70` | Error messages |
| `text-red-400/60` | Send error, gate fail indicator |
| `text-red-400/50` | Excluded reason text |

### Shadows
```
0 0 20px rgba(255,255,255,0.06)   — Execute button glow (prebuilt mode)
0 0 24px rgba(255,255,255,0.07)   — Execute button glow (custom mode)
```
No other box-shadows. All buttons enforce `boxShadow: 'none'` inline.

---

## 2. Typography

### Fonts
| Class | Usage |
|-------|-------|
| `font-mono` | **Dominant font.** ALL data, labels, values, buttons, inputs, breadcrumbs, chips, scores. |
| (sans-serif default) | Company names only (`font-medium`), modal headings |

### Sizes
| Size | Usage |
|------|-------|
| `text-[15px]` | Company names in match review rows (largest in system) |
| `text-[13px]` | Company names in route panel, modal headings |
| `text-[12px]` | Client name in client manager |
| `text-xs` (12px) | Signal detail / tier reason |
| `text-[11px]` | **Workhorse size.** Buttons, inputs, dropdowns, action text, error messages, emails, intro preview |
| `text-[10px]` | Column headers, section labels, tier badges, rank scores, version history, score breakdown |
| `text-[9px]` | Phase badges, overlay editor titles, excluded count, progress label, streak, pipeline link |

### Patterns
```tsx
// Section label (canonical)
<p className="font-mono text-white/40 mb-1.5 tracking-widest uppercase" style={{ fontSize: '10px' }}>
  DEMAND PACK
</p>

// Overlay editor label
<p className="font-mono text-white/30 tracking-widest uppercase" style={{ fontSize: '9px' }}>
  TRACKING LABEL
</p>
```

### Rules
- `font-medium` is the heaviest weight. No bold.
- `tracking-widest` always paired with `uppercase` and `font-mono`
- `truncate` on company names, emails, signal detail (prevent row overflow)

---

## 3. Spacing & Grid

### The 4px Grid
All spacing in multiples of 4px:
| Value | Pixels | Usage |
|-------|--------|-------|
| `gap-1` | 4px | Batch buttons, chips, panel dots |
| `gap-1.5` | 6px | Chip grids, industry chips |
| `gap-2` | 8px | Button groups, action buttons |
| `gap-2.5` | 10px | Checkbox to content in rows |
| `gap-3` | 12px | Progress bar internal, overlay slider rows |
| `gap-4` | 16px | Stat items in progress banner |
| `gap-5` | 20px | Today's Progress items |

### Key Widths
| Width | Usage |
|-------|-------|
| `max-w-[1200px]` / `xl:max-w-[1400px]` | Main content container |
| `280px` | Prebuilt pack selector column |
| `720px` | Signal selection panel |
| `560px` | Overlay editor modal |
| `420px` | Client manager modal |
| `max-w-sm` (384px) | Enrichment progress container |

### Section Spacing (Inline)
```
marginTop: '64px'     — Content area from header
marginBottom: '32px'   — Between major sections
marginBottom: '20px'   — Between form fields
marginBottom: '16px'   — Between batch size and execute
marginTop: '40px'      — Batch size section from content above
```

---

## 4. Components

### Dropdown (Custom, No Native)
```tsx
// Trigger
<button className="w-full font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] transition-colors flex items-center justify-between px-3" style={{ height: '28px' }}>
  <span className={selected ? 'text-white/70' : 'text-white/20'}>{label}</span>
  <span className="text-white/20 ml-2">▾</span>
</button>

// Menu
<div className="absolute top-full left-0 right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
  <button className="w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors text-white/50 hover:text-white/80 hover:bg-white/[0.02]" />
  // Selected: text-white/90 bg-white/[0.06]
</div>

// Always add click-away backdrop
<div className="fixed inset-0 z-40" onClick={close} />
```

### Chip (Filter Pill)
```
height: 22px, padding: 0 8px, fontSize: 11px, font-mono rounded
Selected: border rgba(255,255,255,0.20), bg rgba(255,255,255,0.12), text-white/90
Unselected: border rgba(255,255,255,0.08), bg transparent, text-white/40
Hover: text-white/60
outline: none, boxShadow: none
```

### Token Input (Tag Input)
```tsx
<div className="min-h-[28px] px-2 py-1 bg-white/[0.03] border border-white/[0.06] rounded flex flex-wrap gap-1 cursor-text focus-within:border-white/20 transition-colors">
  {/* Tokens: h-5 px-1.5 bg-white/[0.08] rounded text-[10px] font-mono text-white/70 */}
  {/* Remove btn: text-white/30 hover:text-white/70 */}
  <input className="flex-1 min-w-[80px] bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/20 outline-none" />
</div>
```

### Mode Toggle (Segmented Control)
```
Container: inline-flex rounded border border-white/[0.06] bg-white/[0.04], height: 28px
Active: bg-white/[0.10] text-white
Inactive: text-white/40 hover:text-white/70
Font: font-mono text-[11px]
```

### Button (Primary)
```tsx
<button className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
  style={{ height: '36px', padding: '0 20px', background: 'rgba(255,255,255,0.12)', fontSize: '12px' }}>
  Run
</button>
// Enabled glow: boxShadow: '0 0 20px rgba(255,255,255,0.06)'
// Disabled: opacity: 0.25, cursor: not-allowed
```

### Button (Secondary)
```
h-7 px-3 text-[11px] rounded bg-white/[0.08] text-white/80
Hover: hover:bg-white/[0.12]
Disabled: disabled:opacity-40 disabled:cursor-not-allowed
```

### Button (Ghost)
```
text-[11px] text-white/30 hover:text-white/50 transition-colors
No background, no border. Used for: Cancel, back, reset, edit, rollback
```

### Progress Bar
```tsx
<div className="flex items-center gap-3">
  <span className="w-16 text-[10px] font-mono text-white/40 shrink-0">{label}</span>
  <div className="flex-1 h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
    <div className="h-full bg-white/40 transition-all duration-150" style={{ width: `${pct}%` }} />
  </div>
  <span className="w-12 text-right text-[10px] font-mono text-white/30 shrink-0">{value}</span>
</div>
```

### Match Row
```
Container: flex, min-h-[72px], divide-y divide-white/[0.04]
  Default: hover:bg-white/[0.04] cursor-pointer
  Selected: bg-white/[0.04]
  Excluded: opacity-30 cursor-default

Each side: flex-1 flex items-start gap-2.5 px-4 py-4
  Demand has: border-r border-white/[0.06]

Company name: text-[15px] text-white/90 font-medium truncate
Tier badge: text-[10px] font-mono [tierColor] — "[A]", "[B]", "[C]"
Phase badge: text-[9px] font-mono — sent: text-emerald-400, generated: text-white/40
Signal detail: text-xs font-mono text-white/60 truncate mt-0.5
Checkbox: mt-0.5 w-3.5 h-3.5 accent-white
```

### Route Row
```
Each side: flex-1 px-4 py-3 space-y-2
Company name: text-[13px] text-white/90 font-medium truncate
Email found: text-[11px] font-mono text-white/40 "checkmark email"
Email not found: text-[11px] font-mono text-white/20 "x not found"
Intro preview: text-[11px] text-white/50 leading-relaxed
```

### Explain Drawer (Score Breakdown)
```
Container: px-4 py-3 bg-white/[0.02] border-t border-white/[0.04]
Title: text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2
Grid: grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-mono
  Label: text-white/40, Value: text-white/60
  Total: text-white/80 font-medium
  Gate pass: text-emerald-400/70, Gate fail: text-red-400/60
```

### Modal
```
Backdrop: fixed inset-0 z-50 flex items-center justify-center bg-black/70
Container: w-[560px] max-h-[80vh] overflow-y-auto bg-[#09090b] border border-white/[0.10] rounded-sm
Header: px-5 py-3 border-b border-white/[0.06]
  Title: text-[13px] text-white/90 font-medium
  Close: text-[11px] text-white/30 hover:text-white/60 "x"
Body: p-5 space-y-6
```

### Signal Panel (Floating)
```
Backdrop: fixed inset-0 z-50, bg rgba(0,0,0,0.50), backdropFilter: blur(2px)
Panel: w-[720px] maxHeight: 80vh, bg rgba(255,255,255,0.025), backdropFilter: blur(12px)
  border border-white/[0.08] rounded-lg (exception to rounded rule)
Header: px-5 py-3 border-b border-white/[0.06]
```

### Today's Progress Banner
```
Container: flex items-center gap-5 px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.01]
Label: text-[9px] font-mono text-white/20 tracking-wider uppercase
Stats: text-[10px] font-mono text-white/40, values in text-white/60
Streak: text-[10px] font-mono text-amber-400/60
```

---

## 5. Icons

Station uses **NO icon libraries**. Text characters only:

| Char | Usage |
|------|-------|
| `▾` | Dropdown caret |
| `▸` / `▾` | Collapsible toggle |
| `x` | Token remove, close buttons |
| `checkmark` | Email found, send success, inline confirm |
| `x` | Email not found, send error |
| `<-` | Back navigation |
| `->` | Forward navigation, pipeline link |

---

## 6. States

### Hover
| Element | Effect |
|---------|--------|
| Dropdown trigger | `hover:border-white/[0.12]` |
| Dropdown item | `hover:text-white/80 hover:bg-white/[0.02]` |
| Chip (unselected) | `hover:text-white/60` |
| Ghost button | `hover:text-white/50` |
| Primary button | `hover:bg-white/[0.18]` |
| Match row | `hover:bg-white/[0.04]` |
| Settings link | `text-white/50 hover:text-white/70 underline underline-offset-2` |

### Focus
All inputs: `focus:outline-none`, some add `focus:border-white/20`.
TokenInput: `focus-within:border-white/20`.
All buttons: `outline: none, boxShadow: none` (enforced inline).
No focus rings anywhere.

### Disabled
Primary button: `opacity: 0.25, cursor: not-allowed`.
Secondary button: `disabled:opacity-40 disabled:cursor-not-allowed`.
Excluded row checkbox: `disabled:opacity-0` (invisible).

### Loading
```
Message: font-mono text-white/30 at 11px, "Initializing acquisition..."
Phase labels: font-mono text-white/25 at 10px
Bar track: h-[2px] bg-white/[0.06] rounded-full
Bar fill: bg-white/30 (not /40 in loading state)
Animation: barFill 2.5s ease-out forwards
Three bars: "loading demand", "matching signals", "building pairs"
```

---

## 7. Animations

### Slide In (Section Reveal)
```css
@keyframes stSlideIn {
  from { opacity: 0; transform: translateY(8px) }
  to   { opacity: 1; transform: translateY(0) }
}
```
Usage: `style={{ animation: 'stSlideIn 200ms ease both' }}`

### Bar Fill (Loading)
```css
@keyframes barFill {
  from { width: 0% }
  to   { width: 100% }
}
```
Usage: `style={{ animation: 'barFill 2.5s ease-out forwards' }}`

### Transitions
Only `transition-colors` at 150ms default. No spring physics. No scale transforms. The system is deliberately restrained.

---

## 8. Layout

### Page Structure
```tsx
<div className="min-h-screen bg-[#09090b] flex flex-col">
  {/* Header */}
  <div className="flex items-center px-6 py-3 border-b border-white/[0.06]">
    <p className="text-[10px] font-mono text-white/20 tracking-widest uppercase">STATION</p>
  </div>
  {/* Content */}
  <div className="px-24 pb-10 w-full max-w-[1200px] xl:max-w-[1400px] mx-auto" style={{ marginTop: '64px' }} />
</div>
```

### Two-Column Split (Match Review / Route)
```
Column headers: flex border-b border-white/[0.06]
  Left: flex-1 px-4 py-2 border-r border-white/[0.06]
  Right: flex-1 px-4 py-2

Rows: flex-1 overflow-y-auto divide-y divide-white/[0.04]
  Row: flex
    Left: flex-1 ... border-r border-white/[0.06]
    Right: flex-1 ...

Footer: flex items-center justify-between px-4 py-3 border-t border-white/[0.06]
```

### Station Layout (Post-Load)
```
Top bar: flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]
  Left: breadcrumb (shrink-0)
  Center: lens bar (flex-1 justify-center)
  Right: counts + dots + reset (shrink-0)

Progress banner: flex items-center gap-5 px-4 py-1.5 border-b border-white/[0.04]
Content: flex-1 overflow-hidden px-24 xl:px-32
```

### Z-Index
| z-index | Usage |
|---------|-------|
| `z-40` | Click-away backdrops for dropdowns |
| `z-50` | Dropdowns, signal panel, modals |

### Scrollbar Hiding
```tsx
className="overflow-y-auto [&::-webkit-scrollbar]:hidden"
style={{ scrollbarWidth: 'none' }}
```
Always hide scrollbars. No exceptions.

---

## 9. State Patterns

### localStorage Keys
```
station_daily_stats   — { dateISO, reviewed, sent, generated }
station_streak        — { lastDateISO, streakCount }
first_intro_sent      — 'true' when first intro ever sent
print_deals           — Deal[] array for fulfillment tracking
```

### Tier Functions
```typescript
function tierLabel(tier: ConfidenceTier): string {
  return tier === 'strong' ? 'A' : tier === 'good' ? 'B' : 'C';
}
function tierColor(tier: ConfidenceTier): string {
  return tier === 'strong' ? 'text-emerald-400' : tier === 'good' ? 'text-blue-400' : 'text-white/30';
}
```

### Panel Dots (Step Indicator)
```
Container: flex gap-1
Active dot: w-1.5 h-1.5 rounded-full bg-white/40
Inactive dot: w-1.5 h-1.5 rounded-full bg-white/10
```

---

## 10. Anti-Patterns (NEVER USE)

| Pattern | Why |
|---------|-----|
| `rounded-xl`, `rounded-2xl` | Too soft. Station is sharp. `rounded` (4px) only. |
| `bg-gradient-*` | No gradients. Flat surfaces only. |
| Cards with shadows | No elevation. Flat hierarchy. |
| Bright accent colors | Near-monochrome. Color = semantic meaning only. |
| `text-sm`, `text-base` | Explicit pixel sizes: `text-[10px]`, `text-[11px]` only. |
| Native `<select>` | Custom dropdowns only. No browser chrome. |
| Native scrollbars | Always hidden. |
| Sans-serif for data | Everything is `font-mono`. Sans-serif for company names only. |
| Emojis | Never. |
| Lucide/SVG icons | Text characters only (▾, x, checkmark, arrows). |
| Bold text | `font-medium` is maximum weight. |
| Large text | 15px max (company names). Headers 10-11px. |
| Focus rings | `outline: none` everywhere. Border color change only. |
| Scale/spring animations | Only `stSlideIn` (200ms) and `barFill` (2.5s). Nothing else. |
| Color backgrounds for sections | Separated by 1px borders, not background blocks. |
| Empty state illustrations | When no data, elements don't render. No "no data yet" cards. |
| Padding-heavy layouts | Dense. Rows 72px min. Tight spacing. Operators scan fast. |

---

## The One Rule

**If it doesn't look like it belongs in a Bloomberg terminal crossed with Linear, it doesn't belong in Station.**
