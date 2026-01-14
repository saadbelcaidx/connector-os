# COS (Connector Overlap Statement) — System Design Document

**Date:** January 2025
**Status:** In Progress
**Author:** Claude + Saad

---

## Executive Summary

The intro generation system produces garbage output like:
```
"I connect teams in this space working closely with companies"
```

This document explains why, and the simple fix needed.

---

## The Connector Model (8 Modes)

The system supports 8 connector modes, each representing a different business vertical:

| Mode | Demand (who has need) | Supply (who fulfills) |
|------|----------------------|----------------------|
| `recruiting` | Companies hiring | Recruiters/staffing |
| `biotech_licensing` | Biotech companies | Pharma BD teams |
| `wealth_management` | HNW individuals | Wealth advisors |
| `real_estate_capital` | RE developers | Capital partners |
| `logistics` | Shippers/brands | Logistics operators |
| `crypto` | Crypto platforms | Fintech product teams |
| `enterprise_partnerships` | Enterprise companies | Integration partners |
| `custom` | User-defined | User-defined |

**The modes are valuable and correct.** The problem is not the mode system.

---

## What is COS?

COS (Connector Overlap Statement) is the relational copy that explains WHY a match makes sense:

```
"I connect [supplyRole] working closely with [demandValue]."
```

Examples:
- Crypto: "I connect fintech product teams working closely with crypto platforms."
- Biotech: "I connect pharma BD teams working closely with clinical-stage biotechs."
- Recruiting: "I connect hiring teams working closely with companies scaling teams."

---

## The Data Flow

```
User selects MODE (e.g., crypto)
         ↓
Match engine runs with MODE
         ↓
buildNarrative() calls:
  - getModeDemandValue(demand, mode) → "crypto platforms"
  - getModeSupplyRole(supply, mode)  → ??? (often null)
         ↓
COS built: "I connect [supplyRole] working closely with [demandValue]"
         ↓
Intro generated using COS
```

---

## The Root Cause

### Problem: Supply data doesn't contain mode vocabulary

When user uploads supply dataset (e.g., recruiters who work with crypto companies):
- Their titles say: "Technical Recruiter", "Talent Acquisition"
- NOT: "crypto", "blockchain", "fintech", "web3"

So `getModeSupplyRole()` scans for crypto tokens, finds none, returns `null`.

### Problem: Crypto mode has `null` fallback

In `buyerSellerTypes.ts`:

```javascript
SUPPLY_ROLE_VOCAB = {
  crypto: {
    tokens: [...],
    fallback: null,  // ← THIS IS THE BUG
  },
  // Other modes have real fallbacks
  recruiting: { fallback: 'hiring teams' },
  biotech: { fallback: 'pharma BD teams' },
}
```

We made crypto "strict" — if no token matches, return nothing. But this is wrong.

### Problem: Garbage fallback propagates

When `supplyRole` is null:
1. `buildNarrative()` sets `overlap = undefined`
2. Various fallbacks kick in with "teams in this space"
3. AI sees garbage, generates garbage
4. Output: "teams in this space working closely with companies"

---

## The Simple Fix

### Fix 1: Give crypto mode a real fallback

```javascript
crypto: {
  tokens: [...],
  fallback: 'teams building in crypto',  // Not null
}
```

### Fix 2: Trust the user's mode selection

If user selected crypto mode and uploaded supply data, TRUST that supply is crypto-relevant. Don't require supply data to contain crypto keywords.

### Fix 3: Mode fallbacks should be good copy

Every mode needs a fallback that sounds professional:

| Mode | Supply Fallback (GOOD) |
|------|------------------------|
| recruiting | "hiring teams" |
| biotech_licensing | "pharma BD teams" |
| wealth_management | "HNW individuals" |
| real_estate_capital | "RE developers" |
| logistics | "shippers" |
| crypto | "teams building in crypto" ← FIX |
| enterprise_partnerships | "enterprise teams" |
| custom | "teams in this space" |

---

## Files Involved

| File | Purpose |
|------|---------|
| `src/matching/buyerSellerTypes.ts` | **Single source of truth** for mode vocabulary |
| `src/matching/index.ts` | `buildNarrative()` builds COS from vocabulary |
| `src/services/IntroGenerator.ts` | Generates intros, has Gate 2 to skip AI when no COS |
| `src/copy/introDoctrine.ts` | Canonical templates and AI prompts |

---

## Code Changes Needed

### 1. Update SUPPLY_ROLE_VOCAB in buyerSellerTypes.ts

```javascript
crypto: {
  tokens: [
    { pattern: /crypto|blockchain|web3|defi/, role: 'crypto platforms' },
    { pattern: /fintech|payment|acquiring|merchant/, role: 'fintech product teams' },
    { pattern: /exchange|trading/, role: 'exchanges' },
    { pattern: /on.?ramp|off.?ramp|fiat/, role: 'on/off-ramp infrastructure' },
    { pattern: /compliance|kyc|aml|fraud/, role: 'payment & compliance infrastructure' },
    { pattern: /product|engineering/, role: 'fintech product teams' },
  ],
  fallback: 'teams building in crypto',  // ← CHANGE FROM null
},
```

### 2. Remove remaining "teams in this space" garbage

Search for and eliminate all instances of "teams in this space" as a fallback:
- `buyerSellerTypes.ts` line 554 (custom mode fallback)
- `buyerSellerTypes.ts` line 698 (no-mode fallback)

Replace with mode-appropriate copy or empty string (to trigger deterministic template).

---

## Design Principles (For Future Work)

### 1. Trust user mode selection
If user picks crypto mode, assume their data is crypto-relevant. Don't second-guess.

### 2. Mode fallbacks must be good copy
Every mode needs a professional-sounding fallback. No "teams in this space" garbage.

### 3. Deterministic > AI for core copy
The "[X] with [Y]" part of intros should be deterministic from mode vocabulary, not AI-generated.

### 4. AI enhances, doesn't invent
AI should only be used when we have good COS. If COS is empty, use deterministic template.

### 5. Single source of truth
All mode vocabulary lives in `buyerSellerTypes.ts`. Nothing else defines mode-specific language.

---

## What We Tried (Session History)

1. **Consolidated vocabulary** into `buyerSellerTypes.ts` — GOOD, keep this
2. **Added Gate 2** to skip AI when no COS — GOOD, keep this
3. **Injected COS into AI prompt** — GOOD for when COS exists
4. **Made crypto strict (null fallback)** — BAD, this caused the bug

---

## Expected Output After Fix

**Crypto mode intro:**
```
"Hey [Name] — quick relevance check. I'm connecting a small number of
web3 projects with teams building in crypto. [Company] came up as a
clean fit. I can make the intro if it's useful — if not, no worries."
```

**NOT:**
```
"I connect teams in this space working closely with companies"
```

---

## Questions for Saad

1. Is "teams building in crypto" the right fallback phrase for crypto mode supply?
2. Should custom mode have a real fallback or require user to specify?
3. Any other modes where the fallback copy sounds wrong?

---

## Next Steps

1. [ ] Update crypto fallback in `SUPPLY_ROLE_VOCAB`
2. [ ] Audit all fallbacks across 8 modes
3. [ ] Test with real crypto dataset
4. [ ] Remove any remaining "teams in this space" garbage
5. [ ] Deploy and verify

---

*This document is the source of truth for the COS system design. Future Claude sessions should read this first.*
