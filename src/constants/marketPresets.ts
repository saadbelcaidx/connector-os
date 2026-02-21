/**
 * Market Presets — Serialized UI State
 *
 * Each market is a grouped set of paired Demand + Supply packs.
 * Each pack is an exact snapshot of filter values.
 * Clicking a pack calls existing setters. No logic. No backend.
 * If an operator can recreate it manually → it's correct.
 *
 * ═══════════════════════════════════════════════════════════════
 * REFERENCE IMPLEMENTATION: Wealth Management
 * ═══════════════════════════════════════════════════════════════
 *
 * Wealth Management is the canonical market template.
 * All future markets must follow this structure.
 *
 * MARKET:
 *   Positioning sentence — one line that names the economic event,
 *   who gets paid, and where the operator sits.
 *   Pattern: "When [trigger] — [supply players] get paid, you sit in the middle."
 *
 * DEMAND PACKS (3):
 *   Each pack captures one economic trigger, not an industry.
 *   ┌──────────────────────┬────────────────────────────────────────────┐
 *   │ Pack                 │ Economic trigger                          │
 *   ├──────────────────────┼────────────────────────────────────────────┤
 *   │ Liquidity Events     │ Ownership changes: M&A, IPO, PE buyout   │
 *   │ Founder Transition   │ Leadership exit: succession, retirement  │
 *   │ Growth Windfall      │ Capital injection: funding, expansion    │
 *   └──────────────────────┴────────────────────────────────────────────┘
 *   Signals: Map to real API signal IDs (acquires, merges_with, etc.)
 *   Titles: Decision-makers only (CEO, Founder, CFO, Owner, President)
 *   No industry filter on demand — events cross industries.
 *
 * SUPPLY PACKS (3):
 *   Each pack targets one monetization role in the ecosystem.
 *   ┌──────────────────────┬──────────────────────┬─────────────────────┐
 *   │ Pack                 │ Monetization role     │ Capability          │
 *   ├──────────────────────┼──────────────────────┼─────────────────────┤
 *   │ RIAs / Wealth Adv.   │ Wealth management    │ Portfolio/planning  │
 *   │ Family Offices       │ Principal investing   │ Direct investments  │
 *   │ M&A / Exit Advisors  │ Transaction advisory │ Deal/exit advisory  │
 *   └──────────────────────┴──────────────────────┴─────────────────────┘
 *   Signals: Activity signals (signs_new_client, partners_with, hires)
 *   Industries: Scoped to supply's vertical (Investment Mgmt, IB, etc.)
 *   Titles: Senior operators (Managing Partner, Principal, MD, CIO)
 *
 * RULES:
 *   1. Packs contain only essential filters — no noise, no padding.
 *   2. Ontology (side, market, packId, origin) stamped at ingestion
 *      in PrebuiltMarkets.tsx, write-once via nullish coalescing.
 *   3. Signals are interpreted by the system, never rewritten.
 *      "expands_facilities" means team scaling unless supply is facilities.
 *   4. Supply capability drives intro framing.
 *      AI must NOT infer capability from description — use ONLY
 *      the structured supply.capability field.
 *   5. Demand packs are event-driven (what happened).
 *      Supply packs are role-driven (who gets paid).
 *   6. No fundingStage/employeeCount/revenue on demand packs
 *      unless the market is explicitly industry-scoped (e.g. Biotech).
 *   7. keywordsExclude always filters out noise actors
 *      (intern, student, course, academy, crypto trading signals).
 *   8. titleExclude always filters out junior titles
 *      (Intern, Assistant, Coordinator, Analyst, Associate).
 *
 * When adding a new market, copy the Wealth Management structure:
 *   1. Write the positioning sentence.
 *   2. Define 3 demand packs by economic trigger.
 *   3. Define 3 supply packs by monetization role.
 *   4. Map signals to exact API IDs from NEWS_SIGNALS.
 *   5. Keep filters minimal — if it's not essential, don't add it.
 *
 * ═══════════════════════════════════════════════════════════════
 * SHIP-GATE CHECKLIST (frozen Feb 21 2026)
 * Every new market MUST pass ALL checks before merge.
 * ═══════════════════════════════════════════════════════════════
 *
 *   [ ] 3 demand packs + 3 supply packs (no exceptions)
 *   [ ] Packs may ONLY set: signals, industries, keywordsInclude,
 *       keywordsExclude, titleInclude, titleExclude, locations
 *   [ ] Packs must NOT set: employeeCount, revenue, fundingStage,
 *       jobPostings, technologies
 *   [ ] Every pack has correct side ('demand' | 'supply')
 *   [ ] Pack id follows: {market}.{side}.{name} convention
 *   [ ] Each demand pack returns >= 100 results at target 300
 *       with default geography (or justification why not)
 *   [ ] market.id, pack.id, pack.side are consistent
 *   [ ] No broad/cringe keywords — use operational language
 *   [ ] Focuses (if any) scoped via market field, modify only
 *       industries / keywords / titles
 */

export interface PackFilters {
  signals?: string[];
  industries?: string[];
  fundingStage?: string[];
  employeeCount?: { min: number; max: number }[];
  revenue?: string[];
  keywordsInclude?: string;
  keywordsExclude?: string;
  jobPostings?: string;
  titleInclude?: string;
  titleExclude?: string;
  locations?: string;
}

export interface Pack {
  id: string;
  name: string;
  side: 'demand' | 'supply';
  economicRole?: string;
  /** Pre-curated intro-ready phrases — grammar-safe for each template slot */
  introPhrase?: {
    asNeed: string;    // fits "looking for [X]" (painTheySolve slot)
    asEntity: string;  // fits "connected to [X]" (whoTheyAre slot)
  };
  /** Decision area noun phrase — fits "start thinking about [X]" in Block 2 */
  decisionCategory?: string;
  filters: PackFilters;
}

// =============================================================================
// ECONOMIC ROLE LOOKUP — O(1) packId → economicRole resolution
// =============================================================================

const _economicRoleLookup: Record<string, string> = {};

/** Resolve packId → curated economicRole. Returns null if no pack or no role. */
export function getPackEconomicRole(packId: string | undefined | null): string | null {
  if (!packId) return null;
  // Lazy-build on first call
  if (Object.keys(_economicRoleLookup).length === 0) {
    for (const market of MARKETS) {
      for (const pack of market.packs) {
        if (pack.economicRole) {
          _economicRoleLookup[pack.id] = pack.economicRole;
        }
      }
    }
  }
  return _economicRoleLookup[packId] || null;
}

// =============================================================================
// INTRO PHRASE LOOKUP — O(1) packId → { asNeed, asEntity } resolution
// =============================================================================

const _introPhraseLookup: Record<string, { asNeed: string; asEntity: string }> = {};

/** Resolve packId → curated intro phrases. Returns null if no pack or no phrases. */
export function getPackIntroPhrase(packId: string | undefined | null): { asNeed: string; asEntity: string } | null {
  if (!packId) return null;
  if (Object.keys(_introPhraseLookup).length === 0) {
    for (const market of MARKETS) {
      for (const pack of market.packs) {
        if (pack.introPhrase) {
          _introPhraseLookup[pack.id] = pack.introPhrase;
        }
      }
    }
  }
  return _introPhraseLookup[packId] || null;
}

// =============================================================================
// DECISION CATEGORY LOOKUP — O(1) packId → decisionCategory resolution
// =============================================================================

const _decisionCategoryLookup: Record<string, string> = {};

/** Resolve packId → curated decision category. Returns null if no pack or no category. */
export function getPackDecisionCategory(packId: string | undefined | null): string | null {
  if (!packId) return null;
  if (Object.keys(_decisionCategoryLookup).length === 0) {
    for (const market of MARKETS) {
      for (const pack of market.packs) {
        if (pack.decisionCategory) {
          _decisionCategoryLookup[pack.id] = pack.decisionCategory;
        }
      }
    }
  }
  return _decisionCategoryLookup[packId] || null;
}

export interface Market {
  id: string;
  name: string;
  description: string;
  packs: Pack[];
}

/**
 * Industry Focus — reusable filter overlay.
 * Scoped to a market via `market` field.
 * Modifies industry, keywords, and title bias. NEVER creates new packs.
 */
export interface IndustryFocus {
  id: string;
  name: string;
  market: string;
  industries: string[];
  keywordsInclude: string;
  titleBias: string;
}

export const MARKETS: Market[] = [
  // ═══════════════════════════════════════════════════════════════
  // BIOTECH
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'biotech',
    name: 'Biotech',
    description: 'When biotech companies hire, raise, or partner — recruiters, CROs, and advisors get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'biotech.demand.clinical_hiring',
        name: 'Clinical Hiring',
        side: 'demand',
        filters: {
          signals: ['hires', 'expands_facilities'],
          industries: ['Biotechnology', 'Pharmaceuticals', 'Medical Devices', 'Research', 'Hospital & Health Care'],
          keywordsInclude: 'clinical trial, drug development, therapeutics, pipeline, phase i, phase ii, phase iii, fda, regulatory, biologics, oncology, genomics',
          keywordsExclude: 'consulting, agency, marketing, staffing, recruiter',
          titleInclude: 'VP Clinical Operations, Chief Medical Officer, VP R&D, Head of Clinical, VP Talent Acquisition, VP People',
          titleExclude: 'Intern, Coordinator, Assistant, Analyst',
          locations: 'United States',
        },
      },
      {
        id: 'biotech.demand.funding_raised',
        name: 'Funding Raised',
        side: 'demand',
        filters: {
          signals: ['receives_financing'],
          industries: ['Biotechnology', 'Pharmaceuticals', 'Medical Devices', 'Research'],
          keywordsInclude: 'biotech, therapeutics, drug development, pipeline, clinical, biologics, genomics, oncology',
          keywordsExclude: 'consulting, agency, marketing, staffing, recruiter',
          titleInclude: 'CEO, CFO, COO, Founder, VP Finance, Chief Business Officer',
          titleExclude: 'Intern, Coordinator, Assistant, Analyst',
          locations: 'United States',
        },
      },
      {
        id: 'biotech.demand.partnership_activity',
        name: 'Partnership Activity',
        side: 'demand',
        filters: {
          signals: ['partners_with', 'acquires'],
          industries: ['Biotechnology', 'Pharmaceuticals', 'Medical Devices', 'Research'],
          keywordsInclude: 'licensing, partnership, collaboration, co-development, technology transfer, pharma, pipeline, therapeutic',
          keywordsExclude: 'consulting, agency, marketing, staffing, recruiter',
          titleInclude: 'VP Business Development, Chief Business Officer, VP Corporate Development, Head of Licensing, VP Partnerships',
          titleExclude: 'Intern, Coordinator, Assistant, Analyst',
          locations: 'United States',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'biotech.supply.life_science_recruiters',
        name: 'Life Science Recruiters',
        side: 'supply',
        economicRole: 'recruiting scientists, clinical staff, and R&D leaders for biotech companies',
        introPhrase: {
          asNeed: 'to fill scientist and R&D leadership roles',
          asEntity: 'life sciences recruiting firm that places scientists and R&D leaders',
        },
        decisionCategory: 'specialized life science recruiting',
        filters: {
          signals: ['signs_new_client', 'hires', 'partners_with'],
          industries: ['Staffing and Recruiting', 'Human Resources', 'Biotechnology'],
          keywordsInclude: 'life science, biotech recruiting, pharma recruiting, scientific staffing, clinical recruiting, executive search',
          keywordsExclude: 'in-house, internal, software, saas',
          titleInclude: 'Managing Director, Partner, Founder, Owner, Principal, VP Business Development',
          titleExclude: 'Intern, Coordinator, Assistant',
          locations: 'United States',
        },
      },
      {
        id: 'biotech.supply.cro_clinical_ops',
        name: 'CRO / Clinical Ops',
        side: 'supply',
        economicRole: 'running clinical trials and regulatory operations for pharma and biotech',
        introPhrase: {
          asNeed: 'to run clinical trials and regulatory submissions',
          asEntity: 'CRO that runs clinical trials and regulatory submissions',
        },
        decisionCategory: 'clinical trial operations',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'receives_financing'],
          industries: ['Biotechnology', 'Research', 'Hospital & Health Care', 'Pharmaceuticals'],
          keywordsInclude: 'CRO, contract research, clinical operations, clinical trial management, regulatory consulting, GxP, pharmacovigilance',
          keywordsExclude: 'recruiting, staffing, marketing, agency',
          titleInclude: 'VP Business Development, Managing Director, CEO, Founder, Director',
          titleExclude: 'Intern, Coordinator, Assistant, Analyst',
          locations: 'United States',
        },
      },
      {
        id: 'biotech.supply.licensing_advisors',
        name: 'Licensing Advisors',
        side: 'supply',
        economicRole: 'brokering licensing deals and technology transfer for life science companies',
        introPhrase: {
          asNeed: 'to close licensing and tech transfer deals',
          asEntity: 'licensing advisory firm that brokers IP and tech transfer deals',
        },
        decisionCategory: 'licensing and tech transfer strategy',
        filters: {
          signals: ['partners_with', 'signs_new_client', 'acquires'],
          industries: ['Management Consulting', 'Investment Banking', 'Venture Capital & Private Equity', 'Biotechnology'],
          keywordsInclude: 'licensing, business development, pharma BD, technology transfer, deal advisory, M&A, life science consulting',
          keywordsExclude: 'recruiting, staffing, marketing, software',
          titleInclude: 'Managing Partner, Principal, Founder, Partner, Director, VP Business Development',
          titleExclude: 'Intern, Coordinator, Assistant, Analyst',
          locations: 'United States',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // WEALTH MANAGEMENT
  // Event-driven, not industry-driven. Detect economic phase change.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'wealth',
    name: 'Wealth Management',
    description: 'When companies experience liquidity or ownership transitions — RIAs, family offices, and M&A advisors get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'wealth.demand.liquidity_events',
        name: 'Liquidity Events',
        side: 'demand',
        filters: {
          signals: ['acquires', 'merges_with', 'sells_assets_to', 'goes_public', 'receives_financing', 'invests_into_assets'],
          keywordsInclude: 'exit, liquidity, acquired, strategic sale, majority investment, minority investment, buyout, recapitalization, succession, ownership transition, founder transition, private equity investment, growth equity, roll-up, divestiture',
          keywordsExclude: 'intern, student, course, academy, training program, crypto trading signals',
          titleInclude: 'CEO, Founder, Owner, President, Managing Director, Partner, CFO, Co-Founder',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'wealth.demand.founder_transition',
        name: 'Founder Transition',
        side: 'demand',
        filters: {
          signals: ['leaves', 'expands_facilities', 'receives_financing'],
          keywordsInclude: 'retirement, succession planning, next generation, family transition, stepping down, ownership transfer, legacy planning, founder exit, transitioning leadership, estate planning',
          keywordsExclude: 'intern, student, course, academy, training program, crypto trading signals',
          titleInclude: 'CEO, Founder, Owner, President, Managing Director, Partner, CFO, Co-Founder',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'wealth.demand.growth_windfall',
        name: 'Growth Windfall',
        side: 'demand',
        filters: {
          signals: ['receives_financing', 'expands_offices_to', 'partners_with', 'invests_into_assets'],
          keywordsInclude: 'rapid growth, scaling operations, international expansion, new capital, strategic expansion, valuation increase, growth stage, series b, series c, late stage funding',
          keywordsExclude: 'intern, student, course, academy, training program, crypto trading signals',
          titleInclude: 'CEO, Founder, Owner, President, Managing Director, Partner, CFO, Co-Founder',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'wealth.supply.ria_wealth_advisors',
        name: 'RIAs / Wealth Advisors',
        side: 'supply',
        economicRole: 'managing wealth and investment portfolios for high-net-worth individuals',
        introPhrase: {
          asNeed: 'to manage wealth and investment portfolios',
          asEntity: 'wealth advisory practice that manages portfolios for high-net-worth individuals',
        },
        decisionCategory: 'wealth advisory support',
        filters: {
          signals: ['signs_new_client', 'hires', 'partners_with'],
          industries: ['Investment Management', 'Financial Services', 'Capital Markets'],
          keywordsInclude: 'ria, registered investment advisor, wealth management, private wealth, financial advisor, fiduciary advisor, portfolio management, high net worth, ultra high net worth, family wealth, wealth planning, investment advisory',
          keywordsExclude: 'in-house, internal, retail, insurance, crypto trading signals',
          titleInclude: 'Managing Partner, Partner, Founder, Principal, Managing Director, Wealth Advisor, Private Wealth Advisor',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'wealth.supply.family_offices',
        name: 'Family Offices',
        side: 'supply',
        economicRole: 'making direct investments and structuring multi-generational wealth',
        introPhrase: {
          asNeed: 'to structure direct investments and multi-gen wealth',
          asEntity: 'family office that does direct investments and structures multi-generational wealth',
        },
        decisionCategory: 'direct investments and wealth structuring',
        filters: {
          signals: ['signs_new_client', 'invests_into', 'partners_with'],
          industries: ['Investment Management', 'Financial Services', 'Venture Capital & Private Equity'],
          keywordsInclude: 'family office, single family office, multi family office, private investment office, principal investments, direct investments, family capital, private capital office',
          keywordsExclude: 'in-house, internal, retail, insurance, crypto trading signals',
          titleInclude: 'Managing Partner, Partner, Founder, Principal, Managing Director, Chief Investment Officer',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'wealth.supply.ma_exit_advisors',
        name: 'M&A / Exit Advisors',
        side: 'supply',
        economicRole: 'advising on mergers, acquisitions, and exit transactions',
        introPhrase: {
          asNeed: 'to navigate M&A and exit transactions',
          asEntity: 'M&A advisory group that handles acquisitions and exit transactions',
        },
        decisionCategory: 'exit planning and M&A advisory',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'acquires'],
          industries: ['Investment Banking', 'Management Consulting', 'Financial Services', 'Venture Capital & Private Equity'],
          keywordsInclude: 'm&a advisory, sell side advisor, buy side advisor, transaction advisory, investment banking advisory, corporate finance advisor, exit advisory, deal advisory, valuation advisory',
          keywordsExclude: 'recruiting, staffing, marketing, software, crypto trading signals',
          titleInclude: 'Managing Director, Partner, Director, Principal, Head of M&A',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // RECRUITMENT
  // Economic hiring triggers, not industries. Industry is a filter layer.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'recruitment',
    name: 'Recruitment',
    description: 'When companies face hiring pressure or talent gaps — search firms and recruiters get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'recruitment.demand.active_hiring',
        name: 'Active Hiring',
        side: 'demand',
        filters: {
          signals: ['hires'],
          keywordsInclude: 'hiring, recruiting, talent acquisition, open roles, team building, headcount growth, scaling team',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'VP Talent Acquisition, VP People, VP HR, CHRO, Head of Talent, Head of People, VP Human Resources',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'recruitment.demand.growth_hiring',
        name: 'Expansion / Growth Hiring',
        side: 'demand',
        filters: {
          signals: ['expands_offices_to', 'opens_new_location', 'expands_facilities', 'receives_financing', 'launches'],
          keywordsInclude: 'expansion, scaling, growth, new office, new market, rapid growth, headcount increase, series funding, new headquarters',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'CEO, Founder, COO, VP Operations, VP Growth, Chief People Officer, VP Talent Acquisition',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'recruitment.demand.replacement_hiring',
        name: 'Replacement / Urgent Hiring',
        side: 'demand',
        filters: {
          signals: ['leaves', 'decreases_headcount_by', 'acquires'],
          keywordsInclude: 'leadership change, restructuring, replacement, succession, transition, reorganization, integration, backfill, urgent hire',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'CEO, Founder, COO, VP HR, CHRO, VP Talent Acquisition, Head of People',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'recruitment.supply.executive_search',
        name: 'Executive Search Firms',
        side: 'supply',
        economicRole: 'placing senior executives and C-suite leaders for companies',
        introPhrase: {
          asNeed: 'to fill VP and C-level positions',
          asEntity: 'executive search firm that places C-suite and senior leaders',
        },
        decisionCategory: 'senior leadership hiring support',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Staffing and Recruiting', 'Human Resources', 'Management Consulting'],
          keywordsInclude: 'executive search, retained search, leadership hiring, c-suite placement, board search, senior executive recruitment',
          keywordsExclude: 'in-house, internal, software, saas, temporary staffing',
          titleInclude: 'Managing Partner, Partner, Founder, Principal, Managing Director, Practice Leader',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate, Researcher',
        },
      },
      {
        id: 'recruitment.supply.specialized_recruiters',
        name: 'Specialized Recruiters',
        side: 'supply',
        economicRole: 'filling specialized and technical roles through domain-specific recruiting',
        introPhrase: {
          asNeed: 'to fill specialized and technical roles',
          asEntity: 'recruiting firm that fills specialized and technical roles',
        },
        decisionCategory: 'specialized technical recruiting',
        filters: {
          signals: ['signs_new_client', 'hires', 'partners_with'],
          industries: ['Staffing and Recruiting', 'Human Resources'],
          keywordsInclude: 'specialized recruiting, technical recruiting, niche recruiting, domain recruiting, professional placement, contingent search',
          keywordsExclude: 'in-house, internal, temporary, staffing agency, temp agency',
          titleInclude: 'Managing Director, Partner, Founder, Owner, Principal, VP Business Development, Practice Lead',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'recruitment.supply.staffing_agencies',
        name: 'Staffing Agencies',
        side: 'supply',
        economicRole: 'providing contract, temporary, and staff augmentation workforce',
        introPhrase: {
          asNeed: 'to bring on contract and staff augmentation',
          asEntity: 'staffing firm that provides contract and staff augmentation workforce',
        },
        decisionCategory: 'contract staffing and workforce augmentation',
        filters: {
          signals: ['signs_new_client', 'hires', 'expands_offices_to'],
          industries: ['Staffing and Recruiting', 'Human Resources', 'Outsourcing/Offshoring'],
          keywordsInclude: 'staffing, contract staffing, temporary workforce, workforce solutions, staff augmentation, temp-to-hire, contract labor, RPO',
          keywordsExclude: 'in-house, internal, executive search, retained search',
          titleInclude: 'Managing Director, VP Sales, VP Business Development, Founder, Owner, Branch Manager, Regional Director',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // MARKETING / AGENCY PLACEMENT
  // Growth signals create marketing demand. Agencies monetize it.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'marketing',
    name: 'Marketing / Agency Placement',
    description: 'When companies show growth signals — marketing agencies get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'marketing.demand.growth_marketing',
        name: 'Growth Marketing Demand',
        side: 'demand',
        filters: {
          signals: ['receives_financing', 'expands_offices_to', 'expands_facilities', 'hires', 'launches'],
          keywordsInclude: 'growth, acquisition, scaling, customer acquisition, GTM, go to market, demand generation, market expansion',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'VP Marketing, Head of Growth, CMO, Founder, CEO, Head of Marketing',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'marketing.demand.performance_marketing',
        name: 'Performance Marketing Demand',
        side: 'demand',
        filters: {
          signals: ['launches', 'receives_financing', 'expands_offices_to', 'hires'],
          keywordsInclude: 'ecommerce, DTC, paid media, ROAS, performance marketing, digital advertising, conversion, revenue growth',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'Head of Performance, Growth Lead, Marketing Director, VP Marketing, Head of Digital',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'marketing.demand.brand_repositioning',
        name: 'Brand / Repositioning Demand',
        side: 'demand',
        filters: {
          signals: ['launches', 'receives_financing', 'partners_with', 'acquires'],
          keywordsInclude: 'brand, positioning, redesign, relaunch, rebrand, new identity, market repositioning, brand refresh',
          keywordsExclude: 'intern, student, course, academy, training program',
          titleInclude: 'CMO, Brand Director, VP Marketing, Head of Brand, Chief Creative Officer',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'marketing.supply.growth_agencies',
        name: 'Growth Marketing Agencies',
        side: 'supply',
        economicRole: 'running demand generation, lifecycle marketing, and growth campaigns',
        introPhrase: {
          asNeed: 'to run demand gen and growth campaigns',
          asEntity: 'growth marketing agency that runs demand gen and lifecycle campaigns',
        },
        decisionCategory: 'demand generation and growth marketing',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Marketing and Advertising', 'Online Media', 'Internet'],
          keywordsInclude: 'growth agency, demand generation, lifecycle marketing, marketing automation, growth marketing, lead generation, funnel optimization',
          keywordsExclude: 'in-house, internal, staffing, recruiting',
          titleInclude: 'Founder, CEO, Managing Director, Partner, VP Growth, Head of Client Services',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'marketing.supply.performance_agencies',
        name: 'Performance / Paid Media Agencies',
        side: 'supply',
        economicRole: 'managing paid media, PPC, and performance advertising for brands',
        introPhrase: {
          asNeed: 'to manage paid media and PPC campaigns',
          asEntity: 'performance marketing agency that manages paid media and PPC campaigns',
        },
        decisionCategory: 'paid media and performance advertising',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Marketing and Advertising', 'Online Media'],
          keywordsInclude: 'paid media, PPC, performance marketing, media buying, programmatic, paid social, paid search, digital advertising agency',
          keywordsExclude: 'in-house, internal, staffing, recruiting',
          titleInclude: 'Founder, CEO, Managing Director, Partner, Head of Media, VP Paid Media',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
      {
        id: 'marketing.supply.creative_branding',
        name: 'Creative & Branding Agencies',
        side: 'supply',
        economicRole: 'building brand identity, creative strategy, and visual design',
        introPhrase: {
          asNeed: 'to build brand identity and creative strategy',
          asEntity: 'creative and branding agency that builds brand identity and visual strategy',
        },
        decisionCategory: 'brand identity and creative direction',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'launches'],
          industries: ['Marketing and Advertising', 'Design', 'Graphic Design', 'Online Media'],
          keywordsInclude: 'branding agency, creative studio, brand strategy, design agency, visual identity, creative direction, brand consulting',
          keywordsExclude: 'in-house, internal, staffing, recruiting',
          titleInclude: 'Founder, CEO, Creative Director, Managing Director, Partner, Head of Strategy',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst, Associate',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // INSURANCE
  // Risk events create coverage gaps. Brokers monetize them.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'insurance',
    name: 'Insurance',
    description: 'When companies face risk events — insurance brokers get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'insurance.demand.expansion_risk',
        name: 'Expansion Risk',
        side: 'demand',
        filters: {
          signals: ['hires', 'opens_new_location', 'expands_offices_to', 'expands_facilities'],
          keywordsInclude: 'insurance, coverage, risk management, commercial, liability, workers comp, workers\' compensation, employee benefits',
          keywordsExclude: 'personal insurance, auto insurance, home insurance, life insurance agent, realtor',
          titleInclude: 'CFO, VP Finance, Controller, Head of Finance, COO, VP Operations, Risk Manager, Head of HR, VP People',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },
      {
        id: 'insurance.demand.transaction_structural',
        name: 'Transaction / Structural Change',
        side: 'demand',
        filters: {
          signals: ['acquires', 'merges_with', 'sells_assets_to', 'receives_financing', 'goes_public'],
          keywordsInclude: 'insurance, coverage, risk, D&O, directors and officers, cyber insurance, representations and warranties, R&W, E&O, errors and omissions',
          keywordsExclude: 'personal insurance, auto insurance, home insurance, life insurance agent, realtor',
          titleInclude: 'CFO, CEO, General Counsel, Head of Legal, VP Finance, Corporate Development, COO',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },
      {
        id: 'insurance.demand.adverse_compliance',
        name: 'Adverse Event / Compliance',
        side: 'demand',
        filters: {
          signals: ['files_suit_against', 'has_issues_with', 'decreases_headcount_by', 'closes_offices_in', 'leaves'],
          keywordsInclude: 'insurance, claims, compliance, risk, incident, cyber, breach, audit, regulatory',
          keywordsExclude: 'personal, consumer, car, home',
          titleInclude: 'General Counsel, Head of Legal, Compliance, Risk Manager, CFO, COO, CISO, Head of Security',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'insurance.supply.commercial_brokers',
        name: 'Commercial Brokers',
        side: 'supply',
        economicRole: 'placing commercial insurance and managing risk for businesses',
        introPhrase: {
          asNeed: 'to place commercial insurance and manage risk',
          asEntity: 'commercial insurance brokerage that places coverage and manages risk',
        },
        decisionCategory: 'commercial insurance and risk coverage',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'expands_offices_to'],
          industries: ['Insurance'],
          keywordsInclude: 'insurance broker, commercial insurance, brokerage, risk advisory, risk management, employee benefits, benefits broker',
          keywordsExclude: 'life insurance agent, personal lines, auto, home',
          titleInclude: 'Founder, Owner, Partner, Managing Director, Principal, President, CEO, Head of Sales',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },
      {
        id: 'insurance.supply.benefits_peo',
        name: 'Benefits / PEO',
        side: 'supply',
        economicRole: 'administering employee benefits, group health plans, and PEO services',
        introPhrase: {
          asNeed: 'to set up employee benefits and group health plans',
          asEntity: 'benefits and PEO firm that administers group health and employee plans',
        },
        decisionCategory: 'employee benefits and group health coverage',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Insurance', 'Human Resources'],
          keywordsInclude: 'employee benefits, benefits broker, group health, health plan, benefits advisory, PEO',
          keywordsExclude: 'life insurance agent, personal lines, auto, home',
          titleInclude: 'Founder, Partner, Managing Director, Principal, VP Sales, Head of Partnerships',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },
      {
        id: 'insurance.supply.specialty_lines',
        name: 'Specialty (Cyber / D&O / E&O)',
        side: 'supply',
        economicRole: 'underwriting cyber, D&O, and specialty liability coverage',
        introPhrase: {
          asNeed: 'to underwrite cyber, D&O, and specialty liability',
          asEntity: 'specialty underwriter that handles cyber, D&O, and liability coverage',
        },
        decisionCategory: 'cyber liability and specialty coverage',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Insurance'],
          keywordsInclude: 'cyber insurance, D&O, directors and officers, E&O, errors and omissions, professional liability, specialty lines',
          keywordsExclude: 'life insurance agent, personal lines, auto, home',
          titleInclude: 'Founder, Partner, Managing Director, Principal, VP Sales, Head of Underwriting, Head of Partnerships',
          titleExclude: 'Intern, Assistant, Coordinator, Analyst',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // SAAS / TECH PARTNERSHIPS
  // SaaS companies need distribution + implementation. Partners monetize it.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'saas_partnerships',
    name: 'SaaS / Tech Partnerships',
    description: 'When SaaS companies need distribution or implementation — channel partners, resellers, and consultants get paid, you sit in the middle.',
    packs: [
      // ─── 🟣 DEMAND ──────────────────────────────────────────
      {
        id: 'saas_partnerships.demand.partner_alliances',
        name: 'Partner / Alliances Motion',
        side: 'demand',
        filters: {
          signals: ['partners_with', 'integrates_with', 'signs_new_client'],
          industries: ['Computer Software', 'Internet', 'Information Technology and Services'],
          keywordsInclude: 'partner program, partnerships, alliances, channel, reseller, referral partner, integration, implementation partner',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'Head of Partnerships, VP Partnerships, VP BD, VP Business Development, Alliances, Channel, Strategic Partnerships',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },
      {
        id: 'saas_partnerships.demand.post_funding_gtm',
        name: 'Post-Funding / Scale GTM',
        side: 'demand',
        filters: {
          signals: ['receives_financing'],
          industries: ['Computer Software', 'Internet', 'Information Technology and Services'],
          keywordsInclude: 'go-to-market, channel, partnerships, reseller, implementation, onboarding, revenue operations, revops',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'CEO, COO, CRO, VP Sales, VP Revenue, Head of Partnerships, RevOps',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },
      {
        id: 'saas_partnerships.demand.product_integration',
        name: 'Product / Integration Shipping',
        side: 'demand',
        filters: {
          signals: ['integrates_with', 'is_developing', 'launches'],
          industries: ['Computer Software', 'Internet', 'Information Technology and Services'],
          keywordsInclude: 'integration, API, webhook, marketplace, app, partner, implementation',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'VP Product, Head of Product, Partnerships, Platform, Ecosystem, CTO',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },

      // ─── 🔵 SUPPLY ──────────────────────────────────────────
      {
        id: 'saas_partnerships.supply.implementation',
        name: 'Implementation Partners',
        side: 'supply',
        economicRole: 'deploying, configuring, and onboarding SaaS platforms for enterprise clients',
        introPhrase: {
          asNeed: 'to deploy and onboard enterprise SaaS platforms',
          asEntity: 'SaaS implementation partner that deploys and onboards enterprise platforms',
        },
        decisionCategory: 'implementation and onboarding support',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Information Technology and Services', 'Management Consulting', 'Computer Software'],
          keywordsInclude: 'implementation, onboarding, systems integrator, SI, consulting, professional services, deployment',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'Founder, Partner, Managing Director, Principal, Head of Partnerships, VP Sales',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },
      {
        id: 'saas_partnerships.supply.channel_resellers',
        name: 'Channel Partners / Resellers',
        side: 'supply',
        economicRole: 'reselling and distributing software products to end customers',
        introPhrase: {
          asNeed: 'to distribute and resell software to end customers',
          asEntity: 'channel partner that distributes and resells software products',
        },
        decisionCategory: 'software distribution and channel strategy',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Computer Software', 'Information Technology and Services'],
          keywordsInclude: 'reseller, channel partner, VAR, value added reseller, distributor, referral partner',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'Founder, Partner, Managing Director, Head of Partnerships, Channel Manager, VP Sales',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },
      {
        id: 'saas_partnerships.supply.growth_agencies',
        name: 'Agencies for Growth',
        side: 'supply',
        economicRole: 'driving customer acquisition through outbound, paid media, and growth marketing',
        introPhrase: {
          asNeed: 'to drive customer acquisition and outbound campaigns',
          asEntity: 'growth agency that drives customer acquisition through outbound and paid media',
        },
        decisionCategory: 'customer acquisition and go-to-market',
        filters: {
          signals: ['signs_new_client', 'partners_with', 'hires'],
          industries: ['Marketing and Advertising', 'Management Consulting'],
          keywordsInclude: 'demand gen, performance marketing, paid media, PPC, SEO, outbound, cold email, growth agency',
          keywordsExclude: 'staffing, recruiting, insurance',
          titleInclude: 'Founder, Partner, Managing Director, Head of Growth, VP Sales',
          titleExclude: 'Intern, Assistant, Coordinator, SDR, BDR',
        },
      },
    ],
  },
];

// =============================================================================
// INDUSTRY FOCUSES — reusable filter overlays, scoped by market.
// Modifies industry, keywords, and title bias. NEVER creates new packs.
// =============================================================================

export const INDUSTRY_FOCUSES: IndustryFocus[] = [
  // ─── Recruitment focuses ─────────────────────────────────────
  {
    id: 'healthcare',
    name: 'Healthcare',
    market: 'recruitment',
    industries: ['Hospital & Health Care', 'Medical Devices', 'Pharmaceuticals', 'Health, Wellness and Fitness'],
    keywordsInclude: 'healthcare, hospital, medical, clinical, patient care, nursing, health system',
    titleBias: 'VP Clinical, Chief Medical Officer, VP Nursing, VP Patient Services',
  },
  {
    id: 'it_saas',
    name: 'IT / SaaS',
    market: 'recruitment',
    industries: ['Computer Software', 'Information Technology and Services', 'Internet'],
    keywordsInclude: 'saas, software, cloud, platform, engineering, devops, product, technology',
    titleBias: 'VP Engineering, CTO, VP Product, VP Technology, Head of Engineering',
  },
  {
    id: 'logistics',
    name: 'Logistics',
    market: 'recruitment',
    industries: ['Logistics and Supply Chain', 'Transportation/Trucking/Railroad', 'Warehousing', 'Package/Freight Delivery'],
    keywordsInclude: 'logistics, supply chain, warehouse, freight, distribution, 3pl, transportation',
    titleBias: 'VP Operations, VP Supply Chain, VP Logistics, Head of Distribution',
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    market: 'recruitment',
    industries: ['Automotive', 'Machinery', 'Industrial Automation', 'Mechanical or Industrial Engineering'],
    keywordsInclude: 'manufacturing, production, assembly, quality, lean, operations, plant',
    titleBias: 'VP Manufacturing, VP Operations, Plant Manager, VP Quality',
  },
  {
    id: 'finance',
    name: 'Finance',
    market: 'recruitment',
    industries: ['Banking', 'Financial Services', 'Insurance', 'Capital Markets', 'Investment Banking'],
    keywordsInclude: 'banking, financial services, insurance, fintech, compliance, risk management',
    titleBias: 'CFO, VP Finance, Chief Risk Officer, VP Compliance, Head of Risk',
  },
  {
    id: 'construction',
    name: 'Construction',
    market: 'recruitment',
    industries: ['Construction', 'Building Materials', 'Civil Engineering', 'Architecture & Planning'],
    keywordsInclude: 'construction, building, contractor, project management, civil engineering, infrastructure',
    titleBias: 'VP Construction, Project Director, VP Operations, Head of Projects',
  },
  {
    id: 'biotech',
    name: 'Biotech',
    market: 'recruitment',
    industries: ['Biotechnology', 'Pharmaceuticals', 'Medical Devices', 'Research'],
    keywordsInclude: 'biotech, drug development, clinical trial, therapeutics, pipeline, biologics, genomics',
    titleBias: 'VP R&D, Chief Scientific Officer, VP Clinical, Head of Research',
  },
  {
    id: 'energy',
    name: 'Energy',
    market: 'recruitment',
    industries: ['Oil & Energy', 'Renewables & Environment', 'Utilities'],
    keywordsInclude: 'energy, oil, gas, renewable, solar, wind, utilities, power, clean energy',
    titleBias: 'VP Operations, VP Engineering, Chief Technology Officer, VP Energy',
  },
  {
    id: 'legal',
    name: 'Legal',
    market: 'recruitment',
    industries: ['Law Practice', 'Legal Services'],
    keywordsInclude: 'law firm, attorney, litigation, corporate law, compliance, legal services, practice group',
    titleBias: 'Managing Partner, Partner, General Counsel, Chief Legal Officer',
  },

  // ─── Marketing focuses ───────────────────────────────────────
  {
    id: 'mkt_saas_b2b',
    name: 'SaaS / B2B Tech',
    market: 'marketing',
    industries: ['Computer Software', 'Information Technology and Services', 'Internet'],
    keywordsInclude: 'saas, b2b, enterprise software, cloud platform, product-led growth, PLG, ARR',
    titleBias: 'VP Marketing, Head of Demand Gen, CMO, Head of Growth, VP Growth',
  },
  {
    id: 'mkt_ecommerce',
    name: 'Ecommerce / DTC',
    market: 'marketing',
    industries: ['Retail', 'Apparel & Fashion', 'Consumer Goods', 'Cosmetics', 'Food & Beverages'],
    keywordsInclude: 'ecommerce, DTC, direct to consumer, shopify, amazon, online retail, consumer brand',
    titleBias: 'Head of Ecommerce, VP Digital, Head of DTC, Brand Manager, CMO',
  },
  {
    id: 'mkt_fintech',
    name: 'Fintech',
    market: 'marketing',
    industries: ['Financial Services', 'Banking', 'Insurance', 'Capital Markets'],
    keywordsInclude: 'fintech, payments, neobank, insurtech, lending platform, financial technology',
    titleBias: 'CMO, VP Marketing, Head of Growth, VP Acquisition, Head of Brand',
  },
  {
    id: 'mkt_healthcare',
    name: 'Healthcare',
    market: 'marketing',
    industries: ['Hospital & Health Care', 'Medical Devices', 'Pharmaceuticals', 'Health, Wellness and Fitness'],
    keywordsInclude: 'healthcare marketing, healthtech, patient acquisition, provider marketing, medtech',
    titleBias: 'VP Marketing, CMO, Head of Patient Acquisition, VP Growth',
  },
  {
    id: 'mkt_local',
    name: 'Local Services',
    market: 'marketing',
    industries: ['Consumer Services', 'Real Estate', 'Construction', 'Restaurants', 'Hospitality'],
    keywordsInclude: 'local marketing, local SEO, franchise, multi-location, local business, service area',
    titleBias: 'Owner, Founder, VP Marketing, Head of Marketing, General Manager',
  },
];
