# CONNECTOR OS
## Architecture Snapshot — February 20, 2026
### Market Ontology Binding Doctrine

---

## 1. Core Principle

Ontology must live on the record — never in routing.

Side, market, and pack identity are data properties, not UI decisions.

Matching, Flow, and Intro generation must rely only on record ontology — never storage location.

## 2. Canonical Record Structure

**NormalizedRecord** (`src/schemas/index.ts`)

```typescript
readonly side?: 'demand' | 'supply';
readonly market?: string;
readonly packId?: string;
readonly origin?: 'markets' | 'csv';
```

**Rules:**

- Ontology fields are write-once.
- They are system-derived only.
- They must never be mutated after ingestion.
- Missing ontology must not break legacy flows.
- Inverted ontology must never generate intros.

## 3. Ingestion Rule (Pack → Record)

**File:** `src/PrebuiltMarkets.tsx`

Stamp ontology after normalization, before storage:

```typescript
const stamped = enrichedRecords.map(r => ({
  ...r,
  side: r.side ?? side,
  market: r.market ?? derivedMarket,
  packId: r.packId ?? derivedPackId,
  origin: r.origin ?? 'markets',
}));
```

Never overwrite existing ontology.

## 4. Flow Guardrails

**File:** `src/Flow.tsx`

**Side Invariant**

Skip pair only if ontology is present and inverted:

```typescript
if ((dSide && dSide !== 'demand') || (sSide && sSide !== 'supply')) {
  continue;
}
```

**Market Invariant**

```typescript
if (d.market && s.market && d.market !== s.market) {
  continue;
}
```

**Diagnostics**

Warn loudly if ontology missing:

```typescript
console.warn('[ONTOLOGY_WARNING]')
```

## 5. Prompt Doctrine

**File:** `src/services/IntroAI.ts`

AI is not allowed to infer structure.

**Mandatory prompt rules:**

- AI must not infer supply capability from description.
- Use ONLY `supply.capability`.
- Interpret expansion/facilities signals as growth unless supply is facilities.
- Never rewrite `edge.evidence` globally.
- AI formats intent — it does not decide roles.

## 6. What We Do NOT Touch

This architecture does not modify:

- Matching logic
- Scoring
- Enrichment
- Edge detection
- Intro templates
- Routing engine
- UI

Ontology binding is upstream identity correction — not behavior redesign.

## 7. What Makes a New Market Valid

When adding a new market (e.g., fintech, law, SaaS):

You must copy this exact pattern:

1. Define packs (demand/supply).
2. Stamp ontology at ingestion.
3. Preserve write-once fields.
4. Use same Flow invariants.
5. Use same prompt doctrine.

No deviations.

If a new market requires special casing in prompts, that is a signal ontology was not modeled correctly.

## 8. Anti-Patterns (Forbidden)

Do NOT:

- Use localStorage key to infer side.
- Add role-detection heuristics.
- Add AI classification layers.
- Rewrite signals globally.
- Infer capability from descriptions.
- Allow ontology mutation during merge.

If a fix requires any of the above, architecture is being violated.

## 9. Mental Model

Connector OS now operates as:

```
Pack → Ontology → Matching → Edge → Intro Formatting
```

AI is the final renderer — not the decision engine.

---

## Why This Snapshot Matters

This document freezes:

- Ontology binding
- Guardrails
- Prompt constraints
- Identity propagation

Future markets must conform to this layer.

If behavior regresses, compare to this snapshot.

**Never modify this file. Add a new snapshot if architecture changes materially.**
