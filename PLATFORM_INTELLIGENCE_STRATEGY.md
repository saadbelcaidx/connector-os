# Platform Intelligence — Build Strategy

> This document is the source of truth for building Platform Intelligence.
> Read this FIRST if conversation was compacted.

---

## WHAT WE'RE BUILDING

**Real-time intelligence for live sales calls.**

The connector is on a call. Prospect describes what they need. Connector types the ICP. System shows 3-4 REAL companies with LIVE signals. Connector shares screen. Prospect sees it. "Wow."

**The moment:** Prospect sees real company names with real signals and thinks "they actually have access to this?"

---

## THE USE CASE (Tested & Validated)

**Prospect on call:**
> "We're a multi-family office out of Greenwich. $2B AUM. Looking for fund managers who specialize in private credit for middle-market healthcare companies. $10-50M deals."

**System returns (tested with real APIs):**

| Company | Focus | Live Signal |
|---------|-------|-------------|
| Solgen Capital | $10-50M healthcare credit | — |
| CRG | $4B healthcare private credit | Deal activity |
| Monroe Capital | Middle market healthcare | **Hiring healthcare originator TODAY** |
| Comvest | Healthcare lending | — |

**Connector says:** "Yeah, I know a few groups in that space. Some of them are actively looking for deals right now. What's your timeline?"

---

## DESIGN PRINCIPLES

**NOT a SaaS tool. An intelligence radar.**

| Element | NOT this | THIS |
|---------|----------|------|
| Background | White/gray | Near-black (#08090a) |
| Colors | Orange CTAs | Muted blue for signals |
| Buttons | "Search", "Export" | Almost none visible |
| Feel | "We built this for you!" | "This is what we track" |
| First impression | Loading... | Results already there |

**The prospect should think:** "Holy shit, they have access to this?"
**NOT:** "Oh, they're using some lead gen tool on me"

---

## VISION FILE

**Location:** `platform-vision.html`

- Dark radar aesthetic
- Company nodes as points on a map
- One node pulses (live signal) — use BLUE not orange
- Detail panel slides in on click
- Minimal UI — no chrome
- Bottom bar shows query context

---

## API INTEGRATIONS (Tested & Working)

### Exa (Semantic Search)
```
POST https://api.exa.ai/search
Headers: x-api-key: {key}
Body: { query, numResults, type: "neural", contents: { text: true } }
```
- Returns companies matching ICP description
- Tested with wealth management query — works perfectly

### PredictLeads (Company Intel)
```
Base: https://predictleads.com/api/v3/companies/{domain}
Headers: X-Api-Key, X-Api-Token
```

**Working endpoints:**
- `/companies/{domain}` — Profile, description, location, lookalikes
- `/companies/{domain}/job_openings` — Hiring signals (CRITICAL)
- `/companies/{domain}/news_events` — Deals, launches, partnerships
- `/companies/{domain}/financing_events` — Funding data
- `/companies/{domain}/technology_detections` — Tech stack

### Apollo (Decision Makers)
```
POST https://api.apollo.io/v1/mixed_people/search
Headers: X-Api-Key: {key}
Body: { q_organization_domains, person_seniorities, per_page }
```

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND                                 │
│  Intelligence.tsx — Single component, radar UI               │
│                                                              │
│  State:                                                      │
│  - query (what user typed)                                   │
│  - results (companies from Exa)                              │
│  - selectedCompany (for detail panel)                        │
│  - companyIntel (from PredictLeads)                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 EDGE FUNCTION                                │
│  platform-intelligence/index.ts                              │
│                                                              │
│  1. Receive query + user's API keys (BYOK)                   │
│  2. Call Exa semantic search                                 │
│  3. AI extracts company names/domains from results           │
│  4. Return structured companies                              │
│                                                              │
│  NOTE: PredictLeads calls happen CLIENT-SIDE on click        │
│  (avoids latency on initial search)                          │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** PredictLeads is called AFTER user clicks a company node. Not during initial search. This keeps initial response fast (<3s).

---

## IMPLEMENTATION PLAN

### Phase 1: Clean Slate
- [ ] Remove broken PredictLeads service (DONE — was causing issues)
- [ ] Start fresh with IntelligenceService.ts (SCAN only)
- [ ] Verify edge function works with confidence fix

### Phase 2: Frontend — Radar UI
- [ ] Create new Intelligence.tsx based on vision HTML
- [ ] Dark background, radar rings, grid
- [ ] Company nodes positioned on "map"
- [ ] Signal indicator (blue pulse) for companies with live signals
- [ ] Bottom context bar
- [ ] No visible buttons/chrome

### Phase 3: Search Flow
- [ ] Input field (minimal, maybe just appears on focus)
- [ ] On Enter: call edge function
- [ ] Results populate as nodes
- [ ] Animate nodes appearing

### Phase 4: Detail Panel
- [ ] On node click: show detail panel
- [ ] Call PredictLeads endpoints for that domain
- [ ] Show: description, signal, decision maker
- [ ] Panel slides in from right

### Phase 5: Apollo Integration
- [ ] After PredictLeads loads, fetch decision maker
- [ ] Show name + title in detail panel
- [ ] No email visible (that's for later)

### Phase 6: Polish
- [ ] Smooth animations
- [ ] Loading states (subtle, not spinners)
- [ ] Error handling (silent, graceful)
- [ ] Mobile responsive (if needed)

---

## WHAT NOT TO DO

**Lessons from previous session:**

1. **Don't jump to building without testing APIs first**
   - We tested Exa, PredictLeads, Apollo — all work
   - Test with REAL hard queries (wealth management)

2. **Don't add features before core works**
   - PredictLeads PROFILE mode was added before SCAN worked
   - Result: broke everything, had to revert

3. **Don't patch without diagnosis**
   - Confidence threshold changes without understanding why extraction failed
   - Always AUDIT first, then fix

4. **Don't forget property names**
   - `.domain` vs `.companyDomain` bug
   - Always check types.ts for correct field names

5. **Don't deploy without testing locally**
   - Edge function changes should be tested
   - Use curl/PowerShell to test endpoints directly

---

## API KEYS (For Testing)

```
Exa: 0e6e07a9-8646-4025-af19-78a20b1aa57b
Apollo: Gv-UsR3HkLq8zdC2cbqn_Q
PredictLeads Key: pu4kx_ud-xgxccubw8t-
PredictLeads Token: pfZ-DwXkixzzsdxTXyjg
```

---

## FILES TO MODIFY

| File | Purpose |
|------|---------|
| `src/platform/Intelligence.tsx` | Main UI — rebuild based on vision |
| `src/platform/IntelligenceService.ts` | API calls — keep SCAN only for now |
| `src/platform/types.ts` | Type definitions |
| `supabase/functions/platform-intelligence/index.ts` | Edge function — already has confidence fix |
| `src/Settings.tsx` | API key configuration (Exa, PredictLeads) |

---

## SUCCESS CRITERIA

1. User types ICP query
2. Within 3 seconds, 3-4 company nodes appear
3. At least one shows a signal (blue pulse)
4. Click reveals detail panel with intel
5. Prospect on call thinks "they have access to this?"

---

## CURRENT STATE

- [x] APIs tested and working
- [x] Vision HTML created
- [x] Strategy documented
- [ ] PredictLeads service removed (needs cleanup)
- [ ] Frontend rebuild needed
- [ ] Edge function deployed with confidence fix

**Next step:** Clean up broken code, then rebuild frontend based on vision.

---

## COLOR CHANGE

**Signal color:** Change from orange (#f59e0b) to blue (#3b82f6)

Update in:
- `platform-vision.html`
- `Intelligence.tsx` (when built)

---

*Last updated: Feb 2, 2025*
*Do NOT build without reading this document first.*
