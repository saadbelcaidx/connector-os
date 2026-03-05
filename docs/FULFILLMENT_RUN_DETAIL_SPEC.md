# Fulfillment Run Detail — Design Spec

> The operator is triaging demand contacts for a paying client.
> Every design decision flows from that single sentence.

---

## The Problem

RunDetailPageV2 was designed for **market routing** — both sides are strangers, both get equal screen weight. When Twin Focus (the client) is the supply side:

1. The left panel groups by demand, then lists supply sub-entries. But every supply entry is Twin Focus. The operator sees the same company name repeated 80 times.
2. The detail pane shows "Needs help" (demand) and "Can deliver" (supply) equally. But the operator already knows what Twin Focus delivers. The supply card is dead weight.
3. Enrichment runs on both sides. But supply enrichment is pointless — you already have the client's contact info. Every supply enrichment call is a wasted API credit.
4. The "Send Intros" button implies two-sided sends. In fulfillment mode, only demand contacts get emails.

The operator's actual mental model:

> "I have 80 founders who might need what Twin Focus offers.
> Show me who they are, why now, and why my client fits.
> Let me find their email. Let me compose."

That's a **contact triage list**, not a pair explorer.

---

## Trigger

```
const isFulfillment = !!clientEconomicSide && clientEconomicSide === 'supply';
```

Same boolean that drives ComposePanel. When active, RunDetailPageV2 switches rendering. When inactive, the page is identical to today. Zero new routes, zero new components.

---

## Layout: Market vs Fulfillment

### Market Mode (unchanged)
```
┌─────────────────────────────────────────────────────────┐
│ ← Runs  #a7f2e9  Done   12 vetted  34 strong  80 total │
├─────────────────────┬───────────────────────────────────┤
│ Acme Corp           │  VETTED                           │
│   · Twin Focus 0.82 │  ─────────────────────────────    │
│   · Beacon    0.75  │  NEEDS HELP        Technology     │
│ Quantum Labs        │  Acme Corp                        │
│   · Twin Focus 0.79 │  Hiring eng lead, needs infra     │
│   · DataCo    0.71  │  ─────────────────────────────    │
│                     │  BRIEF                            │
│                     │  Growth-stage SaaS scaling...     │
│                     │  ─────────────────────────────    │
│                     │  CAN DELIVER        Finance       │
│                     │  Twin Focus Capital               │
│                     │  Multi-family wealth planning     │
│                     │  ─────────────────────────────    │
│                     │  [Find the right person]          │
│                     │                                   │
│                     │  Supply contact                   │
│                     │  Jane Smith · jane@twin.com       │
│                     │  Demand contact                   │
│                     │  John Doe · john@acme.com         │
└─────────────────────┴───────────────────────────────────┘
```

### Fulfillment Mode (new)
```
┌─────────────────────────────────────────────────────────┐
│ ← Runs  #a7f2e9  Done      34 strong  80 contacts      │
│ ◆ Twin Focus Capital · Multi-family office    Compose → │
├─────────────────────┬───────────────────────────────────┤
│ All (80) Strong (34)│                                   │
│─────────────────────│  VETTED                           │
│ ● Acme Corp    0.82 │  ─────────────────────────────    │
│   Technology · SaaS │  Acme Corp          Technology    │
│ ● Quantum Labs 0.79 │  Hiring eng lead, needs infra     │
│   Biotech · Series B│  Series B closed Q4, scaling      │
│ ○ Beacon Health0.74 │  ─────────────────────────────    │
│   Digital health    │  WHY RELEVANT                     │
│ ○ DataCo       0.71 │  Growth-stage SaaS teams at this  │
│   Analytics         │  inflection typically need         │
│                     │  consolidated wealth planning...   │
│                     │  Risk: Early stage, liquidity TBD  │
│                     │  ─────────────────────────────    │
│                     │  [Find Contact]                   │
│                     │                                   │
│                     │  John Doe                         │
│                     │  CEO · San Francisco, CA          │
│                     │  john@acme.com  copy              │
│                     │  LinkedIn                         │
└─────────────────────┴───────────────────────────────────┘
```

---

## Component Changes

### 1. Client Context Bar

A fixed horizontal bar between the header and the workspace. Earns its pixels by giving the operator persistent context about who they're working for.

**Position:** Between header row and two-panel workspace.
**Height:** 36px collapsed. Expandable to ~120px.
**Background:** `rgba(255,255,255,0.015)` — barely there, but separates from the header.
**Border:** bottom `1px solid rgba(255,255,255,0.04)`.

**Collapsed (default):**
```
◆ Twin Focus Capital · Multi-family office · 80 contacts for client     ▸ Profile     Compose →
```

- `◆` — 6px diamond, `rgba(52,211,153,0.40)`. Visual anchor. Not an icon — a typographic mark.
- Client name — `13px`, `white/60`. The loudest thing in the bar.
- Specialization — `11px`, `white/25`. One phrase from `profile.specialization`.
- Contact count — `10px`, `white/15`. "80 contacts for client".
- Profile toggle — `10px`, `white/20`. Expands the bar.
- Compose button — same green treatment as current "Send Intros", but labeled "Compose →". Routes to `/station/run/{jobId}/send` with enrichResults.

**Expanded:**
```
◆ Twin Focus Capital · Multi-family office                              ▾ Profile     Compose →
  ICP: CEOs, Founders · Technology, Finance, Biotech
  Geography: US-based · Size: $50M+ net worth
  Outcomes: Consolidated wealth plan · Tax optimization
  Differentiators: Direct PE access · In-house tax team
  Tone: Professional, discreet, exclusive
```

- Each line: `10px mono`, `white/20`. Pulled directly from `ClientProfile` fields.
- Only shows non-empty fields. If `profile.icpTitles` is empty, skip the ICP line.
- Collapsed on click of "Profile" again, or click anywhere outside.

**Why this works:** The operator never has to ask "wait, who am I doing this for?" The answer is always visible. Expanding shows the brief without leaving the page — no modal, no navigation.

---

### 2. Left Panel — Contact List (replaces grouped pair list)

**Current (market):** `groupByDemand()` → demand header → supply sub-entries.
**Fulfillment:** Flat list deduped by `demandKey`. One row per unique demand contact.

#### New function: `groupByDemandFlat()`

```typescript
interface DemandContact {
  demandKey: string;
  demandName: string;
  industry: string | null;
  signal: string;           // whyNow || framing (truncated)
  bestScore: number;        // highest combined across all matches for this demandKey
  bestMatch: MatchResult;   // the match with the highest combined score
  allMatches: MatchResult[];// all matches sharing this demandKey
  enriched: boolean;        // true if any match for this demandKey has demand-side enrichment
}
```

**Dedup rule:** Same demand founder matched via 3 different supply capabilities → one row, best score, best match as representative. The operator doesn't care which Twin Focus capability triggered it — they care about the person.

**Row layout:**
```
┌─────────────────────────────────────────┐
│ ● Acme Corp                        0.82 │
│   Technology · hiring eng lead          │
└─────────────────────────────────────────┘
```

- **Tier dot** — same colors as today (`#34d399` strong, `rgba(96,165,250,0.50)` good, etc.)
- **Company name** — `11px mono`, `white/70` when selected, `white/40` default
- **Score** — `10px mono`, `white/20`, right-aligned
- **Second line** — `10px mono`, `white/15`. `industry · whyNow` (or `industry · framing` if no whyNow). Truncated to one line.
- **Enrichment indicator** — replace tier dot with `●` (filled, `#34d399`) when demand-side enriched. This tells the operator at a glance "I already have this person's email."
- **VETTED badge** — same as current, right-aligned if `bestMatch.evalStatus === 'curated'`

**Selected state:** `background: rgba(255,255,255,0.04)`, name bumps to `white/80`.

**Click:** Sets `selectedEvalId` to `bestMatch.evalId`. Detail pane shows the best match.

**Sort:** By `bestScore` descending (same as current). Curated/vetted matches float to top.

**Filter chips:** Same as current (`All`, `Strong`, `Good`) but count unique demand contacts, not match pairs. "All (80)" means 80 unique founders, not 164 pairs.

---

### 3. Detail Pane — Contact Detail (replaces pair detail)

The detail pane shows the selected demand contact and why they're relevant to the client. No supply card.

#### Section 1: Status
Identical to current — VETTED badge or tier dot + label.

#### Section 2: Demand Contact (replaces "Needs help")
**Label change:** `NEEDS HELP` → just the company name, larger.

```
Acme Corp                    Technology
Hiring engineering lead, needs infrastructure
Series B closed Q4, company scaling fast
```

- Company name: `15px`, `white/90`, font-weight 500.
- Industry: `10px`, `white/25`, right-aligned on same line.
- Wants: `13px`, `white/40`. The demand intent.
- WhyNow: `12px`, `white/25`. The timing signal.
- Intel button: same `[Intel]` toggle as current.

The gold left border stays (`2px solid rgba(251,191,36,0.20)`). It marks demand intent.

#### Section 3: Relevance (replaces "Brief" / "Signal")
**Label change:** `BRIEF` / `SIGNAL` → `WHY RELEVANT`
**Color:** Same tier-based color on the label.

The reasoning text is the same `match.reasoning` field. But the section header now frames it as "why this person matters to your client" instead of "why this pair matches."

If the operator sees "Growth-stage SaaS companies at this inflection typically need consolidated wealth planning as personal liquidity events approach" — that's not a generic brief. That's the AI explaining why John at Acme is relevant to Twin Focus, right now.

Risks section: identical to current.

#### Section 4: Match Angles (new, collapsible)
When the same demand founder matched via multiple supply capabilities, show a collapsed section:

```
3 match angles  ▸
```

Expanded:
```
3 match angles  ▾
  0.82 · Growth-stage wealth planning need (framing text)
  0.75 · Tax optimization after Series B (framing text)
  0.69 · PE co-investment interest (framing text)
```

Each line: `10px mono`, score + truncated framing. This gives the operator the full picture without cluttering the main view. Most contacts will have 1 angle. Some will have 2-3.

#### Section 5: ~~Supply Card~~ → REMOVED

Gone. The client context bar at the top tells the operator everything about the supply side. No "Can deliver" section. No supply intel panel. The space is reclaimed for what matters.

#### Section 6: Enrichment (simplified)
**Label change:** `Find the right person` → `Find Contact`
**Behavior change:** Only enriches demand side. Supply enrichment call is skipped entirely.

Display: Single `EnrichmentContactCard` with label "Contact" (not "Demand contact" — that's market language).

```
┌──────────────────────────────────────┐
│ CONTACT                              │
│ John Doe                             │
│ CEO · San Francisco, CA              │
│ john@acme.com  copy                  │
│ LinkedIn                             │
└──────────────────────────────────────┘
```

Same scan-line animation, same reveal stagger, same error states. Just one card instead of two.

---

### 4. Header Adjustments

| Element | Market Mode | Fulfillment Mode |
|---------|-------------|------------------|
| Lens badge | `Lens: Twin Focus` | Removed (redundant — client bar shows it) |
| Stats | `12 vetted · 34 strong · 80 total` | `34 strong · 80 contacts` |
| Count label | `80 total` or `80 of 164 for Twin Focus` | `80 contacts` |
| CTA button | `Send Intros` | Removed (moved to client context bar as `Compose →`) |

---

### 5. Empty Detail State

**Market:** "Select a pair to see the connection"
**Fulfillment:** "Select a contact to see relevance"

---

## Interaction Flow

1. Operator lands on `/station/run/{jobId}` with Twin Focus lens active
2. Client context bar shows: `◆ Twin Focus Capital · Multi-family office · 80 contacts`
3. Left panel shows 80 unique demand contacts, sorted by score
4. Operator scans the list. Tier dots give instant quality signal
5. Clicks "Acme Corp" → detail pane shows: company, intent, timing, WHY RELEVANT
6. Reads reasoning. Decides this person is worth reaching out to
7. Clicks "Find Contact" → enrichment runs demand-side only
8. Contact card reveals: John Doe, CEO, john@acme.com
9. Repeats for N contacts
10. Clicks "Compose →" in client bar → navigates to SendPage with fulfillment mode active
11. Writes one demand intro → AI generates the rest → sends demand-only

---

## What Does NOT Change

- `useMCPJob` hook — untouched
- `applyOverlayV2` — untouched (already handles fulfillment filtering)
- `EvaluationProgress` — untouched (pipeline progress is the same)
- `CompanyIntelPanel` — untouched (demand intel still works)
- `EnrichmentContactCard` — untouched (same component, just rendered once)
- Overlay detection logic — untouched (already reads localStorage)
- All routes — untouched (same URLs)
- `MatchCard`, `LiveMatchFeed`, `JobSidebar`, `EvaluationView` — untouched (these are for the streaming phase, not the detail page)

---

## Files Changed

| File | What | Lines |
|------|------|-------|
| `RunDetailPageV2.tsx` | Add `isFulfillment`, fork left panel + detail pane + header | ~200 lines modified |

One file. That's it. All the building blocks exist. We're forking rendering, not adding architecture.

---

## Implementation Sequencing

1. Add `isFulfillment` boolean (derived from existing `clientEconomicSide`)
2. Add `ClientContextBar` as inline sub-component (~60 lines)
3. Add `groupByDemandFlat()` function + `ContactListItem` renderer (~80 lines)
4. Add `ContactDetail` function (fork of `PairDetail` minus supply card) (~100 lines)
5. Fork the header (remove redundant lens badge + rename CTA)
6. Fork the left panel render (`isFulfillment ? ContactListItem : DemandGroupItem`)
7. Fork the right panel render (`isFulfillment ? ContactDetail : PairDetail`)
8. Fork enrichment handler to skip supply when `isFulfillment`
9. Type check + build

---

## Visual Reference

### Typography Scale (fulfillment detail pane)
```
15px  white/90  500    Company name
13px  white/40         Wants (intent)
13px  white/55         Reasoning (why relevant)
12px  white/25         WhyNow (timing signal)
11px  white/25         Error states, enrichment labels
10px  white/45         Section headers (uppercase tracking)
10px  white/25         Industry, match angle scores
10px  white/15         Signal line in left panel
 9px  tier-color       Status labels (WHY RELEVANT, VETTED)
```

### Color System (unchanged from market mode)
```
#34d399              Strong tier / enriched indicator / vetted
rgba(96,165,250,0.50) Good tier
rgba(251,191,36,0.35) Weak tier / demand border
rgba(248,113,113,0.50) Conflict / vetoed
rgba(52,211,153,0.40) Client diamond ◆
rgba(255,255,255,0.04) Borders, dividers
rgba(255,255,255,0.015) Subtle backgrounds (client bar)
```

### Spacing
```
Client context bar:   36px height, 20px horizontal padding
Left panel row:       44px height (12px pad top/bottom, 16px horizontal)
Detail sections:      24px gap between sections
Enrichment card:      16px internal padding, 8px border-radius
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Lens active but `economicSide` is `'demand'` | Standard market mode (client IS the demand, not a contact triage) |
| Lens active but no `profile` | Standard market mode (`isFulfillment` requires profile) |
| 0 contacts after overlay filter | Empty state: "{ClientName} filters don't match this run" (same as current) |
| Demand founder matched 5 times | One row in contact list, "5 match angles" collapsible in detail |
| No enrichment keys configured | Same "Add Apollo or Anymail..." prompt, but only for demand side |
| Job still running (streaming) | Contact list updates live as matches arrive. Same dedup applies. |
| Enrichment already cached | Filled dot on contact row. Detail pane shows contact card immediately. |

---

## Success Criteria

1. Operator never sees Twin Focus repeated in the left panel
2. Operator never sees a "Can deliver" supply card for their own client
3. No supply enrichment API calls are made in fulfillment mode
4. "Compose →" navigates to the fulfillment-aware ComposePanel
5. Market mode is pixel-identical to today (zero regression)
6. Clean build: `npx tsc --noEmit` + `npx vite build`
