# Fulfillment Doctrine

> This document is the single source of truth for fulfillment mode.
> Read this BEFORE touching any fulfillment code. If it contradicts anything else, this wins.

---

## The Core Insight

Connector OS has TWO operating modes. They share the same pipeline but produce completely different UX.

### Mode 1: Market Routing (default)
- Operator scans a market. Both sides are strangers.
- Pipeline finds demand×supply pairs. Operator writes intros to BOTH sides.
- Goal: get replies from both → 15min call → close access fee from both.
- UI shows both sides equally. Compose writes two intros per match.

### Mode 2: Fulfillment (client lens active, client IS one side)
- A client has PAID. They are the supply (or demand). They don't get cold outreach.
- Pipeline still scores demand×supply pairs — but the supply side is KNOWN (it's your client).
- Operator only writes intros to the OTHER side (demand founders).
- Goal: activate demand contacts on behalf of the paying client.
- UI should surface the demand contacts as the action list. Supply = your client = collapsed/badge.

**The trigger:** `economicSide === 'supply'` on the FulfillmentClient means the client IS the supply side → fulfillment mode. The demand founders are the targets.

(If `economicSide === 'demand'`, the client is the demand side — targets would be supply. Same logic, flipped. Not built yet but the architecture supports it.)

---

## Why This Matters

Without fulfillment mode:
- Twin Focus (your client who paid) gets cold outreach emails alongside strangers
- Operator writes supply intros that will never be sent (waste)
- AI generates supply copy that could leak the client's identity to demand contacts
- The run detail page shows both sides equally when the operator only cares about one

With fulfillment mode:
- Client never receives cold outreach
- Operator only writes demand-side intros
- AI never names the client — describes capability generically
- Run detail page surfaces demand contacts as the actionable list
- 3-layer dedup prevents same founder getting multiple emails

---

## The Pipeline Doesn't Change

This is critical. The V5 MCP pipeline (mcp-orchestrate → QStash → mcp-evaluate-worker) runs identically in both modes. It scores demand×supply pairs the same way. The overlay lens filters results client-side AFTER scoring.

What changes is ONLY:
1. Which matches survive the overlay filter (client relevance)
2. How the UI presents those matches (who is the target vs who is the client)
3. How compose works (one-sided vs two-sided)
4. How send works (demand-only vs both sides)

---

## Data Flow

```
Pipeline run (same for both modes)
    ↓
mcp_evaluations table (demand_key × supply_key pairs with scores)
    ↓
RunDetailPage loads matches + canonicals
    ↓
Overlay lens applied (filters to client-relevant matches)
    ↓
[HERE IS WHERE THE MODES DIVERGE]
    ↓
Mode 1 (Market):          Mode 2 (Fulfillment):
  Show D × S equally        Show demand as action list
  Compose: 2 textareas      Compose: 1 textarea (demand only)
  Send: both sides           Send: demand only
  introSource: 'ai-v2'      introSource: 'ai-v2-fulfillment'
```

---

## The Three Dedup Layers (Fulfillment Only)

In market mode, dedup is by supply email (one supply contact may match multiple demands → one supply intro).

In fulfillment mode, dedup is by DEMAND:

| Layer | Where | What | Without it |
|-------|-------|------|------------|
| **Prompt** | `generateFulfillmentIntros()` | Dedup by `demandKey` — same founder × 3 supply firms = 1 AI call | AI generates 3 identical intros for same person (waste + cost) |
| **Draft mapping** | `handleGenerate()` | Map single AI draft back to all evalIds sharing that `demandKey` | UI shows 3 separate cards for same person (confusing) |
| **Send** | `handleSend()` | Dedup by demand email — one email per unique person | Same founder gets 3 emails (spam, reputation damage) |

---

## Client Name Protection

In fulfillment mode, the client's name must NEVER appear in AI-generated intros sent to demand contacts. The AI prompt:
- Receives the client profile (specialization, differentiators, pain points, outcomes, case study, tone)
- Is explicitly told: "NEVER name the client company — describe their capability generically"
- Refers to supply capability as "a firm specializing in..." or "a team that..."

The demand contact learns enough to be interested but not enough to identify the client. That's behind the paywall.

---

## Critical Send Safety Bugs (14 total, 2 audit rounds)

**Full spec:** `docs/SEND_SAFETY_SPEC.md`

Fourteen failure modes across two audit rounds. All real. The DB is the guardrail — app code is UX.

### Round 1 — Structural Gaps

| # | Bug | What Goes Wrong | Fix |
|---|-----|-----------------|-----|
| 1 | **Side collision** | Cooldown checks `WHERE email AND side` — same person as demand in run A, supply in run B bypasses cooldown | Global email dedup. No side filter. Humans don't care which side they were. |
| 2 | **Reserved burns cooldown** | Ledger row inserted → Instantly 500s → row exists → cooldown blocks retries forever | Three-state lifecycle: `reserved` → `sent` \| `failed`. Only `sent` rows count for cooldowns. |
| 3 | **Daily cap query degrades** | `COUNT(*) WHERE created_at > NOW() - 1 day` becomes hot under traffic | Future: `operator_daily_stats` table with atomic increment. |
| 4 | **Deterministic send_id collision** | `jobId + evalId + email` is stable — re-runs/backfills with same evalId collide | Add `composeSessionId` (UUID per compose mount) to hash. |
| 5 | **No domain throttle** | 3 founders at `@startup.com` → 3 emails simultaneously → spam filter flags it | Max 1 email per root domain per 24h. |
| 6 | **Ledger growth** | 200 sends/day = 73k rows/year/operator | Future: monthly partitions. |
| 7 | **Missing declined cooldown** | `closed_lost` / `stale` contacts have no cooldown → operators re-pitch people who said no | 180-day cooldown for declined statuses. |

### Round 2 — Concurrency + Normalization

| # | Bug | What Goes Wrong | Fix |
|---|-----|-----------------|-----|
| 8 | **Domain throttle race** | Two concurrent calls both pass domain check (neither row exists yet) → 2 emails to same domain | `pg_advisory_xact_lock(hashtext(root_domain))` — serializes per domain. |
| 9 | **Reserved rows leak** | Worker crashes between reserve and Instantly call → row stays `reserved` forever | Cleanup: expire `reserved` rows > 10 min to `failed` at start of every `try_reserve_send()`. |
| 10 | **DELETE too aggressive** | `DELETE WHERE status != 'sent'` can nuke another worker's live `reserved` row | Only delete `status IN ('failed', 'blocked')`. Never delete reserved. |
| 11 | **Email normalization** | `JOHN@startup.com` and `john+podcast@startup.com` bypass cooldown — same inbox, different strings | `normalized_email` column. Lowercase, strip plus aliases (Gmail), trim. All lookups use normalized. |
| 12 | **Domain parsing** | `sarah@mail.startup.com` ≠ `john@startup.com` but deliverability treats them as same | `root_domain` column. Extract root (startup.com from mail.startup.com). Throttle on root. |
| 13 | **No bounce suppression** | Instantly hard bounce → system keeps retrying across runs → deliverability death spiral | `status = 'bounced'` = permanent suppression. Rule 0.5 in try_reserve_send. |
| 14 | **Cooldown queries hot at scale** | `ORDER BY created_at DESC LIMIT 1` fine at 10K, hot at 10M rows | Future: `email_last_contacted` + `domain_last_contacted` single-row lookup tables. |

### Cooldown Policy

| Scenario | Window |
|----------|--------|
| Same email, same client | 30 days |
| Same email, different client | 90 days |
| Same email, declined/closed_lost | 180 days |
| Active conversation (replied/meeting) | Permanent |
| Same root domain, same operator | 24 hours |
| Daily operator cap | 200/day |
| Hard bounce | Permanent |

### Architecture

```
handleSend() per email:
  normalizeEmail() → extractRootDomain()
  generate send_id (jobId + evalId + normalizedEmail + composeSessionId)
  → RPC: try_reserve_send()
  → advisory lock on root_domain → expire stale reservations → check 8 rules
  → DB returns allowed/blocked + reason
  → allowed → Instantly API → confirm_send() or fail_send()
  → blocked → skip with reason for UI
```

**DB tables:** `contact_send_ledger` (audit + enforcement), `email_last_contacted` (future perf), `domain_last_contacted` (future perf), `operator_daily_stats` (future perf)
**RPCs:** `try_reserve_send()`, `confirm_send()`, `fail_send()`, `record_bounce()`
**Client-side:** `normalizeEmail()`, `extractRootDomain()`, `buildSendId()` in `sendSafety.ts`
**Status:** NOT BUILT. Spec finalized (v3). Migration + RPCs + client integration pending.

---

## What's Built (as of 2026-03-04)

### Compose Engine (`composeEngine.ts`)
- `buildFulfillmentMatchContext()` — anonymized match context (no client name)
- `buildFulfillmentComposePrompt()` — demand-only AI prompt with client profile
- `parseFulfillmentResponse()` — demand-only JSON parser
- `generateFulfillmentIntros()` — orchestrator with Layer 1+2 dedup

### Context Bridge (`context.ts`)
- `getDemandEnrichedPairs()` — filters to matches where demand has enriched email

### ComposePanel (`ComposePanel.tsx`)
- `fulfillmentClient` prop → `isFulfillment` boolean gates all forks
- Single demand textarea (no supply textarea)
- `canGenerate` only requires demand draft
- `handleGenerate` calls fulfillment engine with demandKey dedup
- `handleSend` sends demand-only, dedup by demand email, `introSource: 'ai-v2-fulfillment'`
- Reference selector shows demand company only (not D × S)
- localStorage keys have `_ff` suffix (no collision with two-sided drafts)

### SendPage (`SendPage.tsx`)
- Constructs `FulfillmentClient` when `economicSide === 'supply'`
- Threads prop to `<ComposePanel>`

---

## What's NOT Built Yet

### Run Detail Page — Fulfillment-Aware View
**Full spec:** `docs/FULFILLMENT_RUN_DETAIL_SPEC.md`
- Client context bar (persistent, expandable profile)
- Flat contact list deduped by demandKey (not grouped pairs)
- Detail pane: demand card + "Why Relevant" + demand-only enrichment (no supply card)
- Single file change: `RunDetailPageV2.tsx` — all forks gated by `isFulfillment`

### Enrichment Gate — Demand-Only
Currently enrichment runs on both sides. In fulfillment mode:
- Supply enrichment is unnecessary (you already have client contact info)
- Only demand-side enrichment matters (need their email to send outreach)
- The enrichment UI should reflect this (don't show supply enrichment progress)

### Send Safety Layer — Pre-Send Gate + Audit Ledger
**Full spec:** `docs/SEND_SAFETY_SPEC.md`
- `contact_send_ledger` table — every send attempt (allowed, blocked, failed) gets a row
- `try_reserve_send()` RPC — 7 rules checked atomically (idempotency, active conversation, declined 180d, same-client 30d, cross-client 90d, domain throttle 24h, daily cap 200)
- `confirm_send()` / `fail_send()` RPCs — post-Instantly-API status transitions
- Three-state lifecycle: `reserved` → `sent` | `failed` (failed doesn't burn cooldown)
- Pre-send preview UX (dry-run check before operator commits)
- New file: `src/station/intro/sendSafety.ts` — client-side helpers
- New migration: `supabase/migrations/20260304200000_contact_send_ledger.sql`

### economicSide = 'demand' (Client IS the demand)
The reverse case: client paid as demand, targets are supply contacts. Same architecture, everything flipped. Not built because no use case yet, but `isFulfillment` and `economicSide` already support it structurally.

---

## Key Files

| File | Role |
|------|------|
| `src/types/station.ts` | `FulfillmentClient`, `ClientProfile`, `OverlaySpec` types |
| `src/station/intro/composeEngine.ts` | 4 fulfillment functions (additive) |
| `src/station/intro/context.ts` | `getDemandEnrichedPairs()` |
| `src/station/intro/components/ComposePanel.tsx` | 7 behavioral forks gated by `isFulfillment` |
| `src/station/pages/SendPage.tsx` | Constructs + threads `fulfillmentClient` |
| `src/station/lib/applyOverlayV2.ts` | Overlay filter (not fulfillment-specific but drives what matches survive) |
| `src/station/pages/RunDetailPageV2.tsx` | Run detail view — needs fulfillment-aware UX (NOT BUILT) |
| `src/station/intro/sendSafety.ts` | `buildSendId()`, `reserveSend()`, `confirmSend()`, `failSend()` (NOT BUILT) |
| `docs/SEND_SAFETY_SPEC.md` | Full send safety spec — 7 rules, RPCs, migration, UX |
| `docs/FULFILLMENT_RUN_DETAIL_SPEC.md` | Full run detail fulfillment view spec |

---

## Anti-Patterns (Don't Do This)

1. **Don't create a separate fulfillment pipeline.** The V5 pipeline is the same. Only the UI layer diverges.
2. **Don't add a fulfillment toggle.** The prop `fulfillmentClient` is the toggle. Present = fulfillment. Absent = market.
3. **Don't send supply intros in fulfillment mode.** The client paid. They don't get cold emails.
4. **Don't expose client name in AI prompts.** Profile fields yes, company name never.
5. **Don't skip dedup layers.** All three are required. Without any one, the user experience or deliverability breaks.
6. **Don't build "fulfillment" as a separate app/route.** It's the same Station, same runs, same compose — just gated by one boolean.
7. **Don't check cooldowns in app code only.** The DB is the guardrail. App code is UX. Two tabs, two workers, two runs all bypass app-level checks. `try_reserve_send()` is atomic.
8. **Don't count reserved rows as "sent" for cooldowns.** Only `status = 'sent'` rows count. A failed API call must not burn the cooldown — the operator needs to retry.
9. **Don't dedup by email + side.** Global email dedup. Same person as demand in run A, supply in run B = still the same human. Humans don't care which side they were.
