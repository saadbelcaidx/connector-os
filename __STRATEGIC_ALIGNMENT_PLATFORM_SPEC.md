# STRATEGIC ALIGNMENT PLATFORM — FINAL SPECIFICATION

> **PURPOSE**: Access-controlled network intelligence platform for SSM members.
> **IF CONTEXT COMPACTS**: Re-read this file.
> **LAST UPDATED**: February 2025
> **STATUS**: 100% COMPLETE — Ready to build
> **ACCESS**: SSM-gated (Super Seat Membership required)

---

## 0. ACCESS CONTROL (SSM-GATED)

### Overview
Strategic Alignment Platform is an SSM-exclusive feature, like Msg Simulator and Inbound.
Non-SSM users see a locked feature preview with upgrade CTA.

### 4-Layer Enforcement

**Layer 1: Database (RLS)**
```sql
-- Only SSM members can access platform configs
CREATE POLICY "platform_configs_ssm_only" ON platform_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ssm_access
      WHERE ssm_access.email = auth.jwt()->>'email'
      AND ssm_access.status = 'approved'
    )
  );
```

**Layer 2: Edge Functions**
```typescript
// supabase/functions/platform-simulate/index.ts
async function checkSSMStatus(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('ssm_access')
    .select('status')
    .eq('user_id', userId)
    .single();

  return data?.status === 'approved';
}

// Return 403 if not SSM
if (!await checkSSMStatus(userId)) {
  return errorResponse(
    'SSM_REQUIRED',
    'Strategic Alignment Platform requires Super Seat Membership',
    403
  );
}
```

**Layer 3: Frontend UI**
```tsx
// Settings.tsx
{isSSM ? (
  <PlatformConfiguration />
) : (
  <LockedFeature
    title="Strategic Alignment Platform"
    description="Access-controlled network intelligence for client engagements"
    upgradeUrl="/ssm"
  />
)}
```

**Layer 4: Routing**
```tsx
// App.tsx
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

### Enterprise Language
| Internal/Casual Term | Enterprise Term |
|---------------------|-----------------|
| Demo Tool | Strategic Alignment Platform |
| Demo Settings | Platform Configuration |
| Demo Analytics | Engagement Intelligence |
| Access | Network Access |
| Matches | Strategic Alignments |
| Tool | Platform |

---

## 1. THE PROBLEM WE'RE SOLVING

Member is on a call with a prospect:
- Prospect: "How does this work?"
- Member needs to show REAL examples, not mockups
- Member shares screen
- **Problem**: If it says "Connector OS" → looks like they're using someone else's tool
- **Problem**: If member has to source their own supply → removes the magic

**What members need:**
- White-labeled platform (their brand, not ours)
- Fresh signal data (not stale contacts)
- Works for ANY niche (biotech, fintech, recruiting, etc.)
- Shows real decision makers with live signals
- No emails on screen (preserves mystery)

---

## 2. THE ARCHITECTURE

### Signal Router

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMBER ON CALL                           │
│         Inputs: Who prospect wants to reach                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    SIGNAL ROUTER                            │
│                                                             │
│   Routes to appropriate signal source(s) based on input:   │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │ Clinical     │  │ NIH Grants   │  │ Recently     │     │
│   │ Trials       │  │ Database     │  │ Funded       │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │ Federal      │  │ Job Signals  │  │ Funding      │     │
│   │ Contracts    │  │ (Hiring)     │  │ Rounds       │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│   │ SBIR/STTR    │  │ Hospital     │  │ Custom       │     │
│   │ Awards       │  │ Expansions   │  │ Sources...   │     │
│   └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              FRESH MATCHES WITH LIVE SIGNALS                │
│                                                             │
│   Name + Title + Company + Signal                          │
│   (NO EMAILS — preserves mystery)                          │
└─────────────────────────────────────────────────────────────┘
```

### Two-Way Flow

Member can't control who responds first. Tool works both ways:

| Prospect Type | What They Want | System Returns |
|---------------|----------------|----------------|
| **DEMAND** (company with need) | Service providers | Supply matches from signals |
| **SUPPLY** (service provider) | Companies to serve | Demand matches from signals |

### Demand-Side Signals (When SUPPLY is on call)

When a service provider (recruiter, consultant, agency) is on the call, they want to find companies to serve. The system shows demand signals:

| Signal Type | What It Indicates | Who It's For |
|-------------|-------------------|--------------|
| **Hiring signals** | Company needs talent | Recruiters, staffing agencies |
| **Funding signals** | Company has capital, will hire/scale | All service providers |
| **Clinical trials** | Biotech expanding R&D | Life sciences consultants |
| **Compliance hiring** | Company needs compliance help | Legal, compliance consultants |
| **Tech stack changes** | Company modernizing | Dev agencies, IT consultants |
| **Leadership gaps** | Company needs executive support | Executive recruiters, fractional execs |

**Example scenario:**
- Prospect: "I'm a recruiter specializing in biotech"
- System: Shows companies hiring in biotech + companies with recent funding (will hire soon)

```typescript
function getDemandSignals(supplyProfile: SupplyProfile): SignalSource[] {
  const { specialty, industries } = supplyProfile;

  // Recruiter sees hiring signals
  if (specialty === 'recruiting') {
    return ['job_signals', 'funded_startups']; // Hiring + will hire soon
  }

  // Consultant sees growth signals
  if (specialty === 'consulting') {
    return ['funded_startups', 'leadership_changes', 'tech_changes'];
  }

  // Legal/compliance sees regulatory signals
  if (specialty === 'legal') {
    return ['clinical_trials', 'federal_contracts', 'compliance_hiring'];
  }

  // Default: show all demand signals
  return ['job_signals', 'funded_startups', 'clinical_trials'];
}
```

---

## 3. SIGNAL SOURCES

### Currently Built
| Source | Data | Signals |
|--------|------|---------|
| Recently Funded Startups | Companies with new capital | Funding round, amount, date |
| NIH Grants | Research institutions | Grant amount, project, date |
| Federal Contracts | Government contractors | Contract value, agency |
| Clinical Trials | Biotech/pharma | Phase, condition, status |
| Job Postings | Companies hiring | Role, seniority, department |

### Future Sources (Pluggable)
- SBIR/STTR awards
- Hospital expansions
- Patent filings
- M&A activity
- Leadership changes
- Tech stack changes

### Niche → Signal Mapping
| Member Niche | Primary Signals |
|--------------|-----------------|
| Biotech/Pharma | Clinical trials, NIH grants, pharma hiring |
| VC/Startups | Recently funded, job growth, tech stack |
| Government | Federal contracts, SBIR/STTR |
| Recruiting | Job postings, hiring velocity |
| Healthcare | Hospital expansions, grants |
| Fintech | Funding rounds, compliance hiring |

### Source Priority (Free First)

Query free sources before paid sources. Saves cost, same quality.

| Priority | Sources | Cost | Rate Limit |
|----------|---------|------|------------|
| **1 (Free)** | NIH Reporter, ClinicalTrials.gov, SEC EDGAR, USPTO, FDA, SAM.gov | Free | None/generous |
| **2 (Rate Limited)** | Crunchbase News, LinkedIn Public | Free | Moderate limits |
| **3 (Paid)** | Apollo, Clearbit, ZoomInfo | Per-call | As needed |

**Logic:**
```typescript
async function querySignals(criteria: Criteria): Promise<Match[]> {
  // Try free sources first
  let results = await queryFreeSources(criteria);
  if (results.length >= 5) return results;

  // Try rate-limited sources
  if (await checkRateLimit('limited_sources')) {
    results = [...results, ...await queryLimitedSources(criteria)];
    if (results.length >= 5) return results;
  }

  // Paid fallback only if needed
  if (results.length < 3) {
    results = [...results, ...await queryPaidSources(criteria)];
  }

  return results;
}
```

---

## 3.5 HYBRID MODE (Similar Companies + Signals)

### The Problem
Member says: "I've worked with Company X, Y, Z before — find me more like them"

### The Solution
Combine Similar Companies API with live signals for qualified matches.

```
┌─────────────────────────────────────────────────────────────┐
│                  HYBRID MATCHING MODE                        │
│                                                              │
│   Step 1: Input 2-3 Example Companies                        │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Example partners you've worked with:                  │  │
│   │ [acme.com] [biotech-inc.com] [pharma-corp.com]       │  │
│   └──────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│   Step 2: Apollo Similar Companies API                       │
│   POST /v1/mixed_companies/search                            │
│   { "similar_to_domain": ["acme.com", "biotech-inc.com"] }  │
│                           ↓                                  │
│   Step 3: Enrich with Live Signals                          │
│   Cross-reference against signal sources                     │
│                           ↓                                  │
│   Result: Similar companies WITH active signals             │
└─────────────────────────────────────────────────────────────┘
```

### Apollo API Integration
```typescript
interface SimilarCompaniesRequest {
  similar_to_domain: string[];    // 2-3 example domains
  page_size?: number;             // Default 25
  organization_num_employees_ranges?: string[];
  organization_locations?: string[];
}

interface SimilarCompany {
  organization_name: string;
  primary_domain: string;
  industry: string;
  employee_count: number;
  similarity_score: number;
}

async function findSimilarWithSignals(
  exampleDomains: string[],
  signalSources: string[]
): Promise<HybridMatch[]> {
  // Step 1: Get similar companies from Apollo
  const similar = await apollo.similarCompanies({
    similar_to_domain: exampleDomains,
    page_size: 50
  });

  // Step 2: Check each against signal sources
  const withSignals = await Promise.all(
    similar.map(async (company) => {
      const signals = await querySignalsByDomain(company.primary_domain, signalSources);
      return signals.length > 0 ? { ...company, signals } : null;
    })
  );

  // Step 3: Return only those with active signals
  return withSignals.filter(Boolean);
}
```

### UI for Hybrid Mode
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     How would you like to identify targets?                  │
│                                                              │
│     ┌─────────────────────┐  ┌─────────────────────┐        │
│     │                     │  │                     │        │
│     │  Criteria-based     │  │  Similar to         │        │
│     │  Define ICP         │  │  companies I know   │        │
│     │                     │  │                     │        │
│     └─────────────────────┘  └─────────────────────┘        │
│                                                              │
│     ─────────── OR ───────────                              │
│                                                              │
│     ┌─────────────────────────────────────────────┐         │
│     │  Both: Similar + Signals (Recommended)      │         │
│     └─────────────────────────────────────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### When to Use Hybrid Mode
- Prospect says "I want companies like [Company X]"
- Member has successful case studies with specific companies
- Niche is too specific for keyword-based search

---

## 4. USER FLOW

### Step 1: Member Opens Tool
- URL: `app.connector-os.com/platform/{member-brand}`
- Shows member's logo, colors, company name
- Prospect sees branded tool, not Connector OS

### Step 2: Select Mode
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     Who is on the call with you?                           │
│                                                             │
│     ┌─────────────────────┐  ┌─────────────────────┐       │
│     │                     │  │                     │       │
│     │  Company looking    │  │  Provider looking   │       │
│     │  for providers      │  │  for clients        │       │
│     │                     │  │                     │       │
│     │  (DEMAND)           │  │  (SUPPLY)           │       │
│     └─────────────────────┘  └─────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Step 3: Input Criteria (Live on Call)
Prospect tells member what they want. Member inputs:

**If DEMAND on call** (looking for providers):
- What service do they need?
- Industry preference
- Company stage preference
- Geographic focus

**If SUPPLY on call** (looking for clients):
- What's their ICP?
- Industry they serve
- Company size they target
- Signals that matter (hiring, funding, etc.)

### Step 4: Select Signal Source
System auto-suggests based on input, or member selects:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     Select signal source                                    │
│                                                             │
│     ○ Recently Funded Startups                             │
│     ○ Clinical Trials (Phase 1-3)                          │
│     ○ NIH Grants & Awards                                  │
│     ○ Federal Contracts                                    │
│     ○ Companies Actively Hiring                            │
│     ○ All Sources                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Step 5: Show Results
3-5 real matches with live signals. NO EMAILS.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Identified 4 strategic alignments                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Sarah Chen                                         │   │
│  │  VP Business Development · Acme Therapeutics       │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ Phase 2 Clinical Trial · Expanding BD Team  │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Michael Torres                                     │   │
│  │  Chief Scientific Officer · BioGenix Labs          │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ $12M NIH Grant · Building Partnerships      │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Step 6: Member Closes
> "I can facilitate a warm intro to Sarah. She's actively expanding her BD team and looking for partners exactly like you."

Prospect thinks: "This person has ACCESS."

---

## 5. WHITE-LABEL BRANDING

### What Member Configures
| Field | Purpose |
|-------|---------|
| Brand name | Displayed in header |
| Logo URL | Displayed in header |
| Primary color | Buttons, accents |
| Subdomain/slug | URL path |

### What Prospect Sees
- Member's logo
- Member's brand name
- Member's colors
- NO "Connector OS" anywhere
- NO "Powered by" footer

### URL Structure
```
app.connector-os.com/platform/acme-partners
app.connector-os.com/platform/biotech-connect
app.connector-os.com/platform/venture-bridge
```

---

## 6. iOS DESIGN SYSTEM

### Colors — True Black Foundation
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#000000` | True black background |
| `--bg-card` | `rgba(255,255,255,0.05)` | Card backgrounds |
| `--bg-card-hover` | `rgba(255,255,255,0.08)` | Card hover |
| `--text-primary` | `rgba(255,255,255,0.95)` | Headlines |
| `--text-secondary` | `rgba(255,255,255,0.70)` | Body text |
| `--text-muted` | `rgba(255,255,255,0.40)` | Hints |

### Shadows — Light on Dark
| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(255,255,255,0.03)` |
| `--shadow-md` | `0 4px 12px rgba(255,255,255,0.06)` |
| `--shadow-lg` | `0 8px 24px rgba(255,255,255,0.08)` |

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Small elements |
| `--radius-md` | `8px` | Buttons |
| `--radius-lg` | `12px` | Cards |
| `--radius-xl` | `16px` | Large cards |

### Transitions
| Token | Value |
|-------|-------|
| `--transition-fast` | `150ms ease` |
| `--transition-base` | `200ms ease` |

### Mobile Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Desktop | 1024px+ | 2-3 column grid, full sidebar |
| Tablet | 768px-1023px | 2 column grid, collapsed sidebar |
| Mobile | < 768px | Single column, bottom nav, stacked cards |

### Touch Targets (WCAG 2.1 Compliance)

```css
/* Minimum touch target size */
.touch-target {
  min-height: 44px;
  min-width: 44px;
}

/* Interactive elements */
button, a, input, select {
  min-height: 44px;
  padding: 12px 16px;
}

/* Spacing between touch targets */
.button-group > * + * {
  margin-left: 8px; /* Minimum 8px gap */
}
```

### Font Scaling

```css
/* Base sizes */
:root {
  --font-size-xs: 0.75rem;   /* 12px */
  --font-size-sm: 0.875rem;  /* 14px */
  --font-size-base: 1rem;    /* 16px */
  --font-size-lg: 1.125rem;  /* 18px */
  --font-size-xl: 1.25rem;   /* 20px */
}

/* Mobile adjustments */
@media (max-width: 768px) {
  :root {
    --font-size-base: 1rem;     /* Keep 16px base for readability */
    --font-size-xl: 1.125rem;   /* Slightly smaller headings */
  }

  .match-card {
    padding: 16px;              /* Tighter padding on mobile */
  }

  .mode-selector button {
    width: 100%;                /* Full-width buttons on mobile */
    margin-bottom: 12px;
  }
}
```

### Mobile-First Match Card

```tsx
function MatchCard({ match }: { match: Match }) {
  return (
    <div className="
      bg-white/[0.05] border border-white/[0.1] rounded-xl
      p-4 md:p-5 lg:p-6
      transition-all duration-200
      hover:bg-white/[0.08] hover:transform hover:-translate-y-1
      active:scale-[0.98]
    ">
      {/* Name + Title - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <User className="w-5 h-5 text-white/60 hidden sm:block" />
        <div>
          <h3 className="text-white/95 font-medium text-base md:text-lg">
            {match.name}
          </h3>
          <p className="text-white/60 text-sm">
            {match.title} · {match.company}
          </p>
        </div>
      </div>

      {/* Signals - horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        {match.signals.map((signal, i) => (
          <SignalBadge key={i} signal={signal} />
        ))}
      </div>
    </div>
  );
}
```

---

## 7. ENTERPRISE LANGUAGE (JP MORGAN STYLE)

### Word Mappings
| Casual (WRONG) | Enterprise (CORRECT) |
|----------------|---------------------|
| Find matches | Identify alignments |
| No matches found | No strategic alignments identified |
| Results | Strategic alignments |
| Loading | Analyzing |
| Search | Analyze |
| Leads | Decision makers |
| Contacts | Professionals |
| Good fit | Strategic alignment |
| They're hiring | Active talent acquisition |
| Just raised | Recent capital event |
| Try again | Retry analysis |

### Banned Words
- Hey, Hi, Hello
- Cool, Great, Awesome, Nice
- Oops, Whoops, Uh oh
- Leads, Contacts, Prospects (use "decision makers", "professionals")
- Emails (never show or mention)

---

## 8. LUCIDE ICONS

### Required Icons
| Context | Icon |
|---------|------|
| Company/Organization | `Building2` |
| Person/Professional | `User` |
| Signal/Activity | `Activity` |
| Funding | `TrendingUp` |
| Hiring | `Users` |
| Clinical/Medical | `Heart` |
| Government/Contract | `Landmark` |
| Research/Grant | `GraduationCap` |
| Success/Alignment | `Target` |
| Loading | `Loader2` |
| Error | `AlertCircle` |
| Search/Analyze | `Search` |
| Settings | `Settings` |

### Signal Badges
```tsx
// Funding signal
<TrendingUp className="w-4 h-4 text-emerald-400" />
<span>Series B ($28M)</span>

// Hiring signal
<Users className="w-4 h-4 text-blue-400" />
<span>Active talent acquisition</span>

// Clinical trial
<Heart className="w-4 h-4 text-rose-400" />
<span>Phase 2 clinical trial</span>

// Grant
<GraduationCap className="w-4 h-4 text-amber-400" />
<span>$12M NIH grant</span>
```

### Signal Badge Color Mapping

| Signal Type | Icon | Color | Tailwind Class |
|-------------|------|-------|----------------|
| Funding (Seed, A, B, C) | `TrendingUp` | Emerald | `text-emerald-400` |
| Hiring/Recruiting | `Users` | Blue | `text-blue-400` |
| Clinical Trials | `Heart` | Rose | `text-rose-400` |
| NIH/Research Grants | `GraduationCap` | Amber | `text-amber-400` |
| Federal Contracts | `Landmark` | Violet | `text-violet-400` |
| Patent/IP | `FileText` | Cyan | `text-cyan-400` |
| Leadership Change | `UserCheck` | Orange | `text-orange-400` |
| M&A Activity | `GitMerge` | Pink | `text-pink-400` |
| Tech Stack Change | `Code` | Indigo | `text-indigo-400` |
| Hospital Expansion | `Building` | Teal | `text-teal-400` |

```typescript
const SIGNAL_BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
  funding: { icon: 'TrendingUp', color: 'text-emerald-400' },
  hiring: { icon: 'Users', color: 'text-blue-400' },
  clinical_trial: { icon: 'Heart', color: 'text-rose-400' },
  grant: { icon: 'GraduationCap', color: 'text-amber-400' },
  federal_contract: { icon: 'Landmark', color: 'text-violet-400' },
  patent: { icon: 'FileText', color: 'text-cyan-400' },
  leadership: { icon: 'UserCheck', color: 'text-orange-400' },
  ma: { icon: 'GitMerge', color: 'text-pink-400' },
  tech_stack: { icon: 'Code', color: 'text-indigo-400' },
  expansion: { icon: 'Building', color: 'text-teal-400' },
};
```

---

## 8.5 MATCH RANKING LOGIC

### Ranking Algorithm

Matches are ranked by a composite score. Higher score = shown first.

```typescript
interface MatchScore {
  signalCount: number;      // 0-30 points
  signalFreshness: number;  // 0-25 points
  signalStrength: number;   // 0-25 points
  relevance: number;        // 0-20 points
  total: number;            // Sum
}

function calculateMatchScore(match: Match): MatchScore {
  const signalCount = Math.min(match.signals.length * 10, 30);

  const signalFreshness = match.signals.reduce((score, signal) => {
    const daysSince = daysBetween(signal.date, new Date());
    if (daysSince <= 7) return score + 25;
    if (daysSince <= 30) return score + 20;
    if (daysSince <= 90) return score + 10;
    return score + 5;
  }, 0) / match.signals.length;

  const signalStrength = match.signals.reduce((score, signal) => {
    // Funding: $50M > $5M
    if (signal.type === 'funding') {
      if (signal.amount >= 50_000_000) return score + 25;
      if (signal.amount >= 10_000_000) return score + 20;
      if (signal.amount >= 1_000_000) return score + 15;
      return score + 10;
    }
    // Clinical: Phase 3 > Phase 1
    if (signal.type === 'clinical_trial') {
      if (signal.phase === 'Phase 3') return score + 25;
      if (signal.phase === 'Phase 2') return score + 20;
      return score + 15;
    }
    // Hiring: Senior > Junior
    if (signal.type === 'hiring') {
      if (['VP', 'Director', 'Head'].some(t => signal.title.includes(t))) return score + 25;
      if (signal.title.includes('Manager')) return score + 20;
      return score + 15;
    }
    return score + 15; // Default
  }, 0) / match.signals.length;

  const relevance = calculateRelevance(match.criteria, match.company);

  return {
    signalCount,
    signalFreshness,
    signalStrength,
    relevance,
    total: signalCount + signalFreshness + signalStrength + relevance,
  };
}
```

### Sorting Order

```typescript
function rankMatches(matches: Match[]): Match[] {
  return matches
    .map(m => ({ ...m, score: calculateMatchScore(m) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5); // Top 5 only
}
```

### Display Tiers

| Score | Tier | Badge |
|-------|------|-------|
| 80+ | Premier | Gold ring around card |
| 60-79 | Strong | Silver ring |
| 40-59 | Good | No ring |
| < 40 | Hidden | Not shown |

---

## 8.6 ERROR STATES

### Error State UI Components

All errors use enterprise language. No casual words.

```typescript
interface ErrorState {
  type: 'no_results' | 'source_unavailable' | 'rate_limited' | 'network_error';
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

const ERROR_STATES: Record<string, ErrorState> = {
  no_results: {
    type: 'no_results',
    title: 'No strategic alignments identified',
    description: 'Criteria may be too narrow. Consider expanding parameters.',
    action: { label: 'Modify criteria', onClick: () => openCriteriaForm() }
  },
  source_unavailable: {
    type: 'source_unavailable',
    title: 'Signal source temporarily unavailable',
    description: 'One or more data sources are experiencing delays. Alternative sources in use.',
    action: { label: 'Retry analysis', onClick: () => retrySearch() }
  },
  rate_limited: {
    type: 'rate_limited',
    title: 'Analysis limit reached',
    description: 'Daily analysis quota has been reached. Resets at midnight UTC.',
    action: undefined // No action, must wait
  },
  network_error: {
    type: 'network_error',
    title: 'Connection interrupted',
    description: 'Unable to complete analysis. Check network connection.',
    action: { label: 'Retry', onClick: () => retrySearch() }
  }
};
```

### Error Card Design

```tsx
function ErrorCard({ error }: { error: ErrorState }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 text-center">
      <AlertCircle className="w-8 h-8 text-white/40 mx-auto mb-4" />
      <h3 className="text-white/90 font-medium mb-2">{error.title}</h3>
      <p className="text-white/50 text-sm mb-4">{error.description}</p>
      {error.action && (
        <button
          onClick={error.action.onClick}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg
                     text-white/80 text-sm transition-all duration-200"
        >
          {error.action.label}
        </button>
      )}
    </div>
  );
}
```

---

## 8.7 LOADING STATES

### Performance Target: < 4 seconds

Realistic timing based on multi-source queries:

| Phase | Target Time | Cumulative |
|-------|-------------|------------|
| Initial render | 50ms | 50ms |
| Config fetch | 200ms | 250ms |
| Signal query (parallel) | 2000ms | 2250ms |
| Ranking & filtering | 100ms | 2350ms |
| Render results | 150ms | 2500ms |
| **Buffer** | 1500ms | **4000ms** |

### Progress Indicator

```tsx
function LoadingState({ phase }: { phase: 'analyzing' | 'ranking' | 'preparing' }) {
  const messages = {
    analyzing: 'Analyzing signal sources...',
    ranking: 'Identifying strategic alignments...',
    preparing: 'Preparing results...'
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-white/60 animate-spin mb-4" />
      <p className="text-white/70 text-sm">{messages[phase]}</p>
      <div className="mt-4 w-48 h-1 bg-white/[0.1] rounded-full overflow-hidden">
        <div
          className="h-full bg-white/40 rounded-full transition-all duration-500"
          style={{ width: phase === 'analyzing' ? '33%' : phase === 'ranking' ? '66%' : '90%' }}
        />
      </div>
    </div>
  );
}
```

---

## 9. MATCH CARD DESIGN

### Layout (NO EMAIL)
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [User Icon]  Full Name                                    │
│              Title · Company                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Signal Icon] Signal Description                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Signal Icon] Additional Signal (if available)     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Styling
```css
.match-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  transition: all 200ms ease;
}

.match-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 255, 255, 0.08);
}
```

### What's Shown
- Full name
- Title
- Company
- 1-2 signal badges

### What's NOT Shown
- Email (NEVER)
- Phone
- LinkedIn URL
- Any contact info

---

## 10. DATABASE SCHEMA

```sql
-- Member platform configurations
CREATE TABLE platform_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,           -- URL path: /platform/{slug}
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signal sources registry
CREATE TABLE signal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                  -- 'clinical_trials', 'nih_grants', etc.
  display_name TEXT NOT NULL,          -- 'Clinical Trials'
  description TEXT,
  table_name TEXT NOT NULL,            -- Actual table to query
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform analytics (optional)
CREATE TABLE platform_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_config_id UUID REFERENCES platform_configs(id),
  event_type TEXT NOT NULL,            -- 'search', 'results_shown'
  criteria JSONB,                      -- What was searched
  results_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting for platform usage
CREATE TABLE platform_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- Enforcement function
CREATE OR REPLACE FUNCTION check_platform_rate_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 100; -- 100 searches per day
BEGIN
  SELECT search_count INTO v_count
  FROM platform_rate_limits
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  IF v_count IS NULL THEN
    INSERT INTO platform_rate_limits (user_id, date, search_count)
    VALUES (p_user_id, CURRENT_DATE, 1);
    RETURN TRUE;
  ELSIF v_count < v_limit THEN
    UPDATE platform_rate_limits
    SET search_count = search_count + 1
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### 10.5 Signal Source Tables

```sql
-- Clinical Trials (from ClinicalTrials.gov)
CREATE TABLE clinical_trials_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  contact_name TEXT,
  contact_title TEXT,
  trial_phase TEXT,                    -- 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'
  trial_status TEXT,                   -- 'Recruiting', 'Active', 'Completed'
  condition TEXT,                      -- Disease/condition being studied
  intervention TEXT,                   -- Drug/treatment name
  start_date DATE,
  nct_id TEXT,                         -- ClinicalTrials.gov identifier
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clinical_company ON clinical_trials_companies(company);
CREATE INDEX idx_clinical_phase ON clinical_trials_companies(trial_phase);
CREATE INDEX idx_clinical_status ON clinical_trials_companies(trial_status);

-- NIH Grants (from NIH Reporter API)
CREATE TABLE nih_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization TEXT NOT NULL,
  domain TEXT,
  pi_name TEXT,                        -- Principal Investigator
  pi_title TEXT,
  award_amount DECIMAL(15,2),
  award_date DATE,
  project_title TEXT,
  activity_code TEXT,                  -- R01, R21, etc.
  institute TEXT,                      -- NCI, NIMH, etc.
  project_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_nih_org ON nih_grants(organization);
CREATE INDEX idx_nih_amount ON nih_grants(award_amount);
CREATE INDEX idx_nih_date ON nih_grants(award_date);

-- Recently Funded Startups
CREATE TABLE funded_startups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  funding_round TEXT,                  -- 'Seed', 'Series A', 'Series B', etc.
  amount DECIMAL(15,2),
  funding_date DATE,
  ceo_name TEXT,
  ceo_title TEXT DEFAULT 'CEO',
  investors JSONB,                     -- Array of investor names
  industry TEXT,
  employee_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_funded_company ON funded_startups(company);
CREATE INDEX idx_funded_round ON funded_startups(funding_round);
CREATE INDEX idx_funded_date ON funded_startups(funding_date);
CREATE INDEX idx_funded_amount ON funded_startups(amount);

-- Federal Contracts (from SAM.gov / USASpending)
CREATE TABLE federal_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contract_value DECIMAL(15,2),
  agency TEXT,                         -- 'DOD', 'HHS', 'NASA', etc.
  contract_type TEXT,                  -- 'Fixed-Price', 'Cost-Plus', etc.
  award_date DATE,
  naics_code TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_federal_company ON federal_contracts(company);
CREATE INDEX idx_federal_agency ON federal_contracts(agency);
CREATE INDEX idx_federal_value ON federal_contracts(contract_value);

-- Job Signals (Hiring Activity)
CREATE TABLE job_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  job_title TEXT,
  department TEXT,                     -- 'Engineering', 'Sales', 'Marketing', etc.
  seniority TEXT,                      -- 'Executive', 'Director', 'Manager', 'IC'
  location TEXT,
  posted_date DATE,
  job_url TEXT,
  hiring_manager TEXT,
  hiring_manager_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jobs_company ON job_signals(company);
CREATE INDEX idx_jobs_department ON job_signals(department);
CREATE INDEX idx_jobs_posted ON job_signals(posted_date);
```

---

## 11. FILE STRUCTURE

```
src/platform/
├── PlatformApp.tsx              # Main platform UI
├── ModeSelector.tsx         # Demand/Supply selector
├── CriteriaForm.tsx         # Input form for ICP
├── SignalSourcePicker.tsx   # Signal source selection
├── ResultsDisplay.tsx       # Match cards display
├── MatchCard.tsx            # Individual match card
├── platform.css                 # iOS design tokens
├── types.ts                 # TypeScript interfaces
└── constants.ts             # Enterprise language strings

src/services/
├── SignalRouter.ts          # Routes to correct signal source
├── SignalSources/
│   ├── ClinicalTrials.ts    # Clinical trials queries
│   ├── NIHGrants.ts         # NIH grants queries
│   ├── FundedStartups.ts    # Recently funded queries
│   ├── FederalContracts.ts  # Federal contracts queries
│   └── JobSignals.ts        # Hiring signals queries
└── PlatformConfigService.ts     # Member config CRUD

supabase/functions/
├── platform-config/             # GET config by slug
├── platform-search/             # POST search across signal sources
└── _shared/
    ├── http.ts              # CORS wrapper
    └── signals.ts           # Signal source abstractions
```

---

## 12. BUILD PHASES

### Phase 1: Foundation (Days 1-2)
- [ ] Database migration (platform_configs, signal_sources)
- [ ] PlatformApp.tsx shell with mode selector
- [ ] platform.css with iOS tokens
- [ ] Basic routing `/platform/:slug`

### Phase 2: Signal Router (Days 3-4)
- [ ] SignalRouter.ts service
- [ ] Wire up existing signal sources:
  - [ ] Recently Funded Startups
  - [ ] NIH Grants
  - [ ] Clinical Trials
  - [ ] Federal Contracts
  - [ ] Job Signals
- [ ] CriteriaForm.tsx for ICP input
- [ ] SignalSourcePicker.tsx

### Phase 3: Results Display (Days 5-6)
- [ ] MatchCard.tsx (no email, signals only)
- [ ] ResultsDisplay.tsx with animations
- [ ] Enterprise language throughout
- [ ] Lucide icons for signals

### Phase 4: White-Label (Day 7)
- [ ] PlatformConfigService.ts
- [ ] Settings UI for members
- [ ] Brand application (logo, colors)
- [ ] Test end-to-end flow

---

## 13. STRIPE-LEVEL QUALITY CHECKLIST

### Before Each Component
- [ ] No emails displayed anywhere
- [ ] No casual language
- [ ] Lucide icons only (no emojis)
- [ ] True black (#000000) background
- [ ] 200ms transitions
- [ ] 12px border radius on cards
- [ ] Light shadows on dark background

### Before Ship
- [ ] Works for ANY niche
- [ ] Signal sources are pluggable
- [ ] White-label is seamless
- [ ] Prospect sees no "Connector OS"
- [ ] Results are REAL (from signal databases)
- [ ] Mobile responsive (44px touch targets, breakpoints)
- [ ] Loads in < 4s (with progress indicator)

---

## 14. THE CLOSE

**What the prospect sees:**
- Member's branded tool
- Real decision makers
- Live signals (funding, hiring, trials, grants)
- No emails, no contact info

**What the prospect thinks:**
- "They have industry intelligence"
- "They have access to decision makers"
- "They know who's in-market right now"
- "I need to work with them"

**What the member says:**
> "I can facilitate a warm intro to [Name]. They're actively [signal]. Want me to make the connection?"

**Result:** CLOSE.

---

## 15. CRITICAL QUESTIONS — ANSWERED

### Q1: Is member authenticated during platform usage?

**Answer: YES — Required**

Member must be authenticated to:
- Load their white-label config (logo, colors, slug)
- Track usage for rate limiting
- Log analytics for their account

**Flow:**
```
Member opens app.connector-os.com/platform/{slug}
  ↓
System checks: Is member logged in?
  ↓
YES → Load their config, show branded tool
NO → Redirect to /login?redirect=/platform/{slug}
```

**Note:** The PROSPECT doesn't authenticate. They just see the white-labeled tool.

---

### Q2: What if branding not configured?

**Answer: Force configuration before first use**

```
Member navigates to /platform or clicks "Strategic Alignment Platform" in Launcher
  ↓
System checks: Does platform_configs exist for this user?
  ↓
NO → Show setup wizard (brand name, logo, color, slug)
     - Cannot proceed without completing setup
     - 3 required fields: brand_name, slug, primary_color
     - Logo is optional (defaults to initials)
  ↓
YES → Load their strategic alignment platform
```

**Setup Wizard UI:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Configure your strategic alignment platform                                   │
│                                                             │
│  Brand name *                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Acme Partners                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  URL slug *                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ acme-partners                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  app.connector-os.com/platform/acme-partners                   │
│                                                             │
│  Primary color                                              │
│  [■ Blue] [■ Green] [■ Purple] [■ Custom...]              │
│                                                             │
│  Logo (optional)                                            │
│  [Upload logo]                                              │
│                                                             │
│            ┌───────────────────────────────┐               │
│            │      Save & Continue          │               │
│            └───────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Q3: How to handle slug conflicts?

**Answer: Availability check + suggestions**

```typescript
async function checkSlugAvailability(slug: string): Promise<SlugCheck> {
  const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Check reserved words
  const reserved = ['admin', 'api', 'app', 'demo', 'help', 'support', 'www'];
  if (reserved.includes(normalized)) {
    return {
      available: false,
      reason: 'reserved',
      suggestions: [`${normalized}-co`, `${normalized}-partners`, `my-${normalized}`]
    };
  }

  // Check database
  const existing = await db.query('SELECT 1 FROM platform_configs WHERE slug = $1', [normalized]);
  if (existing.rows.length > 0) {
    return {
      available: false,
      reason: 'taken',
      suggestions: await generateSuggestions(normalized)
    };
  }

  return { available: true };
}

async function generateSuggestions(base: string): Promise<string[]> {
  // Try common variations
  const variations = [
    `${base}-co`,
    `${base}-group`,
    `${base}-partners`,
    `the-${base}`,
    `${base}-hq`
  ];

  // Return first 3 available
  const available = [];
  for (const v of variations) {
    const check = await checkSlugAvailability(v);
    if (check.available) {
      available.push(v);
      if (available.length >= 3) break;
    }
  }
  return available;
}
```

**UI Feedback:**
```
┌─────────────────────────────────────────────────────────────┐
│  URL slug *                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ acme                                                │   │
│  └─────────────────────────────────────────────────────┘   │
│  ⚠ This slug is taken. Try:                               │
│    • acme-partners (available)                             │
│    • acme-group (available)                                │
│    • the-acme (available)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Q4: What's the onboarding flow?

**Answer: 4-step linear flow**

```
Step 1: Settings
  Member goes to Settings → Strategic Alignment Platform section
  - Configures brand name, slug, logo, color
  - Saves config to platform_configs table
  ↓
Step 2: Test Mode
  Member clicks "Preview" → opens platform in new tab
  - Shows their branded tool
  - Can run test searches
  - Data is real (not mocked)
  ↓
Step 3: Share Link
  Member copies their platform URL
  - app.connector-os.com/platform/{slug}
  - This is what they share screen with
  ↓
Step 4: Go Live
  Member uses on live calls
  - Opens URL before call
  - Shares screen
  - Inputs prospect criteria live
  - Shows results → closes deal
```

**Settings UI Section:**
```
┌─────────────────────────────────────────────────────────────┐
│  Strategic Alignment Platform                                                  │
│                                                             │
│  Your platform URL:                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ app.connector-os.com/platform/acme-partners      [Copy] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Edit branding]    [Preview platform]                     │
└─────────────────────────────────────────────────────────────┘
```

---

### Q5: Which analytics to track?

**Answer: Essential metrics only**

| Event | Data Captured | Purpose |
|-------|---------------|---------|
| `platform_accessed` | timestamp, slug, user_id | Usage tracking |
| `search_executed` | criteria, source_count, result_count | Feature usage |
| `results_shown` | match_count, top_signals | Quality tracking |
| `mode_selected` | 'demand' or 'supply' | Flow understanding |
| `source_selected` | source_ids[] | Source popularity |

**NOT tracked (privacy):**
- Prospect identity
- Specific companies shown
- Emails/contact info (we don't show them anyway)
- IP addresses

**Database:**
```sql
CREATE TABLE platform_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_config_id UUID REFERENCES platform_configs(id),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_platform_analytics_config ON platform_analytics(platform_config_id);
CREATE INDEX idx_platform_analytics_date ON platform_analytics(created_at);
```

**Querying:**
```sql
-- Usage by member (last 30 days)
SELECT
  dc.brand_name,
  COUNT(*) FILTER (WHERE da.event_type = 'platform_accessed') as opens,
  COUNT(*) FILTER (WHERE da.event_type = 'search_executed') as searches,
  AVG((da.event_data->>'result_count')::int) as avg_results
FROM platform_analytics da
JOIN platform_configs dc ON da.platform_config_id = dc.id
WHERE da.created_at > NOW() - INTERVAL '30 days'
GROUP BY dc.id, dc.brand_name
ORDER BY opens DESC;
```

---

**END OF SPECIFICATION**

> If context compacts, re-read this file.
> This is the Strategic Alignment Platform (SSM-gated feature).
> All 10 gaps filled. All 5 questions answered. SSM access control in 4 layers.
> **STATUS: 100% READY TO BUILD**
