# SESSION_LOG.md — Connector OS Work Log

---

## 2026-02-24 — Documentation Overhaul + I Layer Validation

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
