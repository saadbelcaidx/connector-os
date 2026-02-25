# SESSION_LOG.md — Connector OS Work Log

---

## 2026-02-24 — Phase 34: Station Becomes Primary UI

### Phase Summary (Phases 1–34)

Prior phases (1–33) built the foundation. Phase 34 migrates Station to the primary operator surface. Full phase history below.

---

### Phase 1 — Project Genesis
Initial Connector OS repo, React + Vite + TypeScript + Tailwind scaffold. Dark mode, Supabase auth, basic routing.

### Phase 2 — Auth System
Email/password login, magic links via Resend, `send-magic-link` edge function, `AuthContext`, `PasswordSetupGate`.

### Phase 3 — Settings Architecture
`operator_settings` table, per-user API key storage (Apollo, Anymail, Instantly, AI providers), guest mode via localStorage.

### Phase 4 — Dataset Loading
Apify dataset integration, `SignalsClient.ts`, `SupplySignalsClient.ts`, demand + supply dataset parsing.

### Phase 5 — Matching Engine V1–V3
Category-based matching, signal quality scoring, confidence tiers (A/B/C). `MatchingEngineV3.tsx` (8,508 lines, now LEGACY).

### Phase 6 — Enrichment Pipeline
Apollo primary, Anymail fallback, `enrichment/router.ts`, waterfall routing, outcome preservation.

### Phase 7 — Intro Generation (Deterministic)
`introDoctrine.ts` — 8 connector modes, `composeIntro()` fill-in-the-blank templates. No AI. No retries.

### Phase 8 — Instantly Integration
`InstantlyService.ts`, `instantly-proxy` edge function, demand/supply campaign routing, batch send.

### Phase 9 — SSM Access System
`ssm_members` table, Zapier webhook (`ssm-member-joined`), auto-approve flow, `SSMGate.tsx`, `SSMAccessDashboard`.

### Phase 10 — Landing Page
Linear-inspired dark mode landing at `/`. "The infrastructure for a connector." Badge, hero, sections, CTA → `/launcher`.

### Phase 11 — Library / Playbook
`/library` — public documentation. Philosophy section + System section (User's Manual). Deep linking via `?page=`.

### Phase 12 — Onboarding Wizard
`/setup` — step-by-step configuration. AI required (no "None" option). 4-step flow visualization on completion.

### Phase 13 — Signal Quality Scoring
`SignalQualityScorer.ts` — persistence, density, velocity, stacking. Tier A (70+), B (45–69), C (<45). Liveness gate.

### Phase 14 — Signal Intelligence
`SignalIntelligence.ts` — AI runs once at ingestion, caches `needSummary`/`capabilitySummary`. Match-time uses cached profiles.

### Phase 15 — Anti-Fragile Intros
Intros from signals, not enrichment data. `detectMatchContext()` → `generateDemandIntroAntifragile()`. Fallback chain.

### Phase 16 — Supply Aggregation
Group supply matches by email. 3+ matches → aggregated "deal flow" intro. `groupSupplyByEmail()`, `generateAggregatedSupplyIntro()`.

### Phase 17 — Psyche (Reply Brain)
7-layer Jungian reply system. Animus → Ego → Senex → Shadow → Anima → Magician → Self. Self-correcting loop. `/msg-sim`.

### Phase 18 — VSL Pre-Alignment
Auto-inject Loom video on INTEREST replies. `vsl-redirect`, `vsl-watch-confirm`, `followup-dispatcher` cron. React watch page at `/vsl/watch`.

### Phase 19 — CSV Upload
Settings → Upload CSV → Papa Parse → localStorage. CSV priority over Apify. Same extraction pipeline.

### Phase 20 — Dataset Intelligence
3-layer niche detection: text-based → AI → fallback. 13 niche patterns. AI-generated filters for any niche.

### Phase 21 — Connector Agent
Email finder/verifier API. Express + SQLite on Railway (`api.connector-os.com`). `/find`, `/verify`, `/find-bulk`, `/verify-bulk`. Integrate tab with Make.com/n8n/Zapier docs.

### Phase 22 — Bulk Performance
Hedged requests + provider routing + circuit breaker + layered concurrency. `hedgedVerify.js`, `bulkScheduler.js`. 25 global concurrency, 12s per-item budget.

### Phase 23 — Flow Engine
`Flow.tsx` (1,139 lines) replaces MatchingEngineV3 as active engine. 4-step: Load → Match → Enrich → Send. Linear monochrome design.

### Phase 24 — Edge Function Hardening
All edge functions use CORS headers (`withCors` wrapper). Never return non-200. `mcp-enhance` edge function created.

### Phase 25 — Prebuilt Markets
Instantly SuperSearch integration. `POST /markets/search` (free, 50 leads/call), `POST /markets/company` (shared JWT). `PrebuiltMarkets.tsx`.

### Phase 26 — Market Presets
5 markets defined in `marketPresets.ts`. Pack anatomy: demand packs (economic triggers) + supply packs (monetization roles). Ontology stamped at ingestion.

### Phase 27 — Composer
`matching/Composer.ts` — generates intro text from edges + context. Banned phrases, persona detection, legal suffix stripping, thread integrity.

### Phase 28 — Enrichment Router V2
`enrichment/router.ts` — classify inputs → route to providers → return outcomes. `buildEnrichmentPlan()` in `flow/enrichmentPlan.ts`.

### Phase 29 — Match Events / Behavioral Learning
`MatchEventsService.ts` — logs outcomes per match. `match_events` table. Feeds future evaluation calibration.

### Phase 30 — Documentation Overhaul
Replaced monolithic `CLAUDE.md` with modular docs: `PRODUCT.md`, `ARCHITECTURE.md`, `STATION_DESIGN.md`, `SESSION_LOG.md`.

### Phase 31 — I Layer Validation
Standalone `validate-mcp.js` proved synthesis embedding (avg 49%, 81 pairs >60%) vs raw embedding (avg 30%, 0 pairs >60%). **Matching = synthesis problem.**

### Phase 32 — Azure Embedding Fix
`text-embedding-3-small` (Global Standard) → 404. Created `text-embedding-3-small-2` (Standard regional). Works immediately.

### Phase 33 — Intent Stamp
`IntentStamp` interface added to `NormalizedRecord`. Ontology fields (`side`, `market`, `packId`, `origin`) stamped write-once at ingestion.

### Phase 34 — Station Becomes Primary UI

**Scope:** Routing + entrypoint migration ONLY. No logic changes, no UI redesign, no backend changes.

#### What Was Done

1. **Connector Agent CORS fix** — committed + pushed `connector-agent-backend/src/index.js` (added Vite overflow ports 5174–5179 to CORS whitelist). Commit `d551acf`.

2. **mcp-enhance edge function** — created `supabase/functions/mcp-enhance/index.ts` with CORS headers per Phase 24 rules. All responses return 200.

3. **Station.tsx restored** — recovered 2,823-line `Station.tsx` from `worktree-keygen-v1` branch into keygen-v1 worktree via `git checkout worktree-keygen-v1 -- src/Station.tsx`.

4. **Station dependencies restored** — 3 missing files recovered from `worktree-keygen-v1`:
   - `src/types/station.ts` — Station type definitions (RowPhase, IntroEntry, StationStep, etc.)
   - `src/stores/operatorSession.ts` — Zustand store for operator session state
   - `src/station/ranking.ts` — Match ranking system (rankAllMatches, defaultOverlay)

5. **Zustand installed** — `npm install zustand` (required by `operatorSession.ts`).

6. **Missing marketPresets exports added** — 6 exports appended to `src/constants/marketPresets.ts`:
   - `NEWS_SIGNALS` (25 signal types)
   - `SIGNAL_GROUPS` (6 categories)
   - `EMPLOYEE_COUNT_OPTIONS` (9 ranges)
   - `REVENUE_OPTIONS` (8 ranges)
   - `FUNDING_TYPE_OPTIONS` (16 stages)
   - `INDUSTRY_GROUPS` (15 categories)

7. **App.tsx routing migrated** —
   - `import Station from './Station'`
   - `/` authenticated redirect: `/flow` → `/station`
   - Added `/station` route rendering `<Station />`
   - `/flow` marked as `INTERNAL ENGINE ROUTE — NOT USER ENTRYPOINT`

8. **Dock.tsx updated** — Flow entry replaced with Station (`id: 'station'`, `route: '/station'`).

9. **Launcher.tsx updated** — Flow card replaced with Station card (`title: 'Station'`, `route: '/station'`).

10. **Invalid hook call fixed** — Duplicate React instance error after zustand install. Resolution:
    - Verified single React instance (react@18.3.1, all deduped)
    - Clean install (`rm -rf node_modules && rm package-lock.json && npm install`)
    - Added `resolve: { dedupe: ['react', 'react-dom'] }` to `vite.config.ts`
    - Cleared stale Vite dependency cache (`node_modules/.vite`)

11. **All Station imports verified** — 19/19 imported files confirmed present, all named exports confirmed, both npm packages (papaparse, zustand) installed.

#### Files Modified
| File | Changes |
|------|---------|
| `connector-agent-backend/src/index.js` | CORS whitelist: added ports 5174–5179 (committed + pushed) |
| `supabase/functions/mcp-enhance/index.ts` | NEW — edge function with CORS per Phase 24 |
| `src/Station.tsx` | RESTORED from worktree-keygen-v1 (2,823 lines) |
| `src/types/station.ts` | RESTORED — Station type definitions |
| `src/stores/operatorSession.ts` | RESTORED — Zustand operator session store |
| `src/station/ranking.ts` | RESTORED — Match ranking system |
| `src/App.tsx` | Station import, `/` → `/station` redirect, `/station` route, `/flow` internal |
| `src/Dock.tsx` | Flow → Station entry |
| `src/Launcher.tsx` | Flow → Station card |
| `src/constants/marketPresets.ts` | Added 6 missing exports (NEWS_SIGNALS, SIGNAL_GROUPS, etc.) |
| `vite.config.ts` | Added `resolve: { dedupe: ['react', 'react-dom'] }` |
| `package.json` | Added zustand dependency |

#### Key Decisions
- Station is primary UI surface, Flow is internal engine only
- No logic duplication — Station reads Flow's state
- No UI redesign — Station preserved as-is from keygen-v1 branch
- `/flow` remains accessible for direct navigation (not redirected)

#### Phase 34 Acceptance Criteria
- [x] Visiting `/` opens Station (authenticated redirect)
- [x] Dock has Station entry (no Flow)
- [x] Launcher has Station card (no Flow)
- [x] `/flow` still works if opened directly
- [ ] Existing evaluations appear inside Station (pending runtime verification)
- [ ] Reload returns to Station queue (pending runtime verification)
- [ ] Zero regression in matching/enrichment/send (pending runtime verification)

#### What's Pending
- [ ] Runtime verification of Station rendering without errors
- [ ] Verify evaluations load inside Station
- [ ] Verify Flow engine still works at `/flow`
- [ ] Build Station V1 features: Signal → Evaluation → Approve → Introduction
- [ ] Create MCP evaluation endpoint (POST /evaluate)
- [ ] Create evaluationService.ts
- [ ] Wire I Layer synthesis into ingestion pipeline

---

## 2026-02-24 — Documentation Overhaul + I Layer Validation (Earlier Session)

### What Was Done
1. **Main branch cleaned to production state** — `git restore` on modified files, removed all untracked MCP artifacts (worktrees, MCP_DOCTRINE.md, mcp-evaluate, semantic-match, migration file). Final: `nothing to commit, working tree clean`.

2. **I Layer hypothesis validated** — Created standalone script (`Desktop/validate-mcp.js`) proving synthesis-based embedding dramatically outperforms raw metadata embedding:
   - Raw embedding: avg 30.2%, 0 pairs above 60%
   - Synthesized intent embedding: avg 49.0%, 81 pairs above 60%
   - **Matching is a synthesis problem, not a database problem**

3. **Azure embedding deployment fixed** — `text-embedding-3-small` (Global Standard) returned 404. Created `text-embedding-3-small-2` (Standard regional). Works immediately. Global Standard deployments don't route through regional inference endpoints.

4. **Station.tsx recovered** — Extracted 2,823-line Station.tsx from `worktree-keygen-v1` git branch to `/tmp/station_full.tsx`. Not in main — only exists on that branch.

5. **Documentation created** — 4 canonical docs:
   - `docs/CLAUDE_NEW.md` — 50-line operational contract
   - `docs/PRODUCT.md` — I Layer doctrine, 6 primitives, operator journey, fulfillment, anti-churn
   - `docs/ARCHITECTURE.md` — system architecture, deployments, config
   - `docs/SESSION_LOG.md` — this file

### Key Decisions
- **No more branches/worktrees for Connector OS** — system matured, branches create risk
- **Station = Flow V2** — same repo, isolated folder (`src/station/`), not a new project
- **I Layer is the architecture** — Raw → Synthesize → Embed → Evaluate → Route

### Key Files
| File | Location | Purpose |
|------|----------|---------|
| `validate-mcp.js` | Desktop | Standalone MCP validation script |
| `station_full.tsx` | /tmp/ | Recovered Station UI (2,823 lines) |
| `marketPresets.ts` | src/constants/ | Pack definitions used in validation |

### What's Pending
- [ ] Replace root CLAUDE.md with lean version pointing to docs/
- [ ] Incorporate Station design patterns into docs/STATION_DESIGN.md
- [ ] Build Station V1: Signal → Evaluation → Approve → Introduction
- [ ] Create MCP evaluation endpoint (POST /evaluate)
- [ ] Create evaluationService.ts
- [ ] Wire I Layer synthesis into ingestion pipeline

### Azure Config (Frozen)
- Endpoint: `https://outreachking.openai.azure.com`
- Chat: `gpt-4o`, API version `2025-01-01-preview`
- Embeddings: `text-embedding-3-small-2` (Standard regional), API version `2024-02-01`
- Available deployments: gpt-4o, gpt-5-nano, gpt-5-nano-2, gpt-4.1-mini, gpt-5-mini, text-embedding-3-small-2

---

## Session Template (Copy for Future Sessions)

### YYYY-MM-DD — [Description]

#### What Was Done
- ...

#### Key Decisions
- ...

#### Files Modified
| File | Changes |
|------|---------|
| ... | ... |

#### What's Pending
- [ ] ...
