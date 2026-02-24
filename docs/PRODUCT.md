# PRODUCT.md — Connector OS Product Doctrine

## One Sentence
Raw comes in → I Layer synthesizes intent → MCP evaluates pairs → Commitment controls priority → Introductions route → Outcomes feed back.

---

## The I Layer (Intent Synthesis) — Canonical Doctrine

**Name:** I Layer (Intent Synthesis)
**Purpose:** Turn garbage inputs into canonical intent objects that the system can evaluate, route, and fulfill — without brittle schema assumptions.

### The Breakthrough (Feb 2025)
Embedding raw company metadata (industry, titles, descriptions) gives ~30% avg similarity — noise-to-noise.
Embedding AI-synthesized intent statements (NEED for demand, CAPABILITY for supply) gives ~49% avg with 81 pairs above 60%.

**Matching is not a database problem. Matching is a synthesis problem.**

The system now embeds WHY, not WHAT.
- Old: "Do these companies look similar?" (entity similarity)
- New: "Does one side solve the other side's moment?" (intent compatibility)

### The Invariant
```
Embedding Input = AI Interpretation
NOT Source Data
```
Never embed raw records again. Raw data is ingestion material only.

### AI Role Separation
| Layer | Responsibility |
|-------|---------------|
| Synthesis AI | Convert signals → needs/capabilities |
| Vector layer | Retrieve candidates |
| MCP reasoning | Explain + score match |
| Infrastructure | Route introductions |

**AI proposes. Infrastructure disposes.**

---

## The 6 Primitives (No New Nouns)

| Primitive | Definition |
|-----------|-----------|
| **Signal** | A detected unit of intent (demand or supply) |
| **Party** | A company/actor (either side — system stays neutral) |
| **Evaluation** | AI's structured match assessment (reasoning object) |
| **Commitment** | Prepaid priority access + credits in a segment window |
| **Introduction** | The routed connection (unit of fulfillment) |
| **Outcome** | Result attached to an introduction (reply, meeting, no response) |

No "lead." No "campaign" entity. No "match" entity outside Evaluation.

---

## The Pipeline (End-to-End)

### Step A — Ingest (Accept Garbage)
Inputs: CSV, prebuilt markets, scraper exports, pasted lists, API, JSON, garbage spreadsheets.
Rule: Input schema is UNTRUSTED.
Output: raw_records[] (stored, append-only)

### Step B — I Layer (Intent Synthesis)
Convert each raw record into canonical meaning, not fields.

I Layer outputs 3 things per record:
1. **PartyStub** — best-effort identity (domain/company)
2. **IntentCard** — structured semantic meaning
3. **Canonical Signal** — type/segment/freshness/confidence

**IntentCard format (frozen):**
```
who: what this party is
wants: what they are trying to do (or could do)
why_now: what signal implies timing
constraints: geo/size/industry/role boundaries (if inferable)
proof: what in the raw data caused this conclusion
confidence: 0-1
```

Hard rule: If record cannot produce (identity + intent) at minimum viability → quarantine, not pass downstream.

### Step C — Evaluate (MCP)
Input: (Demand Signal, Supply Party) or vice versa
Output:
```
readiness: READY | WARMING | NOT_YET
confidence: 0-1
whyMatch: 2-4 lines
risks[]: short bullets
suggested_framing: 1-2 lines (optional)
status: proposed → reviewed → approved → activated → consumed → scored
```
Rule: MCP proposes. Infrastructure disposes. MCP does not route or change state directly.

### Step D — Commit (Payment + Priority)
Commitment fields (frozen):
- segment, tier (standard/priority)
- credits_total, credits_remaining
- window_start / window_end
- status (reserved/active/consuming/exhausted/expired)

Observers see anonymized motion. Committed parties unlock routing priority.

### Step E — Route (Fulfillment)
Introduction generated only when:
- evaluation.confidence >= threshold
- operator approved
- at least one relevant commitment active
- credits_remaining > 0
- rate limits pass

Status: drafted → sent → acknowledged → outcome_pending → closed

### Step F — Outcome (Feedback Loop)
Outcomes: replied, meeting booked, declined, no response, stale/invalid (credit return).
Feeds future evaluations and synthesis calibration.

---

## DMCB (Dynamic Model Canonical Builder)

### Purpose
Normalize garbage input into canonical intent objects before MCP evaluation.

### Three-Layer Ingestion
1. **Raw Intake (Untrusted)** — Accept anything, store as raw_records, zero assumptions
2. **DMCB Normalization** — AI semantic extraction + deterministic minimum viability rules
3. **Canonical Schema (Trusted)** — Only this enters Station: signals, parties, evaluations, introductions, outcomes

### Minimum Viable Signal (Hard Rule)
A signal exists ONLY if: company identity exists AND intent inferred AND segment classified.
If missing → reject. No exceptions.

### Handling Bad Data
| User Upload | System Response |
|-------------|----------------|
| Missing fields | AI infers |
| Weird columns | Ignored |
| Bad titles | Classified |
| No industry | Inferred |
| Junk rows | Rejected |
| Low confidence | Quarantined |

Operator sees: "34 valid signals created, 12 quarantined (missing identity/intent)"

---

## Operator Journey (12 Steps)

0. **Enter system** — pick market, see motion, "oh this is real"
1. **Load signals** — click load market, demand + supply appear, zero research
2. **AI matching** — MCP proposes evaluations (why match, timing, risk). Operator sees: READY / WARMING / NOT YET
3. **Review queue** — scroll matches like TikTok feed, gut check: approve or skip
4. **Intro generated** — 3 style options (volume signal, access signal, competitive edge)
5. **Outreach both sides** — demand + supply conversations happen simultaneously
6. **Intent appears** — reply: "this sounds interesting" = conversion trigger
7. **Call → commitment** — "you're buying priority access to active opportunities"
8. **System re-aims** — AI focuses evaluation toward committed client automatically
9. **Fulfillment** — evaluation approved + committed + credits → click Route → intro sent
10. **Track outcomes** — sent, replied, meeting booked, declined, no response
11. **Credits consumed** — each intro burns 1 credit, client sees pipeline moving
12. **Renewal** — "2 credits left, 4 approved matches waiting" → renews automatically

---

## Credits System

1 credit = 1 routed introduction. Nothing more.

**Not credits for:** viewing signals, seeing evaluations, talking to operator, reviewing matches, AI proposing matches.
**Credit for:** you send introduction = YES.

Credits are invisible infrastructure (like Stripe charges per transaction, AWS meters compute, Uber meters rides).

---

## Connector vs Lead Gen

| Dimension | Lead Gen | Connector |
|-----------|----------|-----------|
| Value source | Outreach labor | Market timing |
| Relationship | Outsourced SDR | Neutral third party |
| Meeting source | Probability (volume) | Alignment (precision) |
| Economics | Linear effort scaling | Market liquidity scaling |
| Risk | You carry outcome risk | Market carries risk |
| Feeling | Grinding, chasing | Observing, routing |
| Core mechanic | Identity selling | Context alignment |

**Lead gen creates conversations. Connector reveals conversations that were already about to happen.**

---

## Fulfillment Loop

```
Demand discovery  <-->  Supply discovery
        |                     |
            Shared signal pool
                    |
               Evaluation
                    |
                Routing
```

Not fulfilling campaigns. Maintaining a living market.

### Market Pivot Protocol (When Both Sides Quiet)
1. Pause weak segment
2. Keep existing pool stored
3. Load new signal pack
4. AI evaluates immediately against existing supply
5. Routing resumes
6. Old signals remain usable later

Connector fulfillment is market management, not service delivery.

---

## Anti-Churn System ("Next Money Action" Engine)

### Root Cause of Churn
Members churn when uncertainty > perceived progress. They leave because they don't know what to do next, not because features are broken.

| Member says | Actually means |
|-------------|---------------|
| "enrichment not working" | I lost momentum |
| "only 5 matches" | I think this won't work |
| "AI intro bad" | I don't trust the system |
| "no replies" | I don't know what action to take |
| "platform confusing" | I don't see progress |

### The Fix
Every screen answers: "What makes you money next?"

1. **Money Path** — 5 visible steps only: Load Market → Review Opportunities → Send Introductions → Track Replies → Close Client
2. **Automatic Failure Recovery** — every failure auto-resolves into an instruction, not an error
3. **Next Money Action panel** — always visible, system decides what operator does next
4. **No technical vocabulary** — members see: Signals, Opportunities, Introductions, Replies, Revenue
5. **Silent guardrails** — monitor health, auto-suggest market pivots, auto-improve prompts

### UI Doctrine (Frozen)
- Fewer surfaces, consistent components
- No native browser controls
- Typography + spacing heavy, calm
- Truncation always (no raw headlines)
- State persistence always (no "everything lost")
- Never kick operator out of Station to fix keys/settings — use overlay
- Errors become diagnostic objects, not UI blockers
