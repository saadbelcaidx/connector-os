# Connector OS Architecture (Canonical)

> This document is the source of truth. If code doesn't match this, the code is wrong.

---

## Core Principle

**Ranking > Blocking. The market decides.**

We show confidence tiers, not gates. Users send to all tiers. Replies tell us what works.

---

## The Pipeline

```
Load → Match → Enrich → Send → Reply → Learn
                                  ↑________|
                              (behavioral feedback)
```

That's it. No speculation. No prediction. No "intelligence" that guesses.

---

## File Ownership

| Responsibility | File | Notes |
|----------------|------|-------|
| **Orchestration** | `src/Flow.tsx` | The ONLY UI engine. No other engines exist. |
| **Matching** | `src/matching/index.ts` | ALL matching logic lives here. |
| **Intro Composition** | `src/matching/Composer.ts` | Builds intros from edges + context. |
| **Edge Detection** | `src/matching/EdgeDetector.ts` | Detects signal type (HIRING, FUNDING, etc.) |
| **Enrichment Routing** | `src/enrichment/router.ts` | Routes to Apollo/Anymail/ConnectorAgent. |
| **Sending** | `src/services/senders/` | Instantly, Plusvibe adapters. |
| **Learning** | `src/services/MatchEventsService.ts` | Logs outcomes for behavioral learning. |

---

## What Does NOT Exist

- **No background workers.** Everything runs in the user's session.
- **No gating that blocks sending.** We rank, we don't block.
- **No speculative intelligence.** We removed SignalIntelligence, SignalQualityScorer, PredictionService.
- **No "smart" matching heuristics.** Matching is category alignment + signal detection.
- **No multiple engines.** MatchingEngine.tsx, FlowEngine.tsx are deleted. Only Flow.tsx.

---

## Confidence Tiers (Display Only)

| Tier | Meaning | Action |
|------|---------|--------|
| Strong | High alignment + clear signal | Send first |
| Good | Decent alignment | Send |
| Open | Exploratory | Send anyway |

**All tiers are sendable.** The market decides what converts.

---

## Enrichment Model

```
Input → Classify (VERIFY or FIND) → Route to available providers → Return OUTCOME
```

- If email exists → VERIFY only
- If no email → FIND via waterfall (Apollo → Anymail → ConnectorAgent)
- Outcomes are preserved end-to-end (never collapsed to boolean)

---

## Learning Model (Option B)

We log `match_events` with:
- What was sent (demand, supply, edge type)
- What happened (reply received, meeting booked, negative)

Future: Use this data to weight matching. For now, we just collect.

---

## Anti-Patterns (DO NOT REVIVE)

| Pattern | Why It's Wrong |
|---------|----------------|
| Multiple matching engines | Cognitive overhead, no benefit |
| Background workers | Complexity without user visibility |
| Speculative scoring | Guessing doesn't beat market feedback |
| Gating sends based on score | Blocks learning, removes user agency |
| "Smart" provider selection | Just waterfall through what's configured |

---

## For Future Claude

If you're reading this and thinking about adding:
- A new "intelligence" service → **Don't.** Log outcomes instead.
- A background job → **Don't.** Run it in the user's session.
- A gate that blocks low-confidence sends → **Don't.** Rank and let them send.
- A new matching engine → **Don't.** Extend `src/matching/index.ts`.

**The system learns from replies, not speculation.**

---

## Change Log

- **Jan 2025**: Removed ~12,000 lines of dead code (MatchingEngine, FlowEngine, speculative services)
- **Jan 2025**: Established behavioral learning via `match_events` table
- **Jan 2025**: Locked architecture in this document
