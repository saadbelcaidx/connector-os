# CONTEXT RECOVERY — STRATEGIC ALIGNMENT PLATFORM

> **IF CONVERSATION COMPACTS**: Read this file FIRST, then main spec.
> **MAIN SPEC**: `__STRATEGIC_ALIGNMENT_PLATFORM_SPEC.md`
> **LAST UPDATED**: February 2025

---

## QUICK SUMMARY

**What**: White-labeled platform for SSM members to close deals on live calls.
**Access**: SSM-gated (like Msg Simulator, Inbound)
**URL**: `app.connector-os.com/platform/{member-slug}`

---

## SSM GATING (4 LAYERS)

| Layer | Check |
|-------|-------|
| **Database RLS** | `ssm_access.status = 'approved'` |
| **Edge Functions** | `checkSSMStatus(userId)` → 403 if not SSM |
| **Frontend UI** | `isSSM ? <Component /> : <LockedFeature />` |
| **Routing** | `<SSMGate featureName="Strategic Alignment Platform">` |

```tsx
// Pattern from existing SSM features
<Route
  path="/platform/:slug"
  element={
    <PrivateRoute>
      <SSMGate featureName="Strategic Alignment Platform">
        <PlatformApp />
      </SSMGate>
    </PrivateRoute>
  }
/>
```

---

## ENTERPRISE NAMING CONVENTION

| Internal/Casual | Enterprise |
|-----------------|------------|
| Demo Tool | Strategic Alignment Platform |
| Demo Settings | Platform Configuration |
| Demo Analytics | Engagement Intelligence |
| Access | Network Access |
| Matches | Strategic Alignments |
| Leads/Contacts | Decision Makers |
| Results | Strategic Alignments |

---

## 10 GAPS FILLED

1. **Hybrid Mode** — Similar Companies API + Signal enrichment (Section 3.5)
2. **Free Signal Priority** — Priority 1 (free) → 2 (rate limited) → 3 (paid) (Section 3)
3. **Database Schemas** — Full table definitions for all signal sources (Section 10.5)
4. **Demand-Side Signals** — What to show when SUPPLY is on call (Section 2)
5. **Ranking Logic** — Composite score: signal count, freshness, strength, relevance (Section 8.5)
6. **Error States** — no_results, source_unavailable, rate_limited, network_error (Section 8.6)
7. **Loading Time** — Realistic < 4s with progress indicator (Section 8.7)
8. **Rate Limiting** — platform_rate_limits table + check function (Section 10)
9. **Mobile Responsive** — Breakpoints, 44px touch targets, font scaling (Section 6)
10. **Signal Badge Colors** — Full color mapping for all signal types (Section 8)

---

## 5 QUESTIONS ANSWERED

1. **Is member authenticated?** — YES, required for config loading + rate limiting
2. **Branding not configured?** — Force setup wizard before first use
3. **Slug conflicts?** — Availability check + auto-suggestions
4. **Onboarding flow?** — Settings → Test → Share → Go Live
5. **Analytics to track?** — Essential only: platform_accessed, search_executed, results_shown

---

## CURRENT PHASE STATUS

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | **PENDING APPROVAL** | DB migration, shell UI, CSS tokens, routing |
| Phase 2: Signal Router | Not started | Wire up signal sources, criteria form |
| Phase 3: Results Display | Not started | MatchCard, animations, enterprise language |
| Phase 4: White-Label | Not started | Config service, settings UI, brand application |

---

## iOS DESIGN REQUIREMENTS

### Colors
```css
--bg-primary: #000000;              /* True black */
--bg-card: rgba(255,255,255,0.05);  /* 5% white */
--bg-card-hover: rgba(255,255,255,0.08);
--text-primary: rgba(255,255,255,0.95);
--text-secondary: rgba(255,255,255,0.70);
--text-muted: rgba(255,255,255,0.40);
```

### Shadows (Light on Dark)
```css
--shadow-sm: 0 1px 2px rgba(255,255,255,0.03);
--shadow-md: 0 4px 12px rgba(255,255,255,0.06);
--shadow-lg: 0 8px 24px rgba(255,255,255,0.08);
```

### Touch Targets
```css
min-height: 44px;
min-width: 44px;
```

### Transitions
```css
transition: all 200ms ease;
```

### Border Radius
```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

---

## WHAT NOT TO DO (COMMON MISTAKES)

### Never Show
- Emails (preserves mystery)
- "Connector OS" branding (white-labeled)
- Contact info of any kind
- Phone numbers, LinkedIn URLs

### Never Use
- Casual language (Hey, Hi, Cool, Great)
- Emojis (Lucide icons only)
- "Leads", "Contacts", "Prospects"
- Dark shadows on black background

### Never Skip
- SSM check on any endpoint
- Rate limit enforcement
- Enterprise language mapping
- Touch target minimums (44px)

### Always Use
- "Strategic Alignments" not "Matches"
- "Decision Makers" not "Leads"
- "Analyzing..." not "Loading..."
- Light shadows on dark backgrounds

---

## KEY DATABASE TABLES

```sql
platform_configs       -- Member branding + slug
platform_analytics     -- Usage tracking
platform_rate_limits   -- 100/day limit
clinical_trials_companies
nih_grants
funded_startups
federal_contracts
job_signals
```

---

## KEY FILES

```
src/platform/
├── PlatformApp.tsx          # Main UI
├── ModeSelector.tsx         # Demand/Supply selector
├── CriteriaForm.tsx         # ICP input
├── SignalSourcePicker.tsx   # Source selection
├── ResultsDisplay.tsx       # Match cards
├── MatchCard.tsx            # Individual card
├── platform.css             # iOS tokens
├── types.ts                 # TypeScript interfaces
└── constants.ts             # Enterprise strings

src/services/
├── SignalRouter.ts          # Routes to sources
├── SimilarCompanies.ts      # Apollo API
├── HybridMatcher.ts         # Similar + Signals
├── PlatformConfigService.ts # Config CRUD
└── SignalSources/
    ├── ClinicalTrials.ts
    ├── NIHGrants.ts
    ├── FundedStartups.ts
    ├── FederalContracts.ts
    └── JobSignals.ts

supabase/functions/
├── platform-config/         # GET config by slug
├── platform-simulate/       # POST search
└── _shared/
    ├── http.ts              # CORS wrapper
    └── signal-router.ts     # Signal abstractions
```

---

## SIGNAL BADGE COLORS

| Signal | Icon | Color |
|--------|------|-------|
| Funding | TrendingUp | text-emerald-400 |
| Hiring | Users | text-blue-400 |
| Clinical | Heart | text-rose-400 |
| Grant | GraduationCap | text-amber-400 |
| Federal | Landmark | text-violet-400 |
| Patent | FileText | text-cyan-400 |
| Leadership | UserCheck | text-orange-400 |
| M&A | GitMerge | text-pink-400 |
| Tech Stack | Code | text-indigo-400 |
| Expansion | Building | text-teal-400 |

---

## BEFORE CODING

1. Read main spec: `__LIVE_DEMO_TOOL_SPEC.md`
2. Verify SSM gating pattern matches existing features
3. Confirm iOS design tokens
4. Check enterprise language mappings

---

**STATUS: Ready for Phase 1 approval**
