# COMPACT INSTRUCTIONS — SURVIVE COMPACTION

When context compacts, ALWAYS preserve:
- Git safety doctrine (no history rewrites, ask before checkout/restore)
- Pre-deploy invariant (check untracked files, verify imports, build last)
- CLAUDE CONTRACT (ask before build/deploy/dev server)
- Ontology architecture (readonly side/market/packId/origin on NormalizedRecord)
- Flow guardrails (SIDE_MISMATCH, MARKET_MISMATCH skip pairs)
- Prompt doctrine (AI must not infer supply capability from description)
- List of files modified in current session
- Architecture snapshot: `docs/ARCHITECTURE_SNAPSHOT_2026_02_20.md`

---

# GIT SAFETY — READ FIRST (NON-NEGOTIABLE)

**SCHEMA FIRST — Before writing any query against an existing table, run `SELECT column_name FROM information_schema.columns WHERE table_name = '...'` to verify actual column names. Never trust documentation or migration files over the live schema. The real DB is the source of truth.**

You are **never** allowed to run git commands that modify history or working files without explicit confirmation.

**Forbidden commands unless user explicitly approves:**
- `git checkout`
- `git restore`
- `git reset`
- `git clean`
- `git revert`
- `git stash`
- `git rebase`
- Any command that overwrites files

**If a request sounds like reverting or undoing changes, you MUST first ask:**
> "Do you want me to revert only the last change, or restore the entire file?"
> and **wait for confirmation.**

**All fixes must be surgical edits, not file resets.**

**Allowed actions:**
- Edit specific lines
- Patch specific functions
- Show diff before applying changes

**Before modifying a file, show:**
```
Planned change:
File:
Lines affected:
Purpose:
Proceed? (yes/no)
```

---

# NO COWBOY PATCHES

> Every fix must be architectural. No "quick patches" that work today and break tomorrow. Think like Stripe: find the root cause, fix it once, fix it correctly. If you don't understand the problem fully, STOP and audit before writing code.

# Connector OS — Project Context

> This file is the single source of truth for Claude. Read this first every session.

---

## OPERATOR DOCTRINE — BENEVOLENT AUTHORITY

**You are not a conversational assistant. You are an Operator Engineer working behind closed doors on production systems.**

### Core Doctrine

- **The system comes first.**
- Correctness > convenience
- Stability > appeasement
- Boundaries create trust
- Users adapt to systems — systems do not adapt to misuse

### You Do NOT Optimize For

- User feelings
- "Nice-to-have" flexibility
- Edge-case appeasement
- Hand-holding explanations
- Over-engineering to protect users from themselves

### You DO Optimize For

- Deterministic behavior
- Clear failure modes
- Explicit constraints
- Predictable consequences
- Long-term system health
- Minimal surface area

### Behavioral Rules

1. **Never** soften constraints to reduce friction
2. **Never** add logic to "help" users bypass rules
3. **Never** hide errors — fail loudly and explicitly
4. **Never** assume misuse is your responsibility
5. **Never** redesign a system to absorb abuse

**If a user hits a limit:** The limit is correct. The user must change behavior.

**If a request weakens boundaries:** Reject it. Explain once, briefly, why it violates system integrity.

**If ambiguity exists:** Remove it by enforcing a single, canonical path.

### Coding Standards

- Prefer explicit contracts over "smart" behavior
- Prefer timeouts over retries
- Prefer rejection over silent fallback
- Prefer one correct path over many "helpful" ones
- Prefer breaking changes over legacy debt

Every API, UI, and workflow must answer: **"What behavior does this force?"**
- If it forces discipline → it is good
- If it enables chaos → it is wrong

### Communication Style

Short. Direct. Technical. No fluff. No moralizing. No over-explaining.

**Allowed:** "This is expected behavior." / "This will not be supported." / "Users must adapt." / "That is outside system guarantees."

**Forbidden:** "We can make this more flexible." / "We can handle this edge case for them." / "We can auto-fix user behavior." / "We should avoid frustrating users."

### Mental Model

Think like: AWS IAM, Stripe API, Postgres, Unix, TCP/IP.

**Rigid. Predictable. Trustworthy.**

### Final Invariant

> A system that enforces rules earns trust.
> A system that negotiates rules collapses.

**Operate accordingly.**

---

## CLAUDE CONTRACT — MANDATORY BEFORE CODING

**Check these boxes mentally before writing ANY code. FAIL ANY = STOP.**

- [ ] All imports exist (no undefined runtime globals)
- [ ] `supabase` imported from `../lib/supabase` or use `db` service layer
- [ ] Guest mode has zero DB writes (use localStorage)
- [ ] All edge functions use CORS headers
- [ ] New component renders without runtime errors
- [ ] **NO duplicate retry logic** - retries handled ONLY in AIRequestQueue

---

## PRE-DEPLOY INVARIANT — HARD GATE (NOT A SUGGESTION)

**NO FILE MAY BE IMPORTED UNLESS IT IS TRACKED IN GIT**

Before ANY deploy or "done" claim, run this checklist:

### Step 1: Check untracked files
```bash
git status --porcelain
```
**If output is NOT empty → STOP. Do not proceed.**

### Step 2: Verify ALL imports resolve to tracked files
```bash
# Check for any imports pointing to untracked files
git ls-files --error-unmatch <path>
```
For every new import introduced in the session, verify the target file is tracked.

### Step 3: Only then build
```bash
npm run build
```

### The Gate

| Check | Action |
|-------|--------|
| Untracked files exist | **STOP** — commit or remove imports |
| Import points to untracked file | **STOP** — report missing files |
| Build fails | **STOP** — fix before claiming done |

**This is not optional. This is not a suggestion. This is a hard gate.**

---

## CLAUDE BEHAVIORAL CONTRACT — ASK FIRST

**These are NON-NEGOTIABLE. Violating these = user frustration.**

### 1. ASK before building
```
"Ready to build?"
```
Do NOT run `npm run build` without asking first.

### 2. ASK before deploying
```
"Deploy now?" or "Deploy [function-name]?"
```
Do NOT run `vercel --prod` or `supabase functions deploy` without asking first.

### 3. ASK before running dev server
```
"Start dev server?"
```
Do NOT run `npm run dev` without asking first.

### 4. CORS — Always check edge functions
When you see CORS errors in console:
1. The edge function needs CORS headers
2. The edge function needs to be REDEPLOYED
3. ASK: "Deploy [function-name] to fix CORS?"

**Common CORS error:**
```
Access to fetch at 'https://xxx.supabase.co/functions/v1/xxx'
has been blocked by CORS policy
```

### 5. Think before acting
- Don't assume — ASK
- Don't guess the problem — READ the error
- Don't blindly change code — UNDERSTAND the root cause
- 422 errors on Apollo = credits exhausted, not code issue

### 6. VERIFY bugs before investigating
When user reports a bug (screenshot, description, etc.):
1. **ASK:** "When was this taken? Is this still happening?"
2. **ASK:** "Can you reproduce it now?"
3. **ASK:** "What exactly were you trying to do?"

Do NOT:
- Assume old screenshots represent current bugs
- Start investigating without confirming it's still an issue
- Jump to solutions without understanding the actual problem

**Example:**
```
User: "Here's a screenshot of a bug"
Claude: "Thanks. When was this taken? Is this still happening? Can you reproduce it now?"
```

### Service Layer (preferred pattern)
```typescript
// Use db service layer (src/services/db.ts)
import { db } from '../services/db';
const { data } = await db.invokeFunction('reply-brain', { body });

// Or direct import when needed
import { supabase } from '../lib/supabase';
```

### Edge Function Pattern
```typescript
// Use shared CORS wrapper (supabase/functions/_shared/http.ts)
import { withCors, jsonResponse } from '../_shared/http.ts';

export default withCors(async (req) => {
  return jsonResponse({ ok: true });
});
```

---

## OPERATOR DOCTRINE — INCIDENTS, DEPLOYMENTS, AND VISIBILITY

### 1. Default Assumption Rule (MANDATORY)

Always assume UX visibility or state mismatch until proven otherwise.

When a user reports: "nothing happens", "doesn't work", "stuck", "can't save", "clicked and nothing changed"

You must NOT assume logic failure.

**First hypotheses to check (in this order):**
1. Error exists but is not surfaced in UI
2. State guard caused early return (silent exit)
3. Missing config / schema rollout mismatch
4. Cached or stale deployment (CDN / build cache)
5. User in wrong mode (guest, missing settings, limited context)

Only after these are ruled out may logic be questioned.

### 2. Silent Failure Is a BUG (NOT user error)

If a function returns early, sets state.error, fails validation, or fails config checks — AND the user sees no feedback — that is a UX visibility bug, not a logic bug.

**Doctrine:** No guard may fail silently in a user-click path.

### 3. Deployment Permission Rule (ABSOLUTE)

Claude must NEVER deploy automatically.

Deployment may ONLY occur if:
- Saad explicitly says "deploy now"
- OR Saad explicitly approves a listed set of files to deploy

If a fix appears obvious: **STOP → ASK → WAIT**

Reason: Saad may be mid-local work, mid-investigation, or intentionally paused. Unauthorized deploys are doctrine violations.

### 4. No Deploy Escalation (ABSOLUTE)

If a deployment does not reflect changes:
- Claude must **STOP**
- Claude must **ASK**
- Claude must **NOT** attempt alternative deployment strategies
- Claude must **NOT** modify code to force cache busts

Cache busting is an operator decision, not an agent decision.

Any attempt to deploy after a failed deploy without re-authorization is a protocol violation.

### 5. Deployment Cache Protocol (MANDATORY)

Before concluding a fix "didn't work":

Claude must verify:
- Bundle hash in production
- Bundle hash in local build
- Alias → deployment mapping
- That the new build is actually being served

Never assume Vercel picked up new artifacts.

If hashes don't match: Treat as deployment cache issue, not code issue.

### 6. Git-First Deployment (MANDATORY)

When deploying changes:
1. `git status` — report verbatim
2. Identify files with actual fixes
3. Stage only those files (no OS files, logs, unrelated folders)
4. Show exact `git add` command — wait for confirmation
5. `git commit -m "<factual message>"`
6. `git push origin master`
7. Only after push: `vercel deploy --prod --yes`
8. Verify served bundle hash matches new build

### 7. Fix Scope Discipline

When diagnosing an incident:
1. Diagnose first
2. Name the failure mode
3. Propose minimum surface fix
4. Ask for approval
5. Then implement

No exploratory edits. No "while I'm here" changes. No optimizations during incident response.

### 8. Operator Mental Model (Non-Negotiable)

- User stress ≠ system failure
- System working for operator = strong signal
- Visibility bugs are more common than logic bugs

Claude must optimize for: **Calm diagnosis → Minimal change → Trust preservation**

Not speed.

### 9. Violation Acknowledgement Requirement

If Claude violates any of the above:
- It must explicitly acknowledge the violation
- Stop immediately
- Await instruction

This doctrine overrides all convenience, intuition, or "best practice" impulses.

### 10. Git-First Debugging (MANDATORY)

If local works but prod fails, assume **git** first.

Not infra. Not logic. Not AI. Not users. **Git.**

Common causes:
- File never committed (Windows allowed it, git didn't track it)
- Folder never added (`src/components/` existed locally but not in repo)
- Case sensitivity (Windows is permissive, Linux is not)

**Action:** `git ls-files | grep -i <filename>` to verify git's view of the file.

### 11. Platform Case Sensitivity (MANDATORY)

**Windows is permissive. Production is not.**

Vercel builds on Linux. Linux is case-sensitive. Windows is not.

- `DatasetHealthCard.tsx` ≠ `datasethealthcard.tsx`
- Import path must match **exact** file casing
- If build fails with "Cannot resolve module", check casing first

**Never debug frontend behavior until all domains resolve to the same deployment.**

### 12. Alias Reality Check (MANDATORY)

If behavior differs between users, **check aliases before code.**

CDN + aliases + redirects create parallel realities:
- You test one domain
- Users hit another
- Everyone is "right" and "wrong" at the same time

This is not incompetence. This is web plumbing.

**The trap:**
```
connector-os.com → redirects to → www.connector-os.com → points to OLD deployment
app.connector-os.com → points to NEW deployment
```

**The fix:**
```bash
# Verify all domains point to same deployment
npx vercel alias ls

# Alias ALL domains to same deployment
npx vercel alias <DEPLOYMENT_URL> app.connector-os.com
npx vercel alias <DEPLOYMENT_URL> connector-os.com
npx vercel alias <DEPLOYMENT_URL> www.connector-os.com
```

**Canonical domain:** `app.connector-os.com` (recommended)

All other domains should redirect or alias to the same deployment.

---

## GUEST CONTRACT — DO NOT VIOLATE

**This is non-negotiable. Read before any guest-mode changes.**

### Guest mode MUST allow:
- Matching engine (demand → scoring → match)
- Enrichment (Apollo + Anymail via edge functions)
- Instantly sends (via instantly-proxy edge function)
- Personalized intro generation (if user pastes API keys in Settings)

### Guest mode MUST NOT:
- Write to Supabase tables (operator_settings, replies, signal_history, usage_logs)
- Block features behind auth that don't require persistence
- Auto-trigger personalization without user action

### Auth required ONLY for:
- `/msg-sim` (Message Simulator)
- `/reply-tracker` (Inbound/Replies)
- `/operator/ssm-access` (SSM dashboards)
- DB persistence of settings/pools/history

### Implementation pattern:
```typescript
// WRONG - blocks guest functionality
if (isGuest) return;

// CORRECT - only blocks if config missing
if (!isAIConfigured(aiConfig)) return;

// CORRECT - guest uses localStorage, auth uses DB
if (isGuest) {
  localStorage.setItem('guest_pools', JSON.stringify(pools));
  return;
}
await supabase.from('operator_settings').update({ pools });
```

### Smoke test (must pass):
1. Incognito → /launcher → paste Apify token + datasets → matching works
2. Click enrich → Apollo/Anymail works
3. Paste API key → generate intro → personalization works
4. Send to Instantly → succeeds
5. Network tab: NO calls to /rest/v1/operator_settings, /replies, /signal_history

---

## What Is Connector OS?

A matching engine for **operators** (connectors/intermediaries) who match **demand** (companies with hiring needs) to **supply** (recruiters, consultants, service providers who can fulfill those needs).

**One-liner:** "Tinder for B2B introductions, but the operator controls timing."

---

## Core Doctrine

**Principle:** Connect potential first. People only get connected when timing agrees.

**Mental Model:** "Two moving trains. Only open doors when aligned."

**Rules:**
- Interest ≠ readiness
- System never implies the other side is committed
- Operator controls timing and escalation
- **Outreach goes to BOTH sides** (demand and supply) — whoever replies first reveals timing
- You are routing interest, not selling

**Language:**
- Avoid: "They're ready", "They're in", "Waiting on them"
- Use: "There's interest", "Timing still forming", "Worth exploring"

**Why:** Connecting too early removes leverage, creates false urgency, lets parties bypass you.

---

## The Business Model (Course Reference)

### The Core Loop
```
Signal → Match → Enrich → Intro → Route → Reply → Deal → $$$
         ↑___________________________________|
                    (learn what works)
```

### The Math
- 500 contacts/day × 20 days = 10,000/month
- 2% reply rate = 200 conversations
- 10% convert to intros = 20 warm intros
- 25% close = 5 deals
- $10k-$50k connector fee = **$50k-$250k/month**

### Why This Isn't Cold Email Spam
1. **Timing** - You're hitting companies when they NEED help (pressure signals)
2. **Relevance** - The match actually makes sense (recruiter → hiring company)
3. **Both sides** - You're not selling, you're connecting

### The Infrastructure That Makes It Work
| Component | Purpose |
|-----------|---------|
| Pressure detection | Right timing (they need help NOW) |
| Quality scoring (A/B/C) | Prioritize hot signals |
| Match narration | Prove the "why" of the pairing |
| Reply attribution | Learn what converts, tune the system |

### Daily Operator Workflow
1. Load dataset (companies with hiring signals)
2. Match to supply (recruiters/agencies who can fulfill)
3. Enrich to find decision makers
4. Generate personalized intros
5. Route (send to both sides)
6. End of day: 300-500 contacts routed

**The difference between a connector and a spammer:** Signal quality and match quality. Volume is just scale. Money comes from QUALITY matches at scale.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS (dark mode, Linear/Vercel/Stripe aesthetic) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Email | Resend (branded templates) |
| Enrichment | Apollo (primary), Anymail Finder (fallback) |
| Outreach | Instantly.ai (email campaigns) |
| Data Sources | Apify datasets (jobs, LinkedIn profiles) |
| Hosting | Vercel |

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `src/App.tsx` | Router, auth gates, PasswordSetupGate wrapper |
| `src/Landing.tsx` | Public landing page (Linear-style) |
| `src/Login.tsx` | Email → Password login, forgot password, magic link |
| `src/AuthCallback.tsx` | Handles magic link / recovery redirects, password set/reset |
| `src/AuthContext.tsx` | Auth state, signIn/signOut/setPassword/resetPassword methods |
| `src/PasswordSetupGate.tsx` | Forces new users to set password before app access |
| `src/Launcher.tsx` | Main dashboard after login |
| `src/Library.tsx` | OS Library/Playbook (Philosophy + System docs) |
| `src/Flow.tsx` | **🎯 ACTIVE Flow Engine** — 4-step flow (Load → Match → Enrich → Send) |
| `src/MatchingEngineV3.tsx` | ⚠️ LEGACY (8,508 lines) — valuable logic for extraction, NOT routed |
| `src/Settings.tsx` | Operator settings (datasets, API keys, identity, account) |
| `src/OnboardingWizard.tsx` | Step-by-step setup wizard for new users |
| `src/SSMGate.tsx` | SSM member access gate (request access flow) |
| `src/AuthModal.tsx` | Request access modal for non-members |
| `src/operator/SSMAccessDashboard.tsx` | 🎯 Operator access management dashboard |
| `src/lib/supabase.ts` | Shared Supabase client (SINGLE INSTANCE) |

### Services
| File | Purpose |
|------|---------|
| `src/services/DatasetValidator.ts` | Validates Apify dataset URLs, analyzes fields |
| `src/services/InstantlyService.ts` | Instantly.ai integration for email sending |
| `src/services/AnymailFinderService.ts` | Email lookup fallback |
| `src/services/SignalsClient.ts` | Fetches demand signals |
| `src/services/SupplySignalsClient.ts` | Fetches supply signals |

### Intro Generation (Deterministic Templates)

**NO AI. NO RETRIES. Just fill-in-the-blank templates.**

| File | Purpose |
|------|---------|
| `src/copy/introDoctrine.ts` | **🎯 SINGLE SOURCE OF TRUTH** — 8 mode templates, `composeIntro()` |
| `src/services/IntroGenerator.ts` | Thin wrapper — calls `composeIntro()` |
| `src/services/IntroReliability.ts` | Async wrapper for backwards compat |

**Troubleshooting intros:**
```
Bad intro? → src/copy/introDoctrine.ts:37-82 (MODE_TEMPLATES)
Wrong pain framing? → Edit demandPain string for that mode
Template not filling? → Check if companyDescription is passed
```

**8 Connector Modes:**
- `recruiting` — "who lose months on leadership hires because recruiters don't really understand the space"
- `biotech_licensing` — "who lose months in licensing because pharma BD teams don't really grasp the science"
- `wealth_management` — "who leave millions on the table with generic advisors"
- `real_estate_capital` — "who lose deals when capital partners underwrite too conservatively"
- `logistics` — "who hit growth walls when 3PLs can't keep up"
- `crypto` — "who lose months to licensing because consultants don't understand custody"
- `enterprise_partnerships` — "who lose quarters on integrations because partners underestimate workflows"
- `b2b_general` — "who lose time when providers don't really understand the space"

**Template pattern:**
- Demand: "Noticed [company] is [description] — I know companies in similar situations [pain]. I can connect you directly if useful."
- Supply: "I'm in touch with [demand ICP] — looks like the type of [noun] you guys [verb]. I can connect you directly if useful."

**NEVER add back:**
- AI prompts
- Retry loops
- Token dictionaries (SUPPLY_ROLE_VOCAB, DEMAND_VALUE_VOCAB)
- COS generation (getModeSupplyRole, getModeDemandValue)

### Composer — Intro Text Generation

**File:** `src/matching/Composer.ts`

The Composer generates intro text for both demand and supply sides of a match. It enforces language rules, cleans data, and ensures thread integrity.

**Core Functions:**

| Function | Purpose |
|----------|---------|
| `composeIntros()` | Main export — generates both intros from match data |
| `cleanCompanyName()` | Strips legal suffixes: "Acme LLC" → "Acme" |
| `extractPrimaryTitle()` | Takes first title: "VP, FA, Owner" → "VP" |
| `extractFirstName()` | Gets first name from full name |
| `formatCapability()` | Formats capability string with acronyms |
| `cleanDoubledPrepositions()` | Removes "with in" → "with", "in in" → "in" |
| `isPersonaLabel()` | Detects if capability is a persona (WHO not WHAT) |
| `generateWhatTheyDo()` | Creates capability line with persona fallback |
| `validateNoBannedPhrases()` | Checks text against banned phrase list |

**Banned Phrases (NEVER use):**
- "I work with"
- "My client"
- "We partner with"
- "Our client"
- "Our partner"
- "We work with"

**Allowed Phrases:**
- "I'm connected to"
- "I'm in touch with"
- "I know"

**Thread Integrity Rule:**
Both demand intro and supply intro MUST reference the same demand company. The `composeIntros()` function receives a single `demand` record and uses it for both outputs — no cross-leak possible.

**Persona Detection:**
If `capability` contains persona labels (Owner, Founder, CEO, VP, etc.), use neutral fallback:
- "What they do" line: "They work with firms like yours."
- "Fit reason" line: "Looks like a fit based on what you do."

**Legal Suffix Stripping:**
Removes: LLC, L.L.C., Inc, Corp, Corporation, Ltd, Limited, Co, Company, PLLC, LP, LLP

**Intro Templates:**

Demand intro:
```
Hey [firstName] —

I'm connected to [counterparty.contact] at [supplyCompany].
[What they do — capability or neutral fallback].
[demandCompany] [edge.evidence].

Worth an intro?
```

Supply intro:
```
Hey [firstName] —

[demandCompany] [edge.evidence].
[demand.contact] is [primaryTitle].
[Fit reason — why they match].

Worth a look?
```

### Pressure System
| File | Purpose |
|------|---------|
| `src/pressure/PressureDetector.ts` | Detects signals/pressure from job dataset |
| `src/pressure/InversionTable.ts` | Maps roleType → counterparty (who monetizes the pressure) |
| `src/pressure/FilterSynthesizer.ts` | Generates scraper filters from pressure detection |
| `src/pressure/FilterPacks.ts` | Pre-defined filter sets per counterparty |

### Edge Functions (Supabase)
| Function | Purpose |
|----------|---------|
| `supabase/functions/send-magic-link/` | Branded magic link + recovery emails via Resend |
| `supabase/functions/ssm-member-joined/` | Zapier webhook: auto-add + approve + send email |
| `supabase/functions/ssm-request/` | SSM access request + auto-approve for verified members |
| `supabase/functions/ssm-access/` | Dashboard API: list, approve, revoke, add members |
| `supabase/functions/apollo-enrichment/` | Apollo API proxy for email lookup |
| `supabase/functions/anymail-finder/` | Anymail Finder API proxy |
| `supabase/functions/instantly-proxy/` | Instantly.ai API proxy |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `operator_settings` | Per-user settings (API keys, dataset URLs, filters) |
| `ssm_members` | Verified SSM community members (synced via Zapier from Skool) |
| `ssm_access` | Access requests + approvals |
| `usage_logs` | API usage tracking |
| `user_campaigns` | User's Instantly campaign mappings |

---

## Auth Flow

1. **Login:** Email → Password (or magic link fallback)
2. **Forgot Password:** Sends recovery link via `send-magic-link` edge function with `type: 'recovery'`
3. **Magic Link Redirect:** `/auth/callback` handles token, shows password set/reset form
4. **SSM Access:** Non-members request access → auto-approved if in `ssm_members` table

---

## SSM Access Flow (Complete)

### Automatic Onboarding (Zapier)
When someone joins Skool:
1. Zapier fires POST to `ssm-member-joined` edge function
2. Body: `{ "email": "...", "full_name": "...", "secret": "ssm-zapier-2024" }`
3. Function adds to `ssm_members` + `ssm_access` (status=approved)
4. Magic link email sent automatically
5. Member appears in `/operator/ssm-access` as Approved

### Manual Request Flow
1. User submits email at SSMGate
2. `ssm-request` edge function checks `ssm_members` table
3. If verified member → auto-approve + send magic link
4. If not member → goes to pending for manual review
5. Operator reviews at `/operator/ssm-access`

### Password Setup Gate
New users MUST set a password before accessing the app:
- `PasswordSetupGate` component wraps the app
- Checks `user_metadata.password_setup_complete`
- If not set → full-screen password form (cannot bypass)
- After setting → flag stored in user_metadata
- Exempt routes: `/login`, `/auth/callback`, `/`, `/site`, `/library`

### Operator Access Dashboard (`/operator/ssm-access`)
- ShieldCheck icon + "Access" header (Linear-style UI)
- Filter tabs: All / Approved / Pending
- Per-user actions: Send magic link, Reset password, Revoke access
- Add member manually (with optional welcome email)
- Portal-based modals (centered, no scroll issues)

### Edge Functions
| Function | Purpose |
|----------|---------|
| `ssm-member-joined` | Zapier webhook for new Skool members |
| `ssm-request` | Manual access requests |
| `ssm-access` | Dashboard API (list, approve, revoke, add) |
| `send-magic-link` | Branded emails for login + recovery |

### Password Management
- **New users**: Must set password on first login via PasswordSetupGate
- **Logged in users**: Change password in Settings → Account section
- **Forgot password**: Login page → "Forgot password?" link
- **Operator reset**: Dashboard → user row → ⋯ → Reset password

---

## How Matching Works (User-Facing Concepts)

### The Two Sides
Connector OS connects **Demand** to **Supply**:

| Side | What It Is | Examples |
|------|------------|----------|
| **Demand** | Companies with a need | Hiring, funding raised, expanding, scaling, new office |
| **Supply** | Providers who fulfill that need | Agencies, consultants, vendors, recruiters |

### Datasets
Both sides need data:
- **Demand Dataset**: Apify scrape showing companies with signals (jobs, funding, growth)
- **Supply Dataset**: Apify scrape of providers (LinkedIn profiles, company directories)

### Niche-Agnostic Design
The system is **truly niche-agnostic** - it does NOT try to detect or guess your niche:
- **No auto-detection**: System doesn't assume you're in recruiting, VC, real estate, etc.
- **User controls niche**: You know your business better than any heuristic
- **Works for ANY market**: Recruiting, VC, real estate, consulting, SaaS partnerships, wealth management, etc.

### Matching Logic
1. Demand dataset loads → companies with signals
2. Supply dataset loads → providers who can fulfill needs
3. Signal quality scored (persistence, density, velocity, stacking)
4. Best match selected based on quality ranking

### Common Messages

| Message | Meaning | Fix |
|---------|---------|-----|
| "No supply entities" | No supply dataset uploaded | Go to Settings → add Supply Dataset URL |
| "No [category] suppliers found" | Supply dataset has providers, but none match this category | Add suppliers for that category, or the category detection was wrong |
| "Not enriched yet" | Contact hasn't been looked up via Apollo/Anymail | Click "Enrich" to find decision-maker |
| "Waiting for data" | No demand dataset configured | Go to Settings → add Demand Dataset URL |

### Why Matching Fails
1. **No supply dataset**: You only have demand data
2. **Category mismatch**: Demand is for "finance" but your supply are all recruiters (engineering/sales)
3. **Empty supply dataset**: The Apify scrape returned no valid companies
4. **Domain parsing failed**: Supply companies don't have valid website/domain fields

---

## Email Templates

All emails use the same branded template (Apple x Stripe x Linear dark mode):
- Black background (#000000)
- White text, muted hints
- Single CTA button
- "Hey Operator," heading
- Logo at top

Functions that send emails:
- `send-magic-link` (login + recovery)
- `ssm-request` (auto-approved member welcome)

---

## Environment Variables

```
VITE_SUPABASE_URL=https://dqqchgvwqrqnthnbrfkp.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_SAAS_MODE=false
```

Edge functions use:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

---

## Feature Flags

**File:** `src/config/features.ts`

Feature flags gate functionality via environment variables. No code changes needed to enable/disable.

| Flag | Purpose | Local | Production |
|------|---------|-------|------------|
| `VITE_ENABLE_CONNECTOR_AGENT` | Gates Connector Agent access | `true` | `false` |

### How It Works

```typescript
// src/config/features.ts
export const FEATURES = {
  CONNECTOR_AGENT_ENABLED:
    import.meta.env.VITE_ENABLE_CONNECTOR_AGENT === 'true',
};
```

### Behavior

| Environment | Flag Value | Launcher Card | Route |
|-------------|-----------|---------------|-------|
| Local (.env) | `true` | Full access | ConnectorAgent |
| Production | `false` or unset | "Coming Soon" badge, disabled | ComingSoon component |

### Enabling in Production

1. Set `VITE_ENABLE_CONNECTOR_AGENT=true` in Vercel environment variables
2. Redeploy
3. Zero code changes required

### Files Involved

| File | Purpose |
|------|---------|
| `src/config/features.ts` | Feature flag definitions |
| `src/components/ComingSoon.tsx` | Gate component for disabled features |
| `src/Launcher.tsx` | Imports FEATURES, sets `comingSoon: !FEATURES.CONNECTOR_AGENT_ENABLED` |
| `src/App.tsx` | Conditionally renders ComingSoon or ConnectorAgent based on flag |

---

## Deployment

### Frontend (MUST alias after deploy)
```bash
# 1. Build
npm run build

# 2. Deploy to Vercel
npx vercel --prod --yes

# 3. CRITICAL: Alias to production domains (deploy alone does NOT update domains!)
npx vercel alias <deployment-url> app.connector-os.com
npx vercel alias <deployment-url> connector-os.com
```

**Example:**
```bash
npx vercel alias connector-5krv3iafp-saad-belcaids-projects.vercel.app app.connector-os.com
npx vercel alias connector-5krv3iafp-saad-belcaids-projects.vercel.app connector-os.com
```

> ⚠️ The `--prod` flag creates a production deployment but does NOT automatically update the domain aliases. You MUST run the alias commands or the main domains will still point to the old deployment.

### Edge Functions
```bash
npx supabase functions deploy <function-name>
```

### Migrations
Run in Supabase SQL Editor

---

## Design Language

- Dark mode only (#09090b, #0A0A0A backgrounds)
- Inter font, tight letter-spacing (-0.02em)
- Subtle borders (white/[0.06])
- Emerald for success (#3dd68c)
- Red for errors (#e5484d)
- Blue for interactive (#3b82f6)
- Minimal, no emojis unless user asks
- Linear/Vercel/Stripe aesthetic

---

## Current State (Jan 2025)

- SSM access flow: fully automated with Zapier sync
- Settings: niche-agnostic (no auto-detection, user controls their own targeting)
- **Flow Engine: ACTIVE** at `/flow` — the 4-step matching flow (1,139 lines)
- **MatchingEngineV3: LEGACY** — NOT routed, kept for valuable logic extraction (8,508 lines)
- Apify: Uses Dataset ID + Token (not full URLs) - backwards compatible with legacy URLs

---

## Flow Engine (ACTIVE)

**File:** `src/Flow.tsx` (1,139 lines)
**Route:** `/flow`
**Status:** ✅ ACTIVE — This is the primary matching interface

### The 4-Step Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   LOAD   │ → │  MATCH   │ → │  ENRICH  │ → │   SEND   │
│  (blue)  │    │ (purple) │    │  (cyan)  │    │(emerald) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

| Step | What Happens | UI Color |
|------|--------------|----------|
| **Load** | Demand + Supply datasets load from Apify | Blue |
| **Match** | Supply matched to demand signals | Purple |
| **Enrich** | Find decision makers (Apollo/Anymail) | Cyan |
| **Send** | Generate intros + batch send to Instantly | Emerald |

### Key Features

- **Linear monochrome design** with colorful step indicators
- **Step-based navigation** — clear progress through the flow
- **Settings integration** — uses same settings as MatchingEngineV3
- **Guest mode compatible** — works with localStorage settings

### Flow Copy Conventions

**Terminology hierarchy (matches vs intros):**

| Term | Count | Meaning |
|------|-------|---------|
| **Matches** | 6 | Demand-supply pairings (edge-positive) |
| **Intros** | 10 | Actual contacts being reached (6 demand + 4 supply) |

**Step copy:**

| Step | Primary | Secondary |
|------|---------|-----------|
| `matches_found` | "Found 6 matches" | "X scanned · Y filtered out" |
| `ready` | "Found 6 matches" | "These will reach 10 people (6 demand · 4 supply)" |
| Route button | "Route 6 matches" | — |
| `complete` | "10" (big) | "Intros sent" + breakdown |

**Rule:** Match count is primary (what you found), intro count is secondary (what gets sent).

### vs MatchingEngineV3 (Legacy)

| Aspect | Flow.tsx (Active) | MatchingEngineV3 (Legacy) |
|--------|-------------------|---------------------------|
| Lines | 1,139 | 8,508 |
| Routed | ✅ `/flow` | ❌ NOT routed |
| Complexity | Minimal, focused | Complex, feature-rich |
| Status | Active | Legacy (for extraction) |

### Valuable Logic in MatchingEngineV3 (Extract Later)

The legacy engine contains valuable logic worth extracting into services:
- **WHO heuristic** — determining who to contact
- **Signal scoring** — quality scoring algorithms
- **Enrichment caching** — multi-layer cache system
- **Batch operations** — efficient batch send logic
- **Analyze filters** — counterparty filter generation

**Recommendation:** Keep MatchingEngineV3 as reference, extract services later, then delete.

---

## Codebase Stats (Jan 2025)

| Directory | Lines of Code |
|-----------|---------------|
| `src/` | ~60,627 |
| `supabase/functions/` | ~10,267 |
| **Total** | **~70,894** |

### Key File Sizes

| File | Lines | Status |
|------|-------|--------|
| `MatchingEngineV3.tsx` | 8,508 | LEGACY |
| `Flow.tsx` | 1,139 | ACTIVE |
| `Library.tsx` | ~1,200 | Active |
| `Settings.tsx` | ~800 | Active |

### Landing Page (`src/Landing.tsx`)
- **URL**: `connector-os.com` (root `/`)
- **Style**: Linear-inspired, dark mode, left-aligned hero
- **Badge**: "Built by founder of myoProcess — 1 billion routed"
- **Headline**: "The infrastructure for a connector"
- **Subheadline**: "Find who needs who, at the right time & Get paid."
- **CTA**: "Get access" → goes directly to `/launcher` (no login wall)
- **Nav**: "User's Manual" → `/library?page=architecture` (system docs)
- **Sections**: The routing, The model, Built for, Wall of Winners, What makes this different, Daily routine, Stats, CTA

### Library (`src/Library.tsx`)
- **URL**: `/library` (public, no auth required)
- **Philosophy section**: Connector Foundations, Wall of Winners, Your Initiation, Need & Power, What Is a Connector, What is Connector OS, How To Fail
- **System section (User's Manual)**: The System, Operator Workflow, Signals, Matching, Replies, Routing, Voice, FAQ
- **Operator Workflow**: Complete visual walkthrough with scenarios (hiring, funding, no-reply)
- **Deep linking**: `?page=<section-id>` to jump to specific section

### Routing
- `/` → Landing page (or redirect to `/launcher` if already authenticated)
- `/site` → Landing page always (for authenticated users to view site)
- `/launcher` → Main app (PUBLIC - no auth required)
- `/flow` → **🎯 Flow Engine** — the ACTIVE matching engine (Load → Match → Enrich → Send)
- `/setup` → Onboarding Wizard — step-by-step configuration for new users
- `/library` → Library/Playbook (public)
- `/library?page=architecture` → User's Manual (system docs)
- `/library?page=winners` → Wall of Winners
- `/settings` → Operator settings + account (password change, sign out)
- `/operator/ssm-access` → 🎯 Access management dashboard (operator only)
- `/auth/callback` → Magic link / recovery redirect handler

### Key Language
- Never say: "cold email", "leads", "meeting", "pipeline"
- Say: "outreach", "signals", "intro", "routed"
- Tone: Premium, Linear-style, lowered barrier for beginners

### Animations (Linear-style)
- Hero: Staggered fadeInUp on load (badge, h1, p, buttons)
- Sections: Scroll-triggered fade-in + slide-up using IntersectionObserver
- Parallax: Background gradient orbs move at different speeds on scroll
- Buttons: `hover:scale-[1.02] active:scale-[0.98]` micro-interactions
- Smooth scroll enabled via CSS

### Navigation
- Logo in Launcher: Clickable → `/site` (view homepage)
- "Connector OS" badge in Launcher: Clickable → `/site`
- Globe icon in AppHeader: → `/site`
- All "Get access" buttons: → `/launcher` (no login wall)

---

## Commands Reference

```bash
# Dev
npm run dev

# Build
npm run build

# Deploy frontend (3 steps - MUST alias!)
npx vercel --prod --yes
npx vercel alias <deployment-url> app.connector-os.com
npx vercel alias <deployment-url> connector-os.com

# Deploy edge function
npx supabase functions deploy send-magic-link

# Check Supabase status
npx supabase status

# List recent deployments (to get deployment URL)
npx vercel ls --prod
```

---

## System Behavior

### Enrichment Protection
Your tokens are protected. The system is designed to never waste API calls:

- **Navigate away mid-enrichment?** It keeps running in the background.
- **Come back to the page?** It picks up where it left off, no duplicates.
- **Already enriched that domain?** Skipped. The database remembers.
- **Cache hit?** No API call made. Results served from memory.

Multiple cache layers work together:
1. In-memory (instant)
2. LocalStorage (24hr TTL) - matching results persist when you navigate away
3. Database (permanent)

You can safely browse around, close tabs, or come back later. Enriched contacts stay enriched.

### Guest Mode
Guests (not logged in) store settings in localStorage:
- Key: `guest_settings` - API keys, profile
- Key: `matching_engine_state_v1` - cached matching results (24hr TTL)
- No DB calls for guests - everything ephemeral
- Guests can use full matching engine, enrichment, Instantly - just not persisted

### Campaign Routing
Leads go where you tell them:
- **Demand sends** → Demand campaign ID (from Settings)
- **Supply sends** → Supply campaign ID (from Settings)

Logs show exactly which campaign receives each send. Check console for: `"Sending DEMAND lead to campaign [ID]"`

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `ai-proxy` | Routes AI calls through server (Azure/OpenAI/Anthropic) - fixes CORS |
| `apollo-enrichment` | Apollo API proxy for contact lookup |
| `anymail-finder` | Anymail Finder API proxy |
| `instantly-proxy` | Instantly.ai API proxy for lead creation |
| `instantly-webhook` | Receives reply webhooks from Instantly (reply_received event) |
| `send-magic-link` | Branded emails for login + recovery |
| `ssm-access` | Dashboard API (list, approve, revoke, add) |
| `ssm-request` | Manual access requests |
| `ssm-member-joined` | Zapier webhook for new Skool members |
| `vsl-redirect` | VSL click tracking + redirect to frontend watch page |
| `vsl-watch-confirm` | Logs watched event, cancels not_watched followup |
| `followup-dispatcher` | Hourly cron — sends conditional VSL follow-ups |
| `reply-brain` | Generates replies, injects VSL on INTEREST stage |

---

## VSL Pre-Alignment System

**Purpose:** Auto-inject a 3-5 min explainer video (Loom) on INTEREST replies. Track engagement. Send conditional follow-ups.

### Architecture

```
reply-brain (INTEREST) → tracked VSL link
                      ↓
               vsl-redirect (logs click)
                      ↓
               /vsl/watch (React page with Loom embed)
                      ↓
               80% watched → vsl-watch-confirm
                      ↓
               logs watched + cancels not_watched followup
                      ↓
               followup-dispatcher (hourly cron)
                      ↓
               sends watched OR not_watched followup via Instantly
```

### Key Constraint

**Supabase Edge Functions CANNOT serve HTML.** They enforce CSP sandbox and downgrade responses to `text/plain`. The watch page MUST be a React route, not an edge function.

### Database Tables

| Table | Purpose |
|-------|---------|
| `vsl_events` | Tracks click and watched events per thread |
| `pending_followups` | Scheduled follow-ups (watched/not_watched paths) |

### Settings Columns (operator_settings)

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `vsl_url` | TEXT | null | Loom/YouTube URL for pre-alignment video |
| `vsl_followups_enabled` | BOOLEAN | false | Enable automatic follow-ups |
| `vsl_watched_delay_hours` | INTEGER | 24 | Hours before watched follow-up |
| `vsl_not_watched_delay_hours` | INTEGER | 48 | Hours before not_watched follow-up |

### Follow-up Logic

| Scenario | Follow-up | Timing |
|----------|-----------|--------|
| Lead watched VSL | Calendar link follow-up | 24h (default) |
| Lead clicked but didn't watch | Gentle nudge follow-up | 48h (default) |
| Lead replied manually | Both follow-ups canceled | Immediate |
| Lead replied NEGATIVE | No follow-ups scheduled | N/A |

### Guardrails (Doctrine)

1. **Only ONE follow-up per thread** — never both watched AND not_watched
2. **NEGATIVE replies never schedule follow-ups** — VSL only on INTEREST
3. **Manual reply cancels all pending follow-ups** — checked via `handled_threads`
4. **Idempotent watched logging** — duplicate watch events are no-ops

### Cron Setup (pg_cron)

```sql
SELECT cron.schedule(
  'vsl-followup-dispatcher',
  '0 * * * *',  -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/followup-dispatcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### Frontend Route

| Route | Component | Purpose |
|-------|-----------|---------|
| `/vsl/watch` | `VslWatch.tsx` | Embeds Loom, tracks progress, fires watched event |

### Testing

```bash
# Test full flow
curl -I "https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/vsl-redirect?uid=USER_ID&cid=CAMPAIGN&email=test@test.com&tid=test-001&url=https%253A%252F%252Fwww.loom.com%252Fshare%252FVIDEO_ID"

# Should redirect to: https://app.connector-os.com/vsl/watch?...

# Verify click logged
SELECT * FROM vsl_events WHERE thread_id = 'test-001';

# Verify followups scheduled
SELECT * FROM pending_followups WHERE thread_id = 'test-001';
```

---

## Notes for Claude

1. Always `.trim()` env variables (newline issues)
2. Use branded email template for all emails
3. SSM verification is server-side (edge function checks `ssm_members`)
4. ALL new users MUST set password via `PasswordSetupGate` (cannot skip)
5. Password setup stores `password_setup_complete: true` in `user_metadata`
6. Matching requires BOTH demand AND supply datasets
7. Operator doctrine: never imply commitment, timing is everything
8. Zapier webhook uses simple secret auth: `"secret": "ssm-zapier-2024"`
9. Edge functions deployed with `--no-verify-jwt` for public access
10. React Portals used for modals/toasts to avoid scroll/positioning issues
11. **Settings load from user's row** (`user_id = user?.id`), not 'default'
12. Azure OpenAI calls go through `ai-proxy` edge function (CORS fix)
13. FAQ documentation at `/library?page=faq`
14. **Name parsing**: `normalizeFirstName()` in AIService.ts extracts names from email, falls back to "there" for "hey there"
15. **Webhook URL**: Displayed in Settings → Outreach for copying to Instantly
16. **Capitalization style**: Use sentence case in docs ("The matching engine" not "The Matching Engine")
17. **Sending limits**: Daily target 50-1000, batch size 1-500 (user configurable, no hard caps on dataset loading)
18. **Match narration format**: "Company X is hiring [category], → Provider Y places [category] roles"
19. **UI scrollbars**: Library uses Linear-style thin scrollbars (6px, subtle)
20. **Wall of Winners**: Real photos in `/public/winners/`, $826,745 animated counter, LinkedIn badges, SSM CTA card
21. **Onboarding Wizard**: `/setup` route - step-by-step configuration wizard for new users
22. **Signal Quality Scorer**: See "Signal Quality Scoring" section below
23. **Never mention AI**: Say "the system" or "Personalization", never "AI-powered" or "AI generates"
24. **Flow Engine is ACTIVE**: `/flow` is the primary matching interface. MatchingEngineV3 is LEGACY (not routed).
25. **4-step flow**: Load → Match → Enrich → Send (not 5 steps). Intro gen is part of Send.
26. **Linear monochrome design**: Use white opacity (text-white/90, /70, /50, /40, /30) for most UI. Colorful accents only for flow steps.
27. **No "None" AI option**: AI is required in onboarding wizard. Users must choose OpenAI, Azure, or Anthropic.

---

## AI Architecture — CRITICAL

**Files:** `src/services/AIService.ts`, `src/services/AIRequestQueue.ts`

### Retry Handling — SINGLE LAYER ONLY

**NEVER add retry logic to individual AI call functions.** All retries are handled by `AIRequestQueue`.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  callOpenAI()   │ ──► │  queuedAICall() │ ──► │  AIRequestQueue │
│  callClaude()   │     │   (wrapper)     │     │  handles retries│
│  callAzureAI()  │     └─────────────────┘     │  (3x max)       │
└─────────────────┘                             └─────────────────┘
         │                                               │
         ▼                                               ▼
   NO RETRIES HERE                              RETRIES LIVE HERE
   (just throw error)                           (with UI feedback)
```

### Why This Matters

**Bug that was fixed (Dec 2024):**
- Each AI function had 3 retries with 2s/5s/10s delays
- Queue ALSO had 3 retries
- Result: 9 retries × long delays = frozen UI for 30+ seconds

**Now:**
- AI functions throw immediately on error
- Queue catches rate limits (429) and retries with UI feedback
- Users see "Retrying · attempt 1 of 3" instead of frozen screen

### Model Selection

Users can choose their AI model in Settings. Flow:

```
Settings.tsx (aiModel) → localStorage/DB → Flow.tsx (aiConfig.model) → AIService
```

Smart defaults if no model selected:
- OpenAI: `gpt-4o-mini` (cost-effective)
- Anthropic: `claude-3-haiku-20240307` (cost-effective)

**CRITICAL Model IDs** (exact strings, any typo = 500 error):
- OpenAI: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`
- Anthropic: `claude-3-haiku-20240307`, `claude-3-5-sonnet-20241022`

---

## Flow Enforcement — CRITICAL

### The 4-Step Flow (Flow Engine)

```
STEP 1: Load     → Demand + Supply datasets load from Apify
STEP 2: Match    → Supply matched to demand signals
STEP 3: Enrich   → Find decision makers (Apollo/Anymail)
STEP 4: Send     → Generate intros + batch send to Instantly
```

**Note:** Intro generation is now part of Step 4 (Send), not a separate stage.

### The Rule

**Intro generation MUST wait for matching.** Every intro generation path MUST check:

```typescript
// REQUIRED CHECK - no fallbacks allowed
const selectedProvider = selectedSupplyByDemandDomain[domain];
if (!selectedProvider) {
  console.log('Waiting for supply match...');
  return; // DO NOT use discoveredSupplyCompanies[0] as fallback
}
```

### Paths That Generate Intros (all must have the gate)

| Location | Gate Variable |
|----------|---------------|
| Auto-intro useEffect | `hasMatchedSupply` |
| Batch intro useEffect | `hasMatching` |
| `generateDualIntros()` | Checks `selectedSupplyByDemandDomain[domain]` |
| `regenerateDemandIntro()` | Checks `selectedSupplyByDemandDomain[domain]` |
| Narration generation | Checks `selectedSupplyByDemandDomain[result.domain]` |

### Anti-Pattern (NEVER DO THIS)

```typescript
// ❌ BAD - this bypasses matching
const provider = selectedSupplyByDemandDomain[domain] || discoveredSupplyCompanies[0];

// ✓ GOOD - this respects the flow
const provider = selectedSupplyByDemandDomain[domain];
if (!provider) return; // Wait for matching
```

### State Separation — UI Feedback vs Confirmed Match

Two separate states serve different purposes:

| State | Purpose | Triggers Intros? |
|-------|---------|------------------|
| `currentlyTryingSupplyByDomain` | UI feedback during enrichment | ❌ NO |
| `selectedSupplyByDemandDomain` | CONFIRMED match after enrichment | ✓ YES |

**Why this matters:** During enrichment, we try multiple supplies until one has a valid contact. Setting `selectedSupplyByDemandDomain` during this loop (for UI feedback) prematurely triggered intro generation. Now we use `currentlyTryingSupplyByDomain` for UI and only set the confirmed match after success.

```typescript
// In enrichSupplyContact loop:
setCurrentlyTryingSupplyByDomain(prev => ({ ...prev, [companyDomain]: supply })); // UI only

// After finding valid contact:
setSelectedSupplyByDemandDomain(prev => ({ ...prev, [companyDomain]: successfulSupply })); // Triggers intros
```

### Cache Versioning

When flow/state structure changes, bump the cache version:

```typescript
// In MatchingEngineV3.tsx
const CACHE_KEY = 'matching_engine_state_v3';  // Bump this number
const LEGACY_CACHE_KEYS = ['matching_engine_state_v1', 'matching_engine_state_v2'];
```

This forces all users to get fresh state instead of loading stale cached data.

---

## Signal Quality Scoring

**File:** `src/services/SignalQualityScorer.ts`

### Purpose
Ranks demand signals by quality/urgency. Niche-agnostic — works for any demand/supply matching (not just hiring).

### Scoring Factors

| Factor | Points | What it measures |
|--------|--------|------------------|
| **Persistence** | 0-30 | How long has the need been unfilled? Gated by liveness. Old + still active = HIGH PRESSURE |
| **Density** | 0-30 | How many signals from this source? More = stronger need |
| **Velocity** | 0-20 | Is activity accelerating? Recent surge = urgent |
| **Stacking** | 0-20 | Multiple signal types? (funding + hiring = compound signal) |

### Tier Classification

| Tier | Score | Label | Meaning |
|------|-------|-------|---------|
| **A** | 70+ | Strong | Multiple indicators, timing is now |
| **B** | 45-69 | Good | Solid indicators, momentum forming |
| **C** | <45 | Medium | Early signs, worth exploring |

**Key:** Reach out to all three tiers — timing varies, potential doesn't.

### Key Insight: Persistence ≠ Freshness

**Old mental model (wrong):** Fresh = good, stale = bad

**Correct model:**
- Job posted 3 days ago → just started looking, exploratory
- Job open 2+ months AND still active → CAN'T FILL IT = high pressure = best signal

**Liveness Gate:**
- Must have been seen in recent scrape (within 14 days)
- Old + not seen recently = dead signal (score 0)
- Old + still active = persistent pain (score 30)

### Interface

```typescript
interface CompanySignalData {
  domain: string;
  companyName: string;
  signals: SignalItem[];          // Generic signals (jobs, RFPs, listings, etc.)
  secondarySignals?: {
    hasFunding?: boolean;
    hasLayoffs?: boolean;
    hasGrowth?: boolean;
    customSignals?: string[];     // "acquisition", "expansion", etc.
  };
}

interface SignalQualityScore {
  total: number;           // 0-100
  tier: 'A' | 'B' | 'C';
  breakdown: {
    persistence: number;
    density: number;
    velocity: number;
    stacking: number;
  };
  reasons: string[];
}
```

### Date Handling (Honest, No Guessing)

| Data available | Max score | Behavior |
|----------------|-----------|----------|
| Posted date + scrape date | 30 | Full persistence scoring |
| Only scrape date | 12 | "Active signal (duration unknown)" |
| Neither | 0 | No timing data, don't guess |

### UI Display

- **Sidebar:** Tier badge (A/B/C) next to company name
- **Detail view:** Tier badge + score + actual signal titles (not generic "2 signals detected")
- **High persistence:** Amber badge showing "High pressure (unfilled 2+ months)"

---

## Signal Intelligence (Phase 2)

**File:** `src/services/SignalIntelligence.ts`

### Purpose
Pre-computed semantic understanding via AI at ingestion. AI runs once, results cached, matching uses cached data.

### How It Works

1. **When signal arrives** → AI extracts:
   - `needSummary`: What they actually need (specific, not generic)
   - `needCategory`: engineering/sales/marketing/etc.
   - `needSpecificity`: high/medium/low
   - `urgencyLevel`: high/medium/low
   - `intentSignals`: ["multiple roles", "senior hires"]
   - `idealProviderProfile`: "Recruiter specializing in ML/AI"
   - `keywords` / `antiKeywords`: For matching

2. **When supply added** → AI extracts:
   - `capabilitySummary`: What they actually do
   - `specialization`: Their niche
   - `idealClientProfile`: Who they serve best
   - `clientStage`, `clientIndustries`: Matching hints

3. **At match time** → Compare cached profiles:
   - `assessMatch(demand, supply)` returns `IntelligentMatch`
   - No AI calls needed
   - Score based on: category alignment, keyword overlap, specificity fit, context fit

### Database

Table: `signal_intelligence`
- `user_id`, `domain`, `signal_type` (demand/supply)
- `intelligence` (JSONB): Full analysis
- `analyzed_at`: Timestamp
- 7-day cache TTL (re-analyze stale data)

### Migration

```sql
-- supabase/migrations/20251224100000_add_signal_intelligence.sql
CREATE TABLE signal_intelligence (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  domain TEXT NOT NULL,
  signal_type TEXT CHECK (signal_type IN ('demand', 'supply')),
  intelligence JSONB NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, domain, signal_type)
);
```

### Key Functions

```typescript
// Check cache
getCachedDemandIntelligence(domain, userId)
getCachedSupplyIntelligence(domain, userId)

// Analyze (calls AI once)
analyzeDemandSignals(domain, companyName, signals, aiConfig)
analyzeSupplyEntity(domain, companyName, profile, aiConfig)

// Match using cached intelligence (no AI)
assessMatch(demandIntelligence, supplyIntelligence) → IntelligentMatch

// Batch analyze
batchAnalyzeDemand(signals[], userId, aiConfig, onProgress)
```

### Integration Status

- [x] Service built (`SignalIntelligence.ts`)
- [x] Database migration created
- [x] Hook into signal loading (trigger background analysis)
- [x] Show intelligent match reasons in UI
- [ ] Background worker for batch analysis

### UI Display

When AI intelligence is available for a domain:
- **Indigo-tinted card** replaces the basic category-based match narration
- Shows `needSummary` (AI-generated understanding of what they need)
- Shows `intentSignals` as small badges (e.g., "multiple roles", "senior hires")
- Shows `urgencyLevel: high` as amber badge when applicable
- **Progress indicator**: "AI 3/10" in sidebar header shows analysis progress

When AI intelligence is NOT available:
- Falls back to category-based narration ("Company X is hiring engineers → Recruiter Y places engineering teams")

### Cost Model

- AI runs proportional to NEW signals, not batch sends
- 100 new signals = 100 AI calls
- 500 batch sends = 0 AI calls (uses cached intelligence)

---

## Anti-Fragile Intro Generation

**Files:** `src/services/AIService.ts`, `src/Flow.tsx`

### Why Anti-Fragile?

The system generates intros from **signals** (timing data), NOT from enrichment data (competitors, pain points). This makes intros work even when enrichment fails or data is incomplete.

**Old approach (fragile):** Relied on company enrichment (competitors, pain points, company description) → intros broke when enrichment failed

**New approach (anti-fragile):** Uses only signal data (what triggered the match) → intros always work

### The 2-Step Flow

```typescript
// Step 1: Detect match context (2-5 words)
const matchContext = await detectMatchContext(aiConfig, demand, supply);
// Returns: "engineering scaling" or "sales expansion"

// Step 2: Generate intro from signal + context
const intro = await generateDemandIntroAntifragile(aiConfig, {
  matchContext,
  firstName,
  companyName,
  signalDetail  // "hiring 5 engineers" or "Series B funding"
}, provider);
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `detectMatchContext()` | Returns 2-5 word context for the match |
| `generateDemandIntroAntifragile()` | Generates demand-side intro from signals |
| `generateSupplyIntroAntifragile()` | Generates supply-side intro from signals |
| `generateIntrosAntifragile()` | Generates both intros in one call |

### Fallback Chain

1. **Best:** System-generated intro from signals
2. **Fallback:** Deterministic template in `InstantlyService.ts`
3. **Last resort:** Generic "showing momentum" language

### Niche-Agnostic Language

All fallbacks use generic language that works for any market:
- ✓ "showing momentum" (not "hiring")
- ✓ "showing activity" (not "actively hiring")
- ✓ "active opportunity" (not "open roles")

**[Saad](https://www.linkedin.com/in/saadbelcaid/) (founder of myoProcess, Connector OS, and [SSM community](https://www.skool.com/ssmasters)) used this system to scale to $40,000/month** — the anti-fragile approach means intros work consistently regardless of data quality.

---

## Supply Aggregation (Deal Flow Positioning)

**Files:** `src/services/AIService.ts`, `src/services/BatchSendService.ts`

### The Problem

When the same supply contact (recruiter) matches multiple demand companies:
- **Old behavior:** 5 matches → 5 emails queued → 4 skipped by dedupe → 1 email sent
- **Problem:** Recruiter only hears about 1 company, you waste 4 opportunities

### The Solution

Aggregate matches per supply contact and send ONE email showing deal flow:

```
Before: "Hey Sarah, Company A is hiring engineers"  (4 others silently skipped)
After:  "Hey Sarah, I've got 5 companies hiring engineers right now. Worth a look?"
```

### Why This Is Better Positioning

- Shows abundance (you have deal flow)
- Recruiter self-selects ("which ones are Series A?")
- You keep leverage — they want access to YOUR pipeline
- 1 email, 5x the value

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `generateAggregatedSupplyIntro()` | AIService.ts | AI-generated aggregated intro (anti-fragile) |
| `groupSupplyByEmail()` | BatchSendService.ts | Groups batch items by supply email |
| `detectCommonCategory()` | BatchSendService.ts | Finds common category across signals |
| `shouldUseAggregatedIntro()` | BatchSendService.ts | Returns true if 3+ matches |

### Usage Pattern

```typescript
const groups = groupSupplyByEmail(supplyItems, getSignal, getCompanyName);

for (const group of groups) {
  if (shouldUseAggregatedIntro(group)) {
    // 3+ matches → aggregated intro
    const category = detectCommonCategory(group.matches.map(m => m.signal));
    const intro = await generateAggregatedSupplyIntro(aiConfig, supply, group.matches, category);
  } else {
    // 1-2 matches → existing single intro
  }
}
```

### Threshold

- **1-2 matches:** Use existing single intro (specific company pitch)
- **3+ matches:** Use aggregated intro (deal flow pitch)

### Fallback Template (Anti-Fragile)

If AI fails:
> "Hey [name], I've got [X] companies actively looking for help in [category] right now. A few are moving fast. Worth a quick look to see if any fit?"

### Integration (LIVE)

Wired into batch send flow:
1. Before `executor.enqueue()`, supply items are grouped by email
2. Groups with 3+ matches get aggregated intro
3. Groups with 1-2 matches keep original single intros
4. Metadata includes `aggregated: true`, `match_count`, `demand_companies`, `category`

Console logs:
- `[BatchSend] 🎯 Aggregating X matches for email@example.com (category)`
- `[BatchSend] ✓ Created aggregated supply send for email@example.com: X companies in category`

---

## Psyche — The Seven Minds

**File:** `src/reply/ReplyBrainV1.tsx`
**Pipeline Component:** `src/reply/AILayersPipeline.tsx`
**Edge Function:** `supabase/functions/reply-brain/index.ts`
**Route:** `/msg-sim`
**Symbol:** Ψ (Psi)

### What Is Psyche?

A 7-layer reply system that generates perfect responses for $10K+ connector deals. Each reply passes through seven "minds" — Jungian archetypes that check, validate, and self-correct.

**Philosophy:** Never say "AI". The system just works. Magic, not machinery.

### The Seven Layers

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ ANIMUS  │→ │   EGO   │→ │  SENEX  │→ │ SHADOW  │→ │  ANIMA  │→ │ MAGICIAN│→ │  SELF   │
│Creator  │  │Gatekeeper│  │  Elder  │  │ Mirror  │  │ Weaver  │  │  Mover  │  │  Whole  │
│ violet  │  │ emerald │  │  amber  │  │   red   │  │  cyan   │  │ fuchsia │  │  white  │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
```

| Layer | Name | Archetype | Purpose | Score |
|-------|------|-----------|---------|-------|
| 1 | **Animus** | The Creator | Generates reply from 300+ examples | — |
| 2 | **Ego** | The Gatekeeper | Quality gate: pricing leaks, banned words | pass/fail |
| 3 | **Senex** | The Elder | Doctrine guardian: leverage, positioning | leverageScore (1-10) |
| 4 | **Shadow** | The Mirror | Red team: worst interpretation check | deleteProbability (1-10) |
| 5 | **Anima** | The Weaver | Thread coherence: context awareness | contextScore (1-10) |
| 6 | **Magician** | The Mover | Deal momentum: forward movement | momentumScore (1-10) |
| 7 | **Self** | The Whole | Self-correction: composite score + auto-fix | compositeScore (1-10) |

### Self-Correcting Loop

If `compositeScore < 7`:
1. Gather all issues from layers 2-6
2. Run self-correcting rewrite (up to 2 rounds)
3. Ship the perfected reply

**Result:** User sees only the final, polished reply. No friction. Just magic.

### UI Components

**Pipeline Visualization (`AILayersPipeline.tsx`):**
- Animated 7-node graph with Jungian names
- Each node lights up as it processes
- Shows scores: Leverage, Context, Momentum
- Self-correction badge when triggered
- Composite score display

**Premium Design:**
- Ψ (Psi) symbol as logo
- 7 colored dots in header representing layers
- "The seven minds" tagline
- No "AI" language — just "the system"

### Interpretation & Next Move

**Interpretation:** 2nd grade reading level
- Before: "Ready to schedule — call-first flow"
- After: "They want to talk."

**Next Move:** Premium, authoritative
- Before: "Send calendar link or times"
- After: "Lock the call."

### Stage Classification

| Stage | Meaning | Next Move |
|-------|---------|-----------|
| INTEREST | They are interested. | Send calendar link. |
| SCHEDULING | They want to talk. | Lock the call. |
| PRICING | They asked about price. | Get them on a call first. |
| IDENTITY | They asked who you are. | Let them ask more. |
| SCOPE | They asked what you cover. | Confirm fit on a call. |
| PROOF | They want proof it works. | Build trust on a call. |
| NEGATIVE | They said no. | Move on. Next. |
| HOSTILE | They are upset. Exit clean. | Walk away clean. |
| CONFUSION | They are confused. | Clarify in next reply. |
| OOO | They are away. | Wait for return date. |
| BOUNCE | Bad email. | Find new email. |

### Telemetry

Every reply returns detailed telemetry:

```typescript
telemetry: {
  compositeScore: 8.5,
  usedSelfCorrection: true,
  selfCorrectionRounds: 1,
  leverageScore: 9,
  deleteProbability: 2,
  contextScore: 8,
  momentumScore: 9,
  latencyMs: 1234,
}
```

### Cost Model

- Normal reply (composite ≥ 7): ~$0.06
- Self-corrected reply (composite < 7): ~$0.07-0.08
- At 10 replies/day: ~$20-25/month
- One saved $10K deal = 400x ROI

### Trial System

Guests get 3 free tries before gate:
- Counter in localStorage: `reply_brain_trial_count`
- After 3 uses: blurred UI + SSM CTA overlay

---

## CRITICAL RULES - DO NOT BREAK

### Communication Protocol
1. **ASK before building** - Don't run `npm run build` without asking "Ready to build?"
2. **ASK before deploying** - Don't run `vercel --prod` without asking "Deploy now?"
3. **ASK if prompt is complete** - When receiving instructions, ask "Is this the full prompt or are you sending in chunks?"
4. **When reverting**, use the EXACT deployment the user specifies - don't assume

### Matching Engine & Auth
5. **Matching engine is FREE and auth-agnostic** - Decision is made, don't question it
6. **Engine boot must NOT be coupled to auth state** - Guests see full UI
7. **Guest mode is EPHEMERAL** - No DB calls, no default user row, localStorage only
8. **Only gate PERSISTENCE behind auth** - Saving settings requires login, using engine does not
9. **The fix:** `if (!user?.id) { setSettingsLoaded(true); return; }` - UI renders for guests

### Protected Features (Auth Required)
- Msg Simulator (after 3 free trials), Inbound/Replies
- Lookups count, credits, operator metrics
- Settings persistence to DB

### Guest Features (No Auth)
- Full matching engine UI
- Companies list, enrichment, signals, refresh
- Settings saved to localStorage (ephemeral)
- Instantly integration (if they configure it)
- Msg Simulator (first 3 tries free, then gated)

### Code Changes
10. **Don't assume - ASK** before making changes
11. **One change at a time** - Minimal fix, test, iterate
12. **Read file FIRST** before editing
13. **If working, don't break it** - Be surgical

---

## Product Audit Checklist

Run this checklist to verify the product is working correctly.

### Guest Flow (No Login)
- [ ] Landing page loads at `/`
- [ ] Click "Get access" → goes to `/launcher`
- [ ] Matching engine renders (no auth errors)
- [ ] Settings page loads, shows SSM CTA in Account section
- [ ] Can enter Apify dataset URL in Settings
- [ ] Can enter Apollo/Anymail API keys
- [ ] Can enter Instantly API key + campaigns
- [ ] Save settings → stored in localStorage (`guest_settings`)
- [ ] Refresh matching engine → loads data from dataset
- [ ] Companies list populates with tier badges (A/B/C)
- [ ] Tier legend shows: Strong, Good, Medium
- [ ] Click company → detail card shows
- [ ] Match narration shows: "X is hiring [category], → Y places [category] roles"
- [ ] Enrich contact → Apollo/Anymail lookup works
- [ ] Intro generates (if AI configured)
- [ ] Instantly send works (if campaigns configured)
- [ ] Navigate away → come back → data persists (24hr cache)
- [ ] Msg Simulator (`/msg-sim`) → shows SSM gate (blurred + auth modal)
- [ ] Inbound (`/reply-tracker`) → shows SSM gate

### Logged-In Flow
- [ ] Login with email/password works
- [ ] Settings persist to DB (not just localStorage)
- [ ] Operator dashboard shows (if Instantly + pressure detected)
- [ ] Daily target editable
- [ ] Batch size editable
- [ ] Batch send works
- [ ] Msg Simulator accessible (if SSM approved)
- [ ] Inbound accessible (if SSM approved)

### Signal Quality
- [ ] Tier A (70+): "Strong" label, emerald badge
- [ ] Tier B (45-69): "Good" label, blue badge
- [ ] Tier C (<45): "Medium" label, gray badge
- [ ] Tooltip on hover shows tier explanation
- [ ] High persistence shows amber "Strong timing" badge

### Settings Sections
- [ ] Data Sources: Demand dataset, Supply dataset, Apify token
- [ ] Enrichment: Apollo API key, Anymail Finder API key
- [ ] Outreach: Instantly API key, Demand campaign, Supply campaign
- [ ] AI: Provider selector, API keys for OpenAI/Azure/Anthropic
- [ ] Targeting: Identity (name, calendar link), Reply context (industries, personas, geo)
- [ ] Account: Password change (logged in) or SSM CTA (guest)

### Edge Functions
- [ ] `apollo-enrichment` - returns contact data
- [ ] `anymail-finder` - returns email
- [ ] `instantly-proxy` - creates lead in campaign
- [ ] `ai-proxy` - routes AI calls (Azure/OpenAI/Anthropic)
- [ ] `ssm-access` - dashboard API works
- [ ] `send-magic-link` - sends branded emails

### Data Integrity
- [ ] No hard caps on dataset loading (users control their own data)
- [ ] Cache TTL is 24 hours for matching results
- [ ] Guest settings in `localStorage.guest_settings`
- [ ] Matching cache in `localStorage.matching_engine_state_v1`

### UI/UX
- [ ] Dark mode only, Linear/Vercel aesthetic
- [ ] No emojis unless user requests
- [ ] Sentence case in UI copy
- [ ] Thin scrollbars (6px)
- [ ] Tooltips on tier badges
- [ ] No "leads", "meetings", "cold email" language

---

## DIRECT KNOWING Enterprise Features (Cosmic Level)

### North Star Metrics
- **Primary**: `meeting_booked_rate` per 100 replies (by stage + variant)
- **Secondary**: `negative_rate`, `unknown_rate`, `time_to_first_response`

### AB Testing
**Env Vars:**
```
AB_TEST_ENABLED=true
AB_TEST_NAME=cta_style
AB_TEST_VARIANTS=A,B
AB_TEST_TRAFFIC=0.5
```

**Rules:**
- Only AB test on safe stages: INTEREST, SCHEDULING, PRICING, IDENTITY, PROOF
- Never AB on: NEGATIVE, HOSTILE, OOO, BOUNCE
- Hard cap reply length: 240 chars for AB variants

**CTA Variants:**
- A: "quick 10–15 this week?"
- B: "want me to send a couple times?"

**Logging:**
- `reply_events.ab_test_name`, `ab_variant`, `ab_enabled`

### Drift Detection + Auto-Rollback
**Cron:** Daily at UTC 06:00 → `/functions/v1/drift-detector`

**Thresholds:**
- UNKNOWN > 20% AND +5% vs baseline → alert
- PRICING > 18% OR +2x baseline → alert
- NEGATIVE + HOSTILE > 12% OR +2x baseline → alert
- shadow_regressions stage_changed > 3% → alert
- shadow_regressions forbidden_hit > 0.2% → **AUTO ROLLBACK v20 → v19**

**Rollback Mechanism:**
- Set `REPLY_BRAIN_STABLE_VERSION=19` in edge function env vars
- Log rollback to drift_alerts with snapshot

### Slack Alerts
**Env:** `SLACK_DRIFT_WEBHOOK=...`

**Format:**
- Title: "ReplyBrain Drift Alert (v20)"
- 24h stage distribution top 5
- Baseline deltas
- Regression % + forbidden_hit %
- Recommended action

### Shadow Mode Promotion Pipeline
- P0: shadow 100% for v21 candidate
- P1: live 5% + shadow 100% for 24h
- P2: live 25% for 48h
- P3: live 100% + shadow N-1 for 7 days

**Promote only if:**
- stage_changed < 2%
- forbidden_hit < 0.1%
- meeting_booked_rate not down vs control

### Answer Pack (kills "varies")
**Fields in operator_settings:**
- `target_industries` (array)
- `target_geo` (string)
- `calendar_link` (string)
- `cta_style` (enum)

**Composer Rules:**
- INDUSTRY QUESTION → "mostly {top2 industries}…" (from settings or fallback)
- PRICING → deflect to call only (no money words)
- IDENTITY/PROOF → 1 line positioning + 1 line CTA

**Banned Tokens:**
- Global: `varies`, `depends`
- PRICING: `$`, `%`, `commission`, `fee`, `retainer`, `free`

**Required:**
- Industry answers must have at least 1 concrete industry word
- Reply length cap enforced

### Conversion Events
**Frontend tracking (auth only):**
- `reply_generated` - auto on success
- `reply_copied` - on copy button
- `reply_sent` - manual toggle
- `meeting_booked` - manual toggle
- `bad_output_reported` - report button

**Backend:** All events stored in `reply_events` table

**Service:** `src/services/ConversionTracker.ts`

### Gold Corpus CI Gates
**3 gold sets:**
- `gold_interest`: >=99% correct stage + no discovery questions
- `gold_pricing`: >=99% correct + zero money words + must have call CTA
- `gold_negative`: >=99% correct + must NOT have call CTA

**File:** `src/reply/goldCorpusGates.test.ts`

### Load Testing
**k6 weekly:** `tests/load/reply-brain.k6.js`

**Thresholds:**
- p95 < 200ms (deterministic path)
- error rate < 0.1%

### Sentry Alerts
**Functions:** `src/sentry.ts`
- `captureDriftAlert()` - drift detection alerts
- `captureForbiddenHitSpike()` - auto-rollback trigger
- `captureRollback()` - version rollback events

### Database Tables
| Table | New Columns |
|-------|-------------|
| `reply_events` | `ab_test_name`, `ab_enabled`, `reply_copied`, `reply_sent`, `meeting_booked`, `bad_output_reported` |
| `operator_settings` | `target_industries`, `target_geo`, `calendar_link`, `cta_style` |
| `drift_alerts` | Complete table for drift detection |

### Migrations
- `20251226130000_upgrade_shadow_mode.sql` - shadow mode columns
- `20251226140000_answer_pack_and_ab_fields.sql` - Answer Pack + conversion fields

### IDENTITY Canonical Fix
**Problem:** "how do you work" and "what's the catch" were being classified as CONFUSION/UNKNOWN, triggering clarifying questions that killed the conversation.

**Solution:** Hard-stop classification + canonical template.

**Force Patterns (in `reply-brain/index.ts`):**
```typescript
const IDENTITY_FORCE_PATTERNS = [
  /how do(es)? (you|this|it) work/i,
  /how exactly does this work/i,
  /what'?s the catch/i,
  /what'?s in it for you/i,
  /what are you getting out of this/i,
  /explain (this|how|the model)/i,
  /walk me through/i,
  /how do you operate/i,
  /what'?s (your |the )?model/i,
  /what'?s (your |the )?process/i,
];
```

**Signal:** When matched, returns `signals: ['identity_force']`

**Canonical Template:**
- 2 lines max
- Line 1: "fair question — i [connector positioning]"
- Line 2: call CTA ("10–15 this week work?")
- NEVER clarifying questions

**Hard Guards (forbidden in IDENTITY):**
- `are you looking for`
- `providers or services`
- `clarify`
- `are you (a |the )?(buyer|seller|provider|client)`
- `which side are you`
- `on behalf of`
- Multiple question marks (`\?.*\?`)

**Test Cases (`goldCorpusGates.test.ts`):**
```typescript
{ inbound: 'how do you work', mustNotContain: [/are you looking for/i, /clarify/i] }
{ inbound: "what's the catch?", mustNotContain: [/which side/i] }
{ inbound: 'explain how this works', mustContain: [/connector|independently|neutral/i] }
```

**Verified Behavior:**
- "how do you work" → IDENTITY (signal: identity_force)
- "what's the catch?" → IDENTITY (signal: identity_force)
- Both get 2-line canonical response with call CTA, zero clarifying questions

---

## Session Learnings (Dec 2024) — Clone This Mindset

### THE BIG REFACTOR: Universal Field Extraction

**What we did:** Refactored the entire data extraction pipeline so that ALL available fields from ANY Apify dataset are extracted once and flow through everywhere.

**Before (fragile):**
```
Dataset → extractJobLikeFields() extracts some fields
       ↓
Transformation strips most of them (only keeps company, title, location)
       ↓
MatchingEngineV3 manually re-checks item.email || item.contact_email || ...
       ↓
Data lost at every boundary, bugs everywhere
```

**After (solid):**
```
Dataset → extractJobLikeFields() extracts EVERYTHING:
  - companyName, companyUrl, title, locationText
  - industry, description, techStack (NEW)
  - existingContact: { email, name, title, linkedin } (NEW)
       ↓
Transformation passes ALL fields through (nothing stripped)
       ↓
MatchingEngineV3 uses item.existingContact?.email (single source)
       ↓
Enrichment automatically skipped when email exists in dataset ✓
```

**Files changed:**

| File | What changed |
|------|--------------|
| `SignalsClient.ts` | `extractJobLikeFields()` now extracts `existingContact`, `industry`, `description`, `techStack` |
| `SignalsClient.ts` | Transformation (line ~715) now includes ALL extracted fields |
| `SupplySignalsClient.ts` | `extractCompanyFields()` now extracts `techStack`, `existingContact` |
| `SupplySignalsClient.ts` | `SupplyCompany` interface now includes `techStack` |
| `Flow.tsx` | Pre-population uses `item.existingContact?.email` instead of manual field checking |

**Why this matters:**
1. **Datasets with emails skip enrichment** — saves API costs
2. **No more duplicated field checking** — one extraction, used everywhere
3. **New fields automatically available** — add to extraction once, flows through
4. **Prevents entire class of bugs** — data can't be lost at boundaries

**The rule:** Extract once in `extractJobLikeFields()` / `extractCompanyFields()`. Never manually check `item.email || item.contact_email` anywhere else.

---

### Field Extraction Architecture (Single Source of Truth)

**Problem solved:** Data was being extracted but lost at transformation boundaries.

**Pattern:**
```
Dataset → extractJobLikeFields() → existingContact, industry, description, techStack
       ↓
  SignalsClient transformation → MUST include all extracted fields
       ↓
  Flow.tsx → uses extracted data (no duplication)
       ↓
  Enrichment skipped if email exists ✓
```

**Files:**
- `SignalsClient.ts`: `extractJobLikeFields()` extracts ALL fields including `existingContact`
- `SupplySignalsClient.ts`: `extractCompanyFields()` extracts ALL fields including `existingContact`, `techStack`
- Both transformations MUST pass through extracted data (don't strip at boundaries)

**Rule:** Never duplicate field checking logic. Use `item.existingContact?.email`, not manual `item.email || item.contact_email || ...`

---

### Intro Voice (Premium Positioning)

**Demand side** (reaching companies with signals):
```
"Hey [Name] — quick note. Been tracking [space] signals — [Provider] came up as a fit for [specific problem]. Open to a quick intro?"
```
- "Been tracking signals" = intel, not labor
- Sounds like you have access, not a job

**Supply side** (offering leads to recruiters/agencies):
```
"Hey [Name] — got a lead. [Company] is [specific activity]. [Contact], their [title], is driving it. Worth a look?"
```
- "Got a lead" = direct value, no explanation needed
- Respects their time, delivers immediately

**Never use:**
- "I see you're in [industry]" (obvious, vague)
- "refine", "optimize", "strategies", "solutions", "expertise"
- Long explanations of what the provider does

---

### Batch Intro Generation (No Restart Panic)

**Problem:** Intros would restart mid-generation when new contacts arrived, causing user panic.

**Fix (Flow.tsx):**
```typescript
// Don't restart while actively generating
if (batchIntroGenerationRef.current) {
  if (readyCount > lastProcessedReadyCountRef.current) {
    console.log('[BatchIntros] New contacts ready while generating (will process after current batch)');
  }
  return; // Don't restart - let current batch finish
}
```

**After completion:** Check if new contacts arrived, schedule next batch with 2s delay.

---

### User Reassurance Messages

**Anxiety moments need micro-copy:**

| State | Message |
|-------|---------|
| Progress bar active | "Safe to leave — progress is saved" |
| Returning to app | Toast: "Welcome back — X contacts ready" |
| Background work | Silently continues, no restart |

**Locations:**
- Progress bar: Added "Safe to leave" text below bar
- Cache restore: Added toast on successful restore

---

### Working Style That Works

1. **Trace data flow end-to-end** — Don't assume extraction = usage. Check boundaries.
2. **Single source of truth** — One function extracts, consumers use extracted data.
3. **Fix the class of bugs, not just the instance** — Refactor > patch.
4. **Ask about UX before implementing** — "Which vibe?" before coding.
5. **Premium voice matters** — "Been tracking signals" vs "I work with" changes perception.
6. **User anxiety is real** — Progress restarts, lost state, confusion need reassurance.
7. **Don't over-engineer** — "Got a lead" beats "I work with a group that helps..."

---

### Key Debugging Patterns

**CORS errors:** Headers exist but function needs fresh deploy. Ask: "Deploy [function-name]?"

**Intros not generating:** Check if `existingContact` is being passed through transformations.

**Progress restarting:** Check if refs are being reset mid-operation.

**"Only X intros":** Check cache hits, API key validity, and if `existingContact` emails are being used.

---

### Files Modified This Session

| File | Changes |
|------|---------|
| `SignalsClient.ts` | Added `existingContact`, `industry`, `description`, `techStack` to transformation output |
| `SupplySignalsClient.ts` | Added `techStack` to interface, extraction, and output |
| `Flow.tsx` | Fixed batch intro restart bug, added reassurance messages, simplified pre-population to use `existingContact` |
| `AIService.ts` | Updated demand intro voice ("Been tracking signals"), supply intro voice ("Got a lead"), fixed double greeting check |

---

### The Connector's Voice

**Demand (to companies):** You're tracking signals, they came up.
> "Been tracking pharma growth signals — TPS Group came up as a fit."

**Supply (to recruiters):** You have a lead for them.
> "Got a lead. Strand Therapeutics is scaling. Jacob Becraft running point."

**Never sound like:**
- An employee ("I work for...")
- A vendor ("Our solutions can help you...")
- AI-generated ("I noticed you're actively seeking strategic partnerships...")

---

## CSV Upload Feature

**Files:** `Settings.tsx`, `SignalsClient.ts`, `SupplySignalsClient.ts`

### Why CSV?

Users want to bring their own curated data — enriched from Apollo, filtered in spreadsheets, normalized manually. CSV lets them skip Apify entirely.

### How It Works

```
Settings → Upload CSV
    ↓
Papa Parse → localStorage ('csv_demand_data' or 'csv_supply_data')
    ↓
Matching Engine → SignalsClient/SupplySignalsClient
    ↓
getCsvData() → if exists, use CSV instead of Apify
    ↓
Same pipeline (extractJobLikeFields, classifyCompany, etc.)
```

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `csv_demand_data` | Demand CSV records (JSON array) |
| `csv_supply_data` | Supply CSV records (JSON array) |

### Priority

**CSV > Apify**. If CSV data exists, it takes precedence over Apify dataset.

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `getCsvData(type)` | SignalsClient.ts | Get CSV from localStorage |
| `hasCsvData(type)` | SignalsClient.ts | Check if CSV exists |
| `processCsvJobData()` | SignalsClient.ts | Process demand CSV through pipeline |
| `processCsvSupplyData()` | SupplySignalsClient.ts | Process supply CSV through pipeline |

### UI Components

- DatasetField has `csvKey` prop ('demand' | 'supply')
- Hidden file input with Papa Parse
- Premium button styling with hover effects
- Success state shows record count in emerald card
- Clear button to remove CSV data

---

## Dataset Intelligence — Niche Detection

**File:** `src/services/DatasetIntelligence.ts`

### The Problem

"Analyze Datasets" was returning "Unknown" niche when:
1. Dataset has no `industry` field
2. AI call fails or returns unusable response
3. Niche doesn't match hardcoded patterns

### The Fix — Three Layer Detection

**Layer 1: Text-based detection** (first try, no AI)
```typescript
function detectNicheFromText(items: any[]): string {
  // Scans job titles, company names, descriptions
  // Scores against 13 niche patterns
  // Returns match if score >= 3
}
```

**Layer 2: AI detection** (if Layer 1 returns "General")
- Better prompt: "Do NOT respond with Unknown"
- Includes description snippets for more context

**Layer 3: Fallback**
- Returns "General" instead of "Unknown"
- "General" has its own filter set

### Niche Patterns (13 total)

| Niche | Keywords |
|-------|----------|
| Pharma/Biotech | pharma, biotech, clinical, medical device, life science |
| SaaS/Tech | saas, software, tech, cloud, platform, api, developer |
| FinTech | fintech, payments, banking, crypto, blockchain |
| Finance | finance, accounting, cfo, controller, fp&a |
| Real Estate | real estate, property, cre, construction |
| Healthcare | healthcare, hospital, clinic, patient, medical |
| Legal | legal, law firm, attorney, lawyer, litigation |
| Marketing | marketing, growth, brand, digital marketing, seo |
| Sales | sales, revenue, account executive, business development |
| HR/People | hr, human resources, people ops, talent acquisition |
| Manufacturing | manufacturing, production, supply chain, logistics |
| E-commerce | ecommerce, retail, dtc, shopify, amazon |
| Cybersecurity | security, cybersecurity, infosec, soc |

### Filter Sets

Each niche has pre-built counterparty filters:
- `jobTitlesInclude` — Senior titles (Partner, MD, Director, Founder)
- `jobTitlesExclude` — Junior titles (Intern, Coordinator, Assistant)
- `industriesInclude` — LinkedIn industry filters
- `keywordsInclude` — Niche-specific keywords
- `keywordsExclude` — Exclusions (internal, in-house)

### AI-Generated Filters (Any Niche)

When no hardcoded pattern matches, AI generates custom filters. The prompt teaches the connector model:

```
THE CONNECTOR MODEL:
- Demand = companies/people with a NEED
- Supply = service providers who FULFILL that need
- Think: "Who gets PAID when this demand is fulfilled?"

EXAMPLES OF DEMAND → SUPPLY MAPPING:
- Pharma companies hiring → Life Sciences Recruiters
- HNW individuals → Wealth Managers, Family Offices
- E-commerce brands → Shopify Agencies, Growth Consultants
```

This works for ANY niche — wealth management, AgTech, EdTech, whatever.

### Debugging

```
Console logs to watch:
[DatasetIntelligence] Text-based niche detection: SaaS/Tech
[DatasetIntelligence] AI niche detection: Pharma/Biotech
```

If you see "Unknown" or "General" when it should be specific:
1. Check if dataset has usable text (titles, descriptions, company names)
2. Check if AI config is valid
3. Add new patterns to `NICHE_PATTERNS` if needed

---

## Session Learnings Summary (Dec 2024)

### 1. THE BIG REFACTOR — Data Extraction Pipeline

**Problem:** `extractJobLikeFields` extracts data but transformations strip it out.

**Fix:** Ensure ALL extracted fields flow through transformation boundaries:
```typescript
// In SignalsClient.ts transformation
const normalizedJobs = filteredJobs.map(job => ({
  // ... existing fields ...
  industry: job.industry,
  description: job.description,
  tech_stack: job.techStack,
  existingContact: job.existingContact,  // CRITICAL — saves API calls
  raw: job.raw,
}));
```

### 2. CSV Upload — Guest-Friendly Data Import

**Pattern:** localStorage for CSV, same pipeline as Apify
- Check CSV first, fall back to Apify
- Same extraction functions, same output format
- Guest mode works (no DB required)

### 3. Niche Detection — Multi-Layer Fallback

**Pattern:** Text-based → AI → Fallback
- Never return "Unknown"
- Score-based keyword matching
- AI only when needed (saves cost)

### 4. Premium UI Patterns

**Button styling:**
```tsx
className="group relative h-9 px-4 rounded-xl
  bg-gradient-to-b from-white/[0.06] to-white/[0.02]
  hover:shadow-[0_0_20px_rgba(255,255,255,0.04)]
  hover:scale-[1.02] active:scale-[0.98]
  transition-all duration-300"
```

**Success state:**
```tsx
className="p-2.5 rounded-xl bg-emerald-500/[0.06]
  border border-emerald-500/[0.12]"
```

### 5. Key Debugging Patterns

| Issue | Check |
|-------|-------|
| "Unknown" niche | Add patterns to `NICHE_PATTERNS`, check AI config |
| CSV not loading | Check localStorage keys, Papa Parse errors |
| Filters empty | Check if niche matched in `nicheFilters` object |
| Batch restart | Check ref reset logic, queue instead of restart |
| **500 on AI calls** | Check model IDs are valid (see below) |

### 6. CRITICAL: AI Model IDs

**These MUST be exact. Typos cause 500 errors.**

| Provider | Correct Model ID | WRONG |
|----------|------------------|-------|
| OpenAI | `gpt-4o-mini` | `gpt-4.1-mini` ❌ |
| OpenAI | `gpt-4o` | `gpt-4.0` ❌ |
| Anthropic | `claude-3-haiku-20240307` | `claude-3.5-sonnet` ❌ |
| Anthropic | `claude-3-5-sonnet-20241022` | `claude-3.5-sonnet` ❌ |

**File:** `src/services/AIService.ts` → `getModelForProvider()`

**Defaults:**
- OpenAI: `gpt-4o-mini` (cheapest, fastest)
- Anthropic: `claude-3-haiku-20240307` (cheapest)

**If users report 500 errors with valid API keys:**
1. Check `getModelForProvider()` for typos
2. Verify model IDs match provider's current API docs
3. OpenAI model list: https://platform.openai.com/docs/models
4. Anthropic model list: https://docs.anthropic.com/en/docs/models

---

## Files Modified This Session (Continued)

| File | Changes |
|------|---------|
| `Settings.tsx` | Added CSV upload UI with Papa Parse, premium button styling |
| `SignalsClient.ts` | Added `getCsvData()`, `processCsvJobData()`, CSV priority over Apify |
| `SupplySignalsClient.ts` | Added `processCsvSupplyData()`, CSV priority over Apify |
| `DatasetIntelligence.ts` | Added 3-layer niche detection, 13 niche patterns, AI filter generation for any niche |
| `AIService.ts` | Fixed model ID typos: `gpt-4.1-mini` → `gpt-4o-mini`, `claude-3.5-sonnet` → `claude-3-haiku-20240307` |

---

## Session Learnings (Jan 2025) — Flow Engine Era

### Flow Engine is Now ACTIVE

**Key Changes:**
- `Flow.tsx` (1,139 lines) is the ACTIVE matching engine at `/flow`
- `MatchingEngineV3.tsx` (8,508 lines) is LEGACY — kept for valuable logic extraction
- The system now uses a 4-step flow: Load → Match → Enrich → Send

### Linear Monochrome Design Standard

**Updated Components:**
- `DatasetHealthCard.tsx` — white opacity for quality (text-white/90, /70, /50)
- `OnboardingWizard.tsx` — all steps Linear monochrome, "None" AI option removed
- Flow step indicators keep colorful (blue, purple, cyan, emerald)

### Onboarding Changes

1. **AI is now required** — removed "None" option from AI provider selection
2. **Replaced signal strength A/B/C** with 4-step Flow visualization in completion screen
3. **AI step description** changed from "Optional but recommended" to "For custom intros"

### Library Documentation Updates

- Removed "$25,000-$50,000/month" section from "What is Connector OS"
- Updated System section flow visuals to Load → Match → Enrich → Send (colorful)
- Updated Operator Workflow with 4-step colorful flow

### Files Modified (Jan 2025)

| File | Changes |
|------|---------|
| `CLAUDE.md` | Updated with Flow Engine documentation, codebase stats, 4-step flow |
| `DatasetHealthCard.tsx` | Linear monochrome design |
| `OnboardingWizard.tsx` | Linear monochrome, no "None" AI, 4-step flow viz |
| `Library.tsx` | Removed $25k section, updated flow visuals |

### Key Takeaways

- **Flow.tsx is the future** — lean, focused, maintainable
- **MatchingEngineV3 has valuable logic** — extract services, then delete
- **4-step flow is the standard** — Load → Match → Enrich → Send
- **Linear monochrome for UI** — colorful only for flow step indicators

---

## Connector Hub — Lead Database (Jan 2025)

**File:** `src/ConnectorHub.tsx`
**Route:** `/hub`
**Access:** SSM-gated (like Msg Simulator and Inbound)

### What Is Connector Hub?

A 9.43M contact database with BigQuery backend. Users search, select contacts, add to Demand or Supply collections, then start Flow. The Hub feeds BOTH sides of the matching equation.

### Design Philosophy (Apple × Vercel × Linear)

| Principle | Implementation |
|-----------|----------------|
| **Centered search** | Single compact input at top, not sidebar |
| **Chip-based filters** | Multi-select pills for titles AND industries |
| **Table view** | Clean columns, not cards |
| **Header-integrated actions** | Selection actions appear in header, not floating bar |
| **Compact inputs** | Apple-style small inputs (h-9, h-10, text-xs) |
| **Subtle email styling** | Violet-grey (`text-white/50`), not bright colors |
| **Staggered animations** | Rows and emails animate in sequence |

### Key UI Patterns

**Chip Component:**
```tsx
// Selected = white fill, unselected = transparent with border
<button className={selected
  ? 'bg-white text-black border-white'
  : 'bg-transparent text-white/60 border-white/[0.12] hover:border-white/30'
}>
```

**Header-integrated selection actions:**
```tsx
// Actions appear in header when items selected (no floating bar)
{selectedEmails.size > 0 && (
  <>
    <span>3 selected</span>
    <button>+ Demand</button>
    <button>+ Supply</button>
    <button><X /></button>
    <div className="divider" />
  </>
)}
// Then collection counts and Start Flow button
```

**Staggered animations:**
```tsx
// Row fade-in with stagger
style={{ animation: `rowFadeIn 0.3s ease ${i * 0.015}s both` }}

// Email reveal with blur
style={{ animation: `emailReveal 0.4s ease ${i * 0.02}s both` }}

@keyframes emailReveal {
  0% { opacity: 0; transform: translateX(-8px); filter: blur(4px); }
  100% { opacity: 1; transform: translateX(0); filter: blur(0); }
}
```

### Collection Model

Collections persist to localStorage on EVERY add/remove:
- `connector_hub_demand` — Demand contacts (JSON array)
- `connector_hub_supply` — Supply contacts (JSON array)
- Dedupe by email within each collection
- Accumulation: multiple searches can add to existing collections
- No destructive clears without explicit user action

### Hub → Flow Integration

```tsx
// Seamless navigation (not window.location.href)
navigate('/flow?source=hub');

// Flow reads from localStorage
const hubDemand = localStorage.getItem('connector_hub_demand');
const hubSupply = localStorage.getItem('connector_hub_supply');
```

### Decision Maker Titles (37 total)

```typescript
const TITLE_CHIPS = [
  // C-Suite (8)
  'CEO', 'CFO', 'CTO', 'COO', 'CMO', 'CRO', 'CPO', 'CHRO',
  // Founders (5)
  'Founder', 'Co-Founder', 'Owner', 'Partner', 'Principal',
  // VP Level (8)
  'VP Sales', 'VP Marketing', 'VP Engineering', 'VP Operations',
  'VP Product', 'VP Finance', 'VP HR', 'VP Business Development',
  // Directors (7)
  'Director', 'Senior Director', 'Managing Director', 'Executive Director',
  'Director of Sales', 'Director of Marketing', 'Director of Engineering',
  // Heads (7)
  'Head of Sales', 'Head of Marketing', 'Head of Engineering',
  'Head of Product', 'Head of Growth', 'Head of People', 'Head of Talent',
  // Other Senior (4)
  'General Manager', 'President', 'Chairman', 'Board Member',
];
```

### Navigation

- **Launcher:** KingIcon with `ssmOnly: true` flag
- **Dock:** KingIcon in nav bar
- **App.tsx:** Wrapped with `PrivateRoute` + `SSMGate`

### KingIcon (Chess King)

Custom SVG used across Launcher, Dock, and Hub:
```tsx
function KingIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  const color = (style?.color as string) || 'currentColor';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}>
      {/* Cross on top */}
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="10.5" y1="3.5" x2="13.5" y2="3.5" />
      {/* Crown + base paths */}
    </svg>
  );
}
```

**Critical:** Extract color from `style` prop for Launcher/Dock compatibility.

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Icon not showing in Dock/Launcher | Using `stroke="currentColor"` but color passed via style | Extract: `const color = style?.color \|\| 'currentColor'` |
| 406 on enriched_contacts | Using `.single()` which throws on no match | Use `.maybeSingle()` |
| Hard page reload on navigation | Using `window.location.href` | Use React Router `navigate()` |
| Floating bar requires scroll | Fixed positioning but feels disconnected | Integrate actions into header |

---

## Session Learnings (Jan 2025) — Connector Hub

### Design Learnings

1. **Apple loves smallness** — Compact inputs (h-9, h-10), tight spacing, text-xs
2. **Linear uses subtle purple** — Not bright colors for data, use `text-white/50` with `text-violet-400/40` accents
3. **Header-integrated actions** — Selection actions belong in header, not floating bars
4. **Staggered animations are sexy** — Use row index for timing: `${i * 0.015}s`
5. **Monospace for emails** — `font-mono tracking-tight` looks clean
6. **Chip design** — Selected = filled white, unselected = transparent with border

### Technical Learnings

1. **`.single()` vs `.maybeSingle()`** — Former throws 406 on no rows, latter returns null
2. **SVG color extraction** — Custom icons need `const color = style?.color || 'currentColor'`
3. **React Router for seamless nav** — `navigate()` not `window.location.href`
4. **SSM gating pattern** — `ssmOnly: true` in Launcher + `PrivateRoute` + `SSMGate` in routes
5. **Edge function JWT** — Deploy with `--no-verify-jwt` for public access

### Files Modified (Jan 2025 — Hub Session)

| File | Changes |
|------|---------|
| `src/ConnectorHub.tsx` | Complete redesign: centered search, chip filters, table view, header actions, animations |
| `src/Launcher.tsx` | Added KingIcon, `ssmOnly: true` for Hub |
| `src/Dock.tsx` | Added KingIcon with color extraction |
| `src/App.tsx` | SSMGate wrapper for `/hub` route |
| `src/enrichment/index.ts` | Fixed `.single()` → `.maybeSingle()` for 406 errors |

### Key Takeaways

- **Surgical changes** — Confirm before making changes that could break logic
- **UI changes ≠ logic changes** — Moving buttons to header doesn't touch selection logic
- **Seamless transitions** — Use React Router, not hard reloads
- **Apple aesthetic** — Small, compact, subtle colors, staggered animations

---

## Session Learnings (Jan 2025) — Deployment Reality

### The Solo Founder Trap

CDN + aliases + redirects create parallel realities:
- You test one domain → works
- User tests another domain → broken
- Everyone is "right" and "wrong" at the same time

**This is not incompetence. This is web plumbing.**

### Root Cause: Untracked Files

Build failed because `src/components/` folder was never committed to git:

```bash
# Windows: folder exists, imports work, local build succeeds
# Linux (Vercel): folder doesn't exist in repo, build fails

# Diagnosis:
git ls-files | grep -i datasethealthcard
# (no output = file not tracked)

git status src/components/
# Untracked files: src/components/
```

**Fix:** Add, commit, push, then deploy.

### Root Cause: Redirect Chain

`connector-os.com` was redirecting to `www.connector-os.com`, which pointed to an OLD deployment:

```bash
curl -sI https://connector-os.com
# HTTP/1.1 307 Temporary Redirect
# Location: https://www.connector-os.com/

# But www.connector-os.com pointed to old deployment!
npx vercel alias ls
# connector-os.com → deployment-A
# www.connector-os.com → deployment-B (OLD!)
# app.connector-os.com → deployment-A
```

**Fix:** Alias ALL three domains to same deployment:
```bash
npx vercel alias <DEPLOYMENT_URL> app.connector-os.com
npx vercel alias <DEPLOYMENT_URL> connector-os.com
npx vercel alias <DEPLOYMENT_URL> www.connector-os.com
```

### Debugging Checklist

When prod differs from local:

1. **Check git first**
   ```bash
   git ls-files | grep -i <filename>
   git status <folder>
   ```

2. **Check all domain aliases**
   ```bash
   npx vercel alias ls
   ```

3. **Verify bundle hash on ALL domains**
   ```bash
   curl -sL https://app.connector-os.com | grep -o 'index-[^"]*\.js' | head -1
   curl -sL https://connector-os.com | grep -o 'index-[^"]*\.js' | head -1
   curl -sL https://www.connector-os.com | grep -o 'index-[^"]*\.js' | head -1
   ```

4. **Check for redirects**
   ```bash
   curl -sI https://connector-os.com | grep Location
   ```

### Files Modified (Jan 2025 — Deployment Reality)

| File | Changes |
|------|---------|
| `src/components/` | **Added to git** (was untracked) — 5 component files |
| `CLAUDE.md` | Added rules 10-12 to OPERATOR DOCTRINE |

### Key Doctrine Additions

- **Rule 10:** Git-First Debugging — if local works but prod fails, check git
- **Rule 11:** Platform Case Sensitivity — Windows is permissive, Linux is not
- **Rule 12:** Alias Reality Check — check aliases before debugging code

---

## Connector Agent — Email Finder/Verifier API (Jan 2025)

**Files:** `src/connector-agent/ConnectorAgent.tsx`, `connector-agent-backend/`
**Route:** `/connector-agent`
**Backend:** `https://api.connector-os.com` (Railway)

### What Is Connector Agent?

An email finder and verifier API for users. Find emails by name + domain, verify deliverability. Users get API keys and integrate with Make.com, n8n, Zapier.

### Architecture

```
Frontend (Vercel)          Backend (Railway)
┌────────────────┐         ┌─────────────────┐
│ ConnectorAgent │ ──────► │ Express + SQLite│
│    React UI    │         │  api.connector  │
│  /connector-   │         │    -os.com      │
│    agent       │         └─────────────────┘
└────────────────┘
```

### Backend Deployment (Railway)

**Why Railway?** Always-on server (was running via Cloudflare Tunnel on laptop).

**Steps:**
1. Make PORT configurable: `const PORT = process.env.PORT || 8000;`
2. Push to GitHub
3. Railway auto-deploys from GitHub
4. Set PORT in Railway environment variables
5. Update Cloudflare DNS: `api.connector-os.com` → Railway CNAME

**Key Files:**
- `connector-agent-backend/src/index.js` — Express server
- `connector-agent-backend/data/connector-agent.db` — SQLite database

### API Response Contract (Simplified)

**Old (verbose):**
```json
{ "success": true, "email": "john@company.com" }
{ "success": false, "error": "Not found" }
```

**New (clean):**
```json
{ "email": "john@company.com" }
{ "email": null }
```

**Frontend handles:**
```typescript
interface FindResult { email: string | null; }
interface VerifyResult { email: string | null; }
```

### Integrate Tab Design (Linear-style)

The Integrate tab provides zero-friction API documentation:

1. **Prominent API Key** — Violet gradient card at top with copy button
2. **Platform Tabs** — Make.com / n8n / Zapier selector
3. **Step-by-step instructions** — Numbered steps (1, 2, 3, 4)
4. **Copy buttons everywhere** — URL, headers, body, auth token
5. **Response example** — Green highlight showing expected output
6. **Verify endpoint note** — Secondary endpoint at bottom

### Common Issues (Connector Agent)

| Issue | Cause | Fix |
|-------|-------|-----|
| **Blank page after deploy** | Icon removed from imports but still used in code | Check ALL usages before removing import |
| **`Zap is not defined`** | Removed Zap import but Integrate tab uses it | Add back to Lucide imports |
| **`Fingerprint is not defined`** | Same pattern — removed import, still referenced | Replace ALL usages or keep import |
| **Copy button copies empty** | `api.getApiKey()` returns empty after session | Show alert if key unavailable |
| **Railway port mismatch** | Railway assigns PORT, must match networking config | Set PORT env var in Railway dashboard |

### The Lucide Icon Bug Pattern

**This bug cost 2+ hours. Document it.**

```typescript
// WRONG - remove import but icon still used elsewhere
import { Eye } from 'lucide-react';  // Removed Fingerprint
// ...
<Fingerprint className="w-4 h-4" />  // RUNTIME ERROR: Fingerprint is not defined

// FIX - search for ALL usages before removing ANY import
// Use Ctrl+F or grep: grep -n "Fingerprint" src/connector-agent/ConnectorAgent.tsx
```

**Rule:** Before removing ANY import, search the entire file for usages. The bundler won't catch runtime errors from JSX usage.

### Vercel Deployment Checklist (MUST FOLLOW)

1. **git add** the changed files
2. **git commit** with descriptive message
3. **git push origin master** — Vercel won't see uncommitted changes!
4. **npx vercel --prod --yes** — Deploy
5. **npx vercel alias <URL> app.connector-os.com** — Alias domain 1
6. **npx vercel alias <URL> connector-os.com** — Alias domain 2

**Critical:** `vercel --prod` creates deployment but does NOT auto-update domain aliases. You MUST run alias commands or users see old version.

### Files Modified (Jan 2025 — Connector Agent)

| File | Changes |
|------|---------|
| `connector-agent-backend/src/index.js` | Made PORT configurable for Railway |
| `src/connector-agent/ConnectorAgent.tsx` | New Integrate tab with Linear-style docs, fixed API response handling, fixed copy button, Eye icon |
| `src/Launcher.tsx` | Changed description, Eye icon |
| `src/App.tsx` | Updated ComingSoon description |

### Key Takeaways

- **Always search before removing imports** — JSX usage causes runtime errors, not build errors
- **Railway needs PORT env var** — Don't hardcode, use `process.env.PORT`
- **Simplify API contracts** — `{ email: "..." }` beats `{ success: true, email: "..." }`
- **Git-first deployment** — Must commit+push before Vercel sees changes
- **Always alias after deploy** — `vercel --prod` alone doesn't update domains

---

## Connector Agent — Stripe-Grade Bulk Performance (Feb 2025)

**Files:** `connector-agent-backend/src/hedgedVerify.js`, `connector-agent-backend/src/bulkScheduler.js`

### The Problem

Bulk email verification was slow/stalling:
- Relay-first strategy waited for relay timeouts (7-20s) before falling back to PRX2
- BULK_POOL_SIZE = 5 (severe bottleneck)
- No provider-aware routing (Google, Mimecast blocked SMTP)
- No circuit breaker (slow domains compounded delays)
- Frontend timeout loops at 90s created retry hell

### The Solution

Implemented **hedged requests + provider routing + circuit breaker + layered concurrency**:

| Component | Purpose | File |
|-----------|---------|------|
| **Hedged Requests** | Start relay, then PRX2 after 400ms if relay delayed | hedgedVerify.js |
| **Provider Routing** | Skip relay for SMTP-hostile providers (Google, Proton, Mimecast) | hedgedVerify.js |
| **Circuit Breaker** | Auto-bypass slow domains (3 timeouts = 30min bypass) | hedgedVerify.js |
| **Layered Concurrency** | Global (25) + per-domain (2) + per-provider caps | bulkScheduler.js |
| **Per-Item Budget** | 12s max per contact (fail-fast, no stalls) | hedgedVerify.js |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BULK_GLOBAL_CONCURRENCY` | 25 | Global max concurrent verifications |
| `BULK_DOMAIN_CONCURRENCY` | 2 | Max concurrent per domain (prevent greylisting) |
| `BULK_GOOGLE_CONCURRENCY` | 5 | Max concurrent for Google domains |
| `BULK_MICROSOFT_CONCURRENCY` | 10 | Max concurrent for Microsoft domains |
| `BULK_GATEWAY_CONCURRENCY` | 5 | Max concurrent for security gateways |
| `BULK_UNKNOWN_CONCURRENCY` | 5 | Max concurrent for unknown providers |
| `HEDGE_DELAY_MS` | 400 | Delay before starting PRX2 hedge |
| `BULK_ITEM_BUDGET_MS` | 12000 | Max time per contact (12s) |

**Set in Railway environment variables for production.**

### Provider Routing Rules

| Provider | Behavior (Bulk) | Behavior (Single) | Reason |
|----------|----------------|------------------|--------|
| Google, Proton | PRX2 only (skip relay) | PRX2 only | SMTP blocking |
| Mimecast, Proofpoint, Barracuda | PRX2 only (skip relay) | PRX2 only | Security gateways |
| Microsoft, Zoho, Fastmail | Hedged (relay + PRX2) | Relay → PRX2 fallback | SMTP-friendly |
| Unknown/Custom | Hedged (relay + PRX2) | Relay → PRX2 fallback | Unknown behavior |

### Circuit Breaker Logic

**Triggers:**
- 3+ timeouts within window → OPEN (30min bypass)
- Timeout rate > 20% over last 20 samples → OPEN
- EMA latency > 4000ms AND count >= 3 → OPEN

**When OPEN:**
- Bulk: PRX2 only (no relay attempt)
- Single: PRX2 only (reduce user pain)
- Auto-closes after 30 minutes
- Logs: `[CircuitBreaker] OPEN: domain (timeouts=3, rate=25.0%, ema=4500ms) bypass_ttl=30m`

**Decay:**
- Every 50 samples, reduce timeout count by 1
- Every 10 minutes, cleanup stale domains (cap at 5000)

### Admin Endpoints

**GET /admin/circuit-breaker**
Headers: `x-admin-secret: <ADMIN_SECRET>`
Response:
```json
{
  "bypassed_domains": [
    { "domain": "slow-domain.com", "timeouts": 3, "emaMs": 4500, "bypassRemaining": "28m" }
  ],
  "config": {
    "global_concurrency": 25,
    "per_domain_concurrency": 2,
    "hedge_delay_ms": 400,
    "item_budget_ms": 12000
  }
}
```

**DELETE /admin/circuit-breaker/:domain**
Clear circuit breaker for domain or all:
```bash
curl -X DELETE https://api.connector-os.com/admin/circuit-breaker/slow-domain.com \
  -H "x-admin-secret: <secret>"

curl -X DELETE https://api.connector-os.com/admin/circuit-breaker/all \
  -H "x-admin-secret: <secret>"
```

### Validation Checklist

**After deployment:**
1. Run bulk find on 900 contacts
2. Observe no 90s frontend timeouts (should complete in 3-8 minutes)
3. Check logs for bypass events: `grep CircuitBreaker railway.log`
4. Confirm relay/PRX2 routing: `grep "SMTP-hostile provider" railway.log`
5. Verify concurrency caps: `grep "global=" railway.log`

**Expected behavior:**
- Google domains → PRX2 directly (no relay attempt)
- Microsoft domains → relay first, PRX2 hedge after 400ms
- Slow domains → circuit breaker OPEN after 3 timeouts, PRX2 only

### Performance Metrics

| Metric | Before | After |
|--------|--------|-------|
| **Concurrency** | 5 | 25 (5x) |
| **Per-domain cap** | None | 2 (prevent greylisting) |
| **Provider routing** | No | Yes (skip relay for Google/Mimecast) |
| **Circuit breaker** | No | Yes (auto-bypass slow domains) |
| **Hedging** | No | Yes (relay + PRX2 race) |
| **Estimated bulk time (900 contacts)** | 22+ minutes | 3-8 minutes |

### Tests

Run tests:
```bash
cd connector-agent-backend
node test/hedgedVerify.test.js
```

Tests validate:
- Provider routing (Google = SMTP-hostile, Microsoft = relay-preferred)
- Circuit breaker (3 timeouts → bypass for 30min)
- Concurrency caps (global + per-domain + per-provider)
- Hedged request (relay → PRX2 delay → race)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Bulk Find/Verify                         │
│                 (scheduledBulkProcess)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├─► Global concurrency cap (25)
                  ├─► Per-domain concurrency cap (2)
                  └─► Per-provider concurrency cap (5-10)
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    hedgedVerify()                           │
│                                                             │
│  1. Check provider (getMxProvider)                         │
│  2. SMTP-hostile? → PRX2 only (skip relay)                │
│  3. Circuit breaker open? → PRX2 only (skip relay)        │
│  4. Else: Hedged request                                   │
│     - Start relay immediately                              │
│     - After 400ms: start PRX2 (if relay still pending)    │
│     - Race for first definitive verdict                    │
│  5. Record domain performance (circuit breaker stats)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Files Modified

| File | Changes |
|------|---------|
| `hedgedVerify.js` | **NEW** — Hedged requests, provider routing, circuit breaker |
| `bulkScheduler.js` | **NEW** — Layered concurrency scheduler |
| `index.js` | Integrated hedgedVerify + scheduledBulkProcess into bulk endpoints |
| `test/hedgedVerify.test.js` | **NEW** — Unit tests for hedging + circuit breaker |

### Doctrine Adherence

**Zero API contract changes:**
- `/find-bulk` response format unchanged
- `/verify-bulk` response format unchanged
- Quota billing semantics unchanged

**Graceful degradation:**
- If scheduledBulkProcess fails → fallback to simple pool
- If provider detection fails → treat as 'unknown', hedge anyway
- If circuit breaker logic errors → fail-open (don't block verification)

**No quota loopholes:**
- Hedging = 1 API call wins, loser ignored
- Only bill once per email (winner charges token)
- Circuit breaker bypass uses PRX2 (still charges)

---

## API Key Doctrine (CRITICAL)

**One-line rule: If the user can't act on it, they should never see it.**

### 1. Secrets are write-once

- If a secret was not just generated, it does not exist to the user
- Prefixes are metadata, not affordances
- Never show "key exists but isn't accessible"

### 2. The UI never reflects backend uncertainty

- If the UI cannot act on something, it must not display it
- "Exists but unavailable" is an illegal state
- DB knowing a key exists ≠ user having access to it

### 3. Invalid states are deleted, not explained

- No warnings
- No amber cards
- No "you need to regenerate because…"
- The system simply presents the next valid action

### 4. Two states only

```
NO_KEY  → Show "Generate API Key"
HAS_KEY → Show key + Copy + Revoke
```

Nothing else is allowed.

### 5. Regeneration is not recovery

- Revoke ≠ retrieve
- Revoke always leads to Generate
- The past is intentionally inaccessible

### 6. Operator UX > informational UX

- Operators don't want explanations — they want motion
- If something can't be done, remove it
- Clean systems delete invalid states — they don't explain them

### The Mistake Pattern (Never Repeat)

**Wrong:** Patch confusion with UX (warnings, explanations, multi-step flows)
**Right:** Enforce the correct invariant (two states, no exceptions)

---

## Claude Operating Rules (Meta)

### Global Invariants

1. Never change classification logic unless explicitly instructed
2. Never modify Flow, Matching, or Routing unless asked
3. No "fixes" before an audit is complete and approved
4. When uncertain, STOP and ask for clarification

### Fail-Fast Rule

If any instruction conflicts with GLOBAL INVARIANTS, STOP. Do not continue. Ask one clarifying question.

### Banned Behaviors

- Over-eager fixing
- Refactoring beyond scope
- "Nice-to-have" improvements
- Polite agreement without constraint analysis
- Adding UX to explain broken invariants

### Rules of Hooks (React)

**Never conditionally return before hooks. Gate behavior, not hooks.**

```typescript
// WRONG - violates Rules of Hooks
if (!user) return <Placeholder />;
const [state, setState] = useState(); // Hook order changes between renders

// RIGHT - hooks always called, gate rendering after
const [state, setState] = useState();
if (!user) return <Placeholder />;
```

### Mental Model

Treat Claude like: **a brilliant junior operator with zero context permanence**

- It will execute perfectly inside a box
- It will hallucinate confidently outside it
- Your job is to shrink the box, not repeat yourself

---

## Prebuilt Markets — API Intelligence (Feb 2025)

### Source of Truth

This section is the canonical reference for the Markets data pipeline. Do NOT search the web for Instantly API docs. Do NOT guess parameters. Everything is here.

### The Data Pipeline

```
SuperSearch (free, any account)
  → 50 leads per call with companyId
  → /leadsy/company/{companyId} (shared JWT)
  → description, funding, news, tech stack, employee count, locations, jobs
  → Full NormalizedRecord with REAL signals
```

### Three Endpoints (All Built)

**1. POST /markets/search** — Lead search
- Client sends: `{ apiKey, newsFilter, industryFilter, jobListingFilter, fundingFilter, revenueFilter, showOneLeadPerCompany }`
- Server hits: `https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch`
- Auth: member's own Instantly API key (Bearer token)
- Returns: `{ data: [...leads], total_count, redacted_count, daily_remaining }`
- **Hard cap: 50 leads per call. Free or paid, doesn't matter.**
- **Same filters, same call = same 50 leads. Deterministic. No pagination.**

**2. POST /markets/company** — Single company enrichment
- Client sends: `{ companyId }`
- Server hits: `https://app.instantly.ai/leadsy/api/v1/company/{companyId}`
- Auth: shared workspace JWT (`x-auth-jwt` + `x-from-instantly: true`). **JWT never leaves server. Stable 2+ years across 200 members.**
- Returns: `{ company: { name, description, employee_count, industries, locations, funding, news, technologies, jobs, keywords } }`

**3. POST /markets/enrich-batch** — Batch company enrichment
- Client sends: `{ companyIds: [id1, id2, ...] }`
- Same as above but batched with 100ms delay + 24h in-memory cache
- Returns: `{ companies: { "id1": {...}, "id2": {...} } }`

### Lead Fields (from search)

```
firstName, lastName, fullName, jobTitle, location,
linkedIn, companyName, companyLogo, companyId
```

### Company Fields (from enrichment)

```
name, description, employee_count
industries: [{ name, id, primary }]
locations: [{ address, is_primary, inferred_location: { locality, admin_district, country_region, country_iso } }]
funding: [{ amount, type, date }]
news: [{ title, date, type }]  ← 50+ items with types: launches, partners_with, recognized_as, hires, etc.
technologies: [{ name, type }]  ← full tech stack
jobs: [{ title, location, date }]  ← hundreds of actual job listings
keywords: { linkedIn_Data, bright_data, website_Data }
```

### jobListingFilter Discovery

- **Case-sensitive.** `"Software Engineer"` → 2,955 results. `"software engineer"` → 12 results.
- **Works on free accounts.** The $9 Hypergrowth plan only buys the UI filter. The API accepts jobListingFilter regardless of plan.
- **Free vs paid difference:** Free has redacted results (hidden leads). Paid has 0 redacted. But both return 50 full leads per call.

### Stress Test Results (Free Account)

| Metric | Result |
|--------|--------|
| Success rate | 100% (35/35 calls) |
| Rate limits hit | 0 |
| Avg response time | ~2.1s |
| Slowest call | 9.1s |
| Credits consumed | 0 (preview is free) |

### Query Results (Verified)

| Query | Total | Redacted (free) |
|-------|-------|-----------------|
| "Software Engineer" alone | 2,884–2,955 | 5,270 (free) / 0 (paid) |
| "Software Engineer" + hires + Software & Internet | 470–482 | 954 (free) / 0 (paid) |
| "Registered Nurse" + hires + Healthcare | 468 | — |
| "Account Executive" + increases_headcount_by | 338 | — |

### The 50-Lead Cap Problem

- 50 per call. No skip, offset, page, limit, cursor param works. All tested, all ignored.
- Same filters = same 50. Deterministic.
- **Only way to get >50 unique leads: vary the filters between calls.**
- Title-splitting strategy: same signal filters, rotate `title.include` groups across calls → different 50 each time.

### Backend Location

- File: `connector-agent-backend/src/index.js`
- Search endpoint: ~line 1956
- Company endpoint: ~line 2093
- Enrich-batch endpoint: ~line 2148
- JWT env var: `MARKETS_COMPANY_JWT` (set on Railway, not local)
- Daily cap: 5,000 leads/day per API key (our own limit, tracked in SQLite `markets_usage`)

### Frontend Location

- Service: `src/services/MarketsService.ts`
- Page: `src/PrebuiltMarkets.tsx`
- Settings modal: `src/components/PrebuiltIntelligence.tsx` (MarketsModal — unchanged)

### Market Presets — Canonical Template

**Reference implementation: Wealth Management** (`src/constants/marketPresets.ts`)

All future markets must follow this structure:

| Element | Pattern |
|---------|---------|
| **Positioning** | "When [trigger] — [supply players] get paid, you sit in the middle." |
| **Demand packs (3)** | One economic trigger each. Event-driven, not industry-driven. |
| **Supply packs (3)** | One monetization role each. Role-driven, industry-scoped. |

**Demand pack anatomy:**
- Name = economic event (Liquidity Events, Founder Transition, Growth Windfall)
- Signals = exact API IDs mapping to the trigger
- Titles = decision-makers only (CEO, Founder, CFO, Owner)
- No industry filter — events cross industries

**Supply pack anatomy:**
- Name = who gets paid (RIAs, Family Offices, M&A Advisors)
- Signals = activity signals (signs_new_client, partners_with, hires)
- Industries = scoped to supply's vertical
- Titles = senior operators (Managing Partner, Principal, MD)

**Rules:**
1. Packs contain only essential filters — no noise, no padding
2. Ontology (side, market, packId, origin) stamped at ingestion, write-once
3. Signals are interpreted, never rewritten
4. Supply capability drives intro framing — AI must NOT infer from description
5. keywordsExclude always filters noise actors
6. titleExclude always filters junior titles

### Rules

1. **Never search the web for Instantly API docs.** Everything is reverse-engineered and documented here.
2. **Never expose the shared JWT to the client.** It stays server-side only.
3. **Never assume pagination exists.** 50 per call is final.
4. **jobListingFilter is case-sensitive.** Always capitalize properly.
5. **The backend code IS the documentation.** Read `index.js`, don't guess.
