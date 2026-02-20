/**
 * Market Presets — Serialized UI State
 *
 * Each market is a grouped set of paired Demand + Supply packs.
 * Each pack is an exact snapshot of filter values.
 * Clicking a pack calls existing setters. No logic. No backend.
 * If an operator can recreate it manually → it's correct.
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
  filters: PackFilters;
}

export interface Market {
  id: string;
  name: string;
  description: string;
  packs: Pack[];
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
];
