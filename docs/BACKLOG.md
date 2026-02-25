# BACKLOG.md — Connector OS Pending Tasks

> Read this BEFORE starting any work. Contains critical safety notes.

---

## CRITICAL: WORKTREE SAFETY

**Another Claude agent is actively working in the `keygen-v1` worktree.**

```
Active worktrees:
  C:/Users/Smart Hp/Desktop/connector os                    master
  .claude/worktrees/keygen-v1                               keygen-v1 branch
  .claude/worktrees/keygen-v1-work                          keygen-v1 branch
```

**Rules:**
- DO NOT push or deploy code from the keygen worktree to production
- DO NOT merge keygen-v1 into master without Saad's explicit approval
- Every `git push` and `vercel deploy` MUST only contain changes from YOUR session on YOUR branch
- Before pushing: `git diff --stat HEAD` — verify ONLY your changes are included
- If you see Station.tsx, operatorSession.ts, station/ranking.ts, types/station.ts in your diff and you didn't touch them — STOP and ask Saad

---

## BACKLOG ITEM 1: Instantly Location Filter (place_id fix)

**Priority:** High
**Status:** Investigated, IDs collected, ready to implement
**Reported by:** Members getting companies from Israel and other countries when filtering for US

### Problem
`src/PrebuiltMarkets.tsx` line 504 sends `place_id: ''` (empty string) to Instantly SuperSearch API. Instantly ignores the empty place_id and returns leads from ALL countries regardless of the location label.

```typescript
// CURRENT (BROKEN) — line 504 of src/PrebuiltMarkets.tsx
const locations = locationLabels.length > 0
  ? { include: locationLabels.map(label => ({ place_id: '', label })) }
  : undefined;
```

### Root Cause
Instantly uses **Google Places API IDs** for location filtering. Without a valid `place_id`, the filter is ignored.

### Fix
Build a `PLACE_IDS` map and look up the real `place_id` when building the locations filter.

### File to Change
`src/PrebuiltMarkets.tsx` — line 504 area (the `place_id: ''` line)

### Collected Place IDs (from Instantly's actual API requests — Google Places IDs)

| Country | place_id | Label |
|---------|----------|-------|
| United States | `ChIJCzYy5IS16lQRQrfeQ5K5Oxw` | United States |
| United Kingdom | `ChIJqZHHQhE7WgIReiWIMkOg-MQ` | United Kingdom |
| France | `ChIJMVd4MymgVA0R99lHx5Y__Ws` | France |
| Germany | `ChIJa76xwh5ymkcRW-WRjmtd6HU` | Germany |
| Netherlands | `ChIJu-SH28MJxkcRnwq9_851obM` | Netherlands |
| UAE | `ChIJvRKrsd9IXj4RpwoIwFYv0zM` | United Arab Emirates |
| Canada | `ChIJ2WrMN9MDDUsRpY9Doiq3aJk` | Canada |
| Israel | `ChIJi8mnMiRJABURuiw1EyBCa2o` | Israel |
| Australia | `ChIJ38WHZwf9KysRUhNblaFnglM` | Australia |
| Austria | `ChIJfyqdJZsHbUcRr8Hk3XvUEhA` | Austria |
| Finland | `ChIJ3fYyS9_KgUYREKh1PNZGAQA` | Finland |
| Saudi Arabia | `ChIJQSqV5z-z5xURm7YawktQYFk` | Saudi Arabia |
| Mexico | `ChIJU1NoiDs6BIQREZgJa760ZO0` | Mexico |
| Sweden | `ChIJ8fA1bTmyXEYRYm-tjaLruCI` | Sweden |
| Italy | `ChIJA9KNRIL-1BIRb15jJFz1LOI` | Italy |
| Norway | `ChIJv-VNj0VoEkYRK9BkuJ07sKE` | Norway |
| Denmark | `ChIJ-1-U7rYnS0YRzZLgw9BDh1I` | Denmark |
| Singapore | `ChIJdZOLiiMR2jERxPWrUs9peIg` | Singapore |
| New Zealand | `ChIJh5Z3Fw4gLG0RM0dqdeIY1rE` | New Zealand |

**City-level IDs also work:**
| Location | place_id | Label |
|----------|----------|-------|
| Union, NJ | `ChIJm6qdb5-tw4kRTAVvGSoycAU` | Union, NJ, USA |
| Germantown, MD | `ChIJaVb1SHUrtokRhQqCsheruOE` | Germantown, MD, USA |

### Still Needed (if Saad collects more)
- India, Switzerland, Ireland, Spain, Japan, Brazil, South Korea
- South Africa, Belgium, Poland, Portugal

### Implementation Plan
1. Add `COUNTRY_PLACE_IDS: Record<string, string>` map in PrebuiltMarkets.tsx
2. When building locations filter, look up `place_id` from the map using the label
3. If label not in map, fall back to `place_id: ''` (current behavior — no worse)
4. Log warning when a label has no matching place_id so we know to add it

---

## BACKLOG ITEM 2: Missing Company Descriptions (Intro Quality)

**Priority:** High
**Status:** Reported, needs investigation
**Reported by:** Members saying intro quality is bad

### Problem
Members report that AI-generated intros are sometimes low quality. Root cause: some companies returned by Instantly SuperSearch have **no company description** after enrichment. When the description is missing, the AI has nothing substantive to work with, producing generic/weak intros.

### Investigation Needed
1. Check how often `company.description` is null/empty after `enrichCompanies()` in PrebuiltMarkets.tsx
2. Trace the enrichment path: `POST /markets/company/{id}` → what fields come back
3. Determine if there's a **hidden/alternative API** that can provide descriptions when the primary enrichment returns none
4. Check if Instantly has additional company data endpoints not currently used
5. Consider fallback: if no description from enrichment, try Apollo/Clearbit/other source for company description

### Files Involved
- `src/services/MarketsService.ts` — `normalizeToRecord()` line 232: `const description = company?.description || null`
- `connector-agent-backend/src/index.js` — `/markets/company/:id` endpoint
- `src/PrebuiltMarkets.tsx` — `enrichCompanies()` call at line 548

### Impact on Intros
- `buildWhy()` in Flow.tsx uses `signalMeta.label` which falls back to evidence chains
- Evidence chain (MarketsService.ts line 244-260): news title → job title → funding → industry → signal label
- If company has no description AND no news/jobs/funding, evidence degrades to just "Growing in [industry]" or bare signal label
- This produces 1-word or generic evidence → weak intro framing

---

## SESSION LOG: 2026-02-25 — Flow Dead-End Fixes + Location Investigation

### What Was Done (master branch)
1. **Fix: Silent AI config skip** — `src/Flow.tsx` line 2557. When `introAIConfig` is null, Phase 2 silently skipped all items. Now sets `aiFailureReason` and `fallbackWarning`. Commit `f6a61c4`.

2. **Fix: Dead-end screen at route_context** — `src/Flow.tsx`. When `introPairCount === 0` but emails exist, no buttons rendered. Added catch-all block with diagnostic message + "Try another batch" button. Commit `90eb962`.

3. **Fix: 1-word evidence bug** — `src/Flow.tsx` line 1679. `buildWhy()` returned single words like "Growth" for GROWTH signals, failing the multi-word gate (`!evidence.includes(' ')`). Now guarantees multi-word: `is showing ${label}`. Commit `90eb962`.

4. **Fix: Misleading "ready to send" copy** — Changed to "emails found". Commit `90eb962`.

5. **Fix: Pre-flight AI config check at Generate button** — Shows red diagnostic card when AI config missing, disables Generate button. Commit `90eb962`.

6. **Investigated: Instantly location filtering** — Identified `place_id: ''` as root cause. Collected 7 Google Places IDs from Instantly's actual API. Documented in Backlog Item 1 above.

### Commits on Master
- `f6a61c4` — fix: surface missing AI config instead of silent intro generation skip
- `90eb962` — fix: eliminate dead-end screen + 1-word evidence bug in Flow send path

### Deployed
- All 3 domains: app.connector-os.com, connector-os.com, www.connector-os.com

---
