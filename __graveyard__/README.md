# This directory intentionally does not exist.

Dead code is deleted, not archived.

If you're looking for old "signal intelligence", "pressure prediction", or "speculation" logic — it was removed on purpose after v1 shipped.

**Connector OS now learns from replies, not speculation.**

## What was removed (Jan 2025)

### Speculative Intelligence
- `SignalIntelligence.ts` — AI-based signal analysis (replaced by behavioral learning)
- `SignalQualityScorer.ts` — Heuristic scoring (replaced by match_events feedback)
- `PredictionService.ts` — Speculative predictions (never used)
- `revenueBias.ts` — Revenue prediction (never used)

### Legacy Matching
- `MatchingEngine.tsx` — Old UI (replaced by Flow.tsx)
- `FlowEngine.tsx` — Intermediate attempt (replaced by Flow.tsx)
- `Matcher.ts`, `Gate.ts`, `pipeline.ts` — Old matching logic (replaced by matching/index.ts)

### Unused Services
- Various "pilot", "pressure", "intelligence" services that encoded old mental models

## Why this matters

Removing dead code:
1. Prevents future contributors from rebuilding dead ideas
2. Reduces AI hallucination surface (Claude won't reference dead patterns)
3. Establishes doctrine: **learning > guessing**

## The new model

```
Signal → Match → Enrich → Send → Reply → Learn
                                    ↑__________|
                                  (behavioral feedback)
```

Instead of predicting what works, we observe what works.
