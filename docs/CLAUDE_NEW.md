# CLAUDE.md — Operational Contract (Survives Compaction)

## Identity
Connector OS = market interpretation engine. Not lead gen. Not outreach software.
Operator = market router, not salesperson. Air traffic controller, not SDR.

## The I Layer Invariant (NON-NEGOTIABLE)
Nothing raw touches MCP. Only I Layer canonical intent objects enter evaluation.
Embedding Input = AI Interpretation, NOT Source Data.
If Claude embeds raw company descriptions → regression. Stop immediately.

## 6 Primitives (No New Nouns)
Signal, Party, Evaluation, Commitment, Introduction, Outcome.
No "lead." No "campaign" entity. No "match" outside Evaluation.

## Pipeline
Raw → I Layer (synthesize intent) → MCP (evaluate pairs) → Commitment (priority) → Route (intro) → Outcome (feedback)

## Hard Rules
- ASK before build, deploy, dev server, or any file modification
- Show planned change (file, lines, purpose) → wait for "yes"
- One change at a time. Minimal fix. No cowboy patches.
- Read file FIRST before editing. If working, don't break it.
- All imports must exist. No undefined runtime globals.
- Guest mode = zero DB writes. localStorage only.
- Edge functions must use CORS headers.
- Retries ONLY in AIRequestQueue. Never in callOpenAI/callClaude.
- Never change classification, Flow, Matching, or Routing unless asked.
- Verify bugs before investigating: "Is this still happening?"

## Git Safety
FORBIDDEN without approval: checkout, restore, reset, clean, revert, stash, rebase.
Pre-deploy: git status clean → verify imports → npm run build.
Deploy: push first → vercel --prod → alias ALL domains.

## Azure Config (Frozen)
- Endpoint: https://outreachking.openai.azure.com
- Chat: gpt-4o, api-version 2025-01-01-preview
- Embeddings: text-embedding-3-small-2 (Standard regional, NOT Global Standard), api-version 2024-02-01

## Debugging Priority
Local works, prod fails → check GIT first (untracked files, case sensitivity).
Different behavior across domains → check ALIASES (npx vercel alias ls).
CORS error → edge function needs headers + REDEPLOY.
Silent failure in user-click path = BUG, not user error.

## Read These
- docs/ARCHITECTURE.md — what exists, what calls what
- docs/PRODUCT.md — I Layer doctrine, primitives, operator journey
- docs/SESSION_LOG.md — what was done, what's pending
- docs/STATION_DESIGN.md — UI design system (when created)
