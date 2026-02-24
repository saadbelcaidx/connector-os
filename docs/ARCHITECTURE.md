# ARCHITECTURE.md — Connector OS System Architecture

> This document is the source of truth. If code doesn't match this, the code is wrong.

---

## System Overview

Connector OS is a market interpretation engine that matches demand (companies with needs) to supply (providers who fulfill those needs). The operator controls timing and routing.

**Core Principle:** Ranking > Blocking. The market decides. We show confidence tiers, not gates.

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS (dark mode) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Email API | Connector Agent (Railway, api.connector-os.com) |
| Enrichment | Apollo (primary), Anymail Finder (fallback) |
| Outreach | Instantly.ai |
| Data Sources | Apify datasets, Prebuilt Markets (Instantly SuperSearch) |
| Hosting | Vercel (frontend), Railway (Connector Agent), Supabase (edge functions) |
| AI | Azure OpenAI (primary), OpenAI, Anthropic |

### Domains
| Domain | Points to |
|--------|-----------|
| app.connector-os.com | Vercel (canonical) |
| connector-os.com | Vercel (alias) |
| www.connector-os.com | Vercel (alias) |
| api.connector-os.com | Railway (Connector Agent backend) |

---

## Current Pipeline (Production — Flow Engine)

```
Load → Match → Enrich → Send → Reply → Learn
                                  |________|
                              (behavioral feedback)
```

### File Ownership
| Responsibility | File | Notes |
|----------------|------|-------|
| **Orchestration** | `src/Flow.tsx` | The ONLY UI engine. No other engines exist. |
| **Matching** | `src/matching/index.ts` | ALL matching logic lives here. |
| **Intro Composition** | `src/matching/Composer.ts` | Builds intros from edges + context. |
| **Edge Detection** | `src/matching/EdgeDetector.ts` | Detects signal type (HIRING, FUNDING, etc.) |
| **Enrichment Routing** | `src/enrichment/router.ts` | Routes to Apollo/Anymail/ConnectorAgent. |
| **Sending** | `src/services/senders/` | Instantly, Plusvibe adapters. |
| **Learning** | `src/services/MatchEventsService.ts` | Logs outcomes for behavioral learning. |

### What Does NOT Exist (in production)
- No background workers. Everything runs in the user's session.
- No gating that blocks sending. We rank, we don't block.
- No speculative intelligence. Removed SignalIntelligence, SignalQualityScorer, PredictionService.
- No multiple engines. Only Flow.tsx.

---

## Target Pipeline (Station + I Layer)

```
Any Input (CSV, Markets, scraper, API)
    |
raw_records (untrusted, append-only)
    |
DMCB normalize() — AI synthesis + deterministic guards
    |
canonical Signals + Parties (trusted)
    |
I Layer synthesize intent → embed synthesized text
    |
MCP evaluate pairs → Evaluation objects
    |
Station Queue (operator reviews)
    |
Commitment controls priority → Route introductions → Track outcomes
```

**Key invariant:** Nothing raw touches MCP. Only I Layer canonical intent objects enter evaluation.

---

## Frontend Routes
| Route | Component | Access |
|-------|-----------|--------|
| `/` | Landing.tsx | Public |
| `/launcher` | Launcher.tsx | Public (no auth wall) |
| `/flow` | Flow.tsx | Public (active matching engine) |
| `/hub` | ConnectorHub.tsx | SSM-gated |
| `/msg-sim` | ReplyBrainV1.tsx | SSM-gated (3 free trials) |
| `/settings` | Settings.tsx | Public |
| `/setup` | OnboardingWizard.tsx | Public |
| `/library` | Library.tsx | Public |
| `/connector-agent` | ConnectorAgent.tsx | Feature-flagged |
| `/operator/ssm-access` | SSMAccessDashboard.tsx | Operator only |

### Key Frontend Files
| File | Purpose | Status |
|------|---------|--------|
| `src/Flow.tsx` | Active matching engine (Load → Match → Enrich → Send) | ACTIVE (~1,139 lines) |
| `src/PrebuiltMarkets.tsx` | Markets UI (Instantly SuperSearch) | Active |
| `src/services/AIService.ts` | AI calls (OpenAI, Azure, Anthropic) | Active |
| `src/services/AIRequestQueue.ts` | Retry handling (SINGLE layer) | Active |
| `src/copy/introDoctrine.ts` | Deterministic intro templates | Active |
| `src/matching/Composer.ts` | Intro text generation | Active |
| `src/constants/marketPresets.ts` | Pack definitions (5 markets) | Active |
| `src/services/MarketsService.ts` | Markets search/enrich API | Active |
| `src/MatchingEngineV3.tsx` | LEGACY (8,508 lines, NOT routed) | Legacy |

---

## Edge Functions (Supabase)
| Function | Purpose |
|----------|---------|
| `ai-proxy` | Routes AI calls (Azure/OpenAI/Anthropic) — fixes CORS |
| `apollo-enrichment` | Apollo API proxy |
| `anymail-finder` | Anymail Finder API proxy |
| `instantly-proxy` | Instantly.ai proxy |
| `send-magic-link` | Branded emails (Resend) |
| `ssm-access` | Dashboard API |
| `ssm-request` | Access requests |
| `ssm-member-joined` | Zapier webhook |
| `reply-brain` | 7-layer reply system (Psyche) |
| `vsl-redirect` | VSL click tracking |
| `followup-dispatcher` | Hourly cron for VSL follow-ups |

---

## Connector Agent Backend (Railway)
| Endpoint | Purpose |
|----------|---------|
| `POST /find` | Find email by name + domain |
| `POST /verify` | Verify email deliverability |
| `POST /find-bulk` | Bulk email finding |
| `POST /verify-bulk` | Bulk email verification (hedged requests + circuit breaker) |
| `POST /markets/search` | Instantly SuperSearch proxy |
| `POST /markets/company` | Single company enrichment (shared JWT, server-side) |
| `POST /markets/enrich-batch` | Batch company enrichment |

---

## Azure OpenAI Configuration (Frozen)
| Parameter | Value |
|-----------|-------|
| Endpoint | `https://outreachking.openai.azure.com` |
| Chat deployment | `gpt-4o` |
| Chat API version | `2025-01-01-preview` |
| Embedding deployment | `text-embedding-3-small-2` (Standard regional) |
| Embedding API version | `2024-02-01` |
| Other deployments | gpt-5-nano, gpt-5-nano-2, gpt-4.1-mini, gpt-5-mini |

**CRITICAL:** Global Standard deployments return 404 on regional endpoints. Must use Standard (regional) deployment type for embeddings.

---

## Database Tables
| Table | Purpose |
|-------|---------|
| `operator_settings` | Per-user settings (API keys, datasets, filters) |
| `ssm_members` | Verified SSM community members |
| `ssm_access` | Access requests + approvals |
| `usage_logs` | API usage tracking |
| `user_campaigns` | Instantly campaign mappings |
| `signal_intelligence` | Cached AI analysis of signals |
| `vsl_events` | VSL click/watch tracking |
| `pending_followups` | Scheduled VSL follow-ups |
| `drift_alerts` | Reply brain drift detection |
| `reply_events` | Reply telemetry + conversion tracking |
| `match_events` | Behavioral learning (outcomes per match) |

---

## Prebuilt Markets (Instantly SuperSearch)

### How It Works
1. `POST /markets/search` — SuperSearch with operator's Instantly API key (50 leads/call, free)
2. `POST /markets/company/{id}` — Company enrichment via shared workspace JWT (server-side only)
3. Company data: description, funding, news, tech stack, employees, locations, jobs

### Key Constraints
- 50 leads per call (no pagination — deterministic)
- jobListingFilter is case-sensitive
- Same filters = same 50 leads
- Title-splitting strategy for >50 unique leads
- Daily cap: 5,000 leads/day per API key (our limit)
- JWT for company endpoint never leaves server

---

## Enrichment Model
```
Input → Classify (VERIFY or FIND) → Route to available providers → Return OUTCOME
```
- If email exists → VERIFY only
- If no email → FIND via waterfall (Apollo → Anymail → ConnectorAgent)
- Outcomes preserved end-to-end (never collapsed to boolean)

---

## Deployment Checklist

### Frontend
```
1. git status --porcelain (must be empty)
2. Verify ALL imports resolve to tracked files
3. npm run build
4. npx vercel --prod --yes
5. npx vercel alias <URL> app.connector-os.com
6. npx vercel alias <URL> connector-os.com
7. npx vercel alias <URL> www.connector-os.com
```

### Edge Functions
```
npx supabase functions deploy <function-name>
```

### Connector Agent
Push to GitHub → Railway auto-deploys.

---

## Anti-Patterns (DO NOT REVIVE)

| Pattern | Why It's Wrong |
|---------|----------------|
| Multiple matching engines | Cognitive overhead, no benefit |
| Background workers | Complexity without user visibility |
| Speculative scoring | Guessing doesn't beat market feedback |
| Gating sends based on score | Blocks learning, removes user agency |
| Embedding raw company data | Noise-to-noise, avg 30% similarity. Embed synthesized intent. |
| Adding retry logic in AI call functions | Retries ONLY in AIRequestQueue |

---

## Design Language
- Dark mode only (#09090b, #0A0A0A)
- Inter font, tight letter-spacing (-0.02em)
- Subtle borders (white/[0.06])
- Emerald success, red errors, blue interactive
- Linear/Vercel/Stripe aesthetic
- White opacity hierarchy: /90, /70, /50, /40, /30
- No emojis unless requested

---

## Change Log
- **Jan 2025**: Removed ~12,000 lines of dead code. Locked architecture.
- **Jan 2025**: Established behavioral learning via `match_events` table.
- **Feb 2025**: Connector Agent bulk performance (hedged requests, circuit breaker, 25 concurrency).
- **Feb 2025**: I Layer breakthrough validated — synthesis embedding avg 49% vs raw 30%.
- **Feb 2025**: Azure embedding fixed — Standard regional deployment, not Global Standard.
- **Feb 2025**: Documentation overhaul — CLAUDE_NEW.md, PRODUCT.md, ARCHITECTURE.md, SESSION_LOG.md.
