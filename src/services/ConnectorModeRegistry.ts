/**
 * ConnectorModeRegistry.ts
 *
 * SINGLE SOURCE OF TRUTH for all connector modes.
 *
 * PRINCIPLES:
 * - Typed modes, not guessing
 * - Deterministic core
 * - Evidence gates
 * - Hard fails
 *
 * No mode = Start disabled
 * Unknown mode = blocked
 * AI may rewrite, never decide
 *
 * PHASE 6: copyTemplates in ModeContract are LEGACY (never used).
 * getCopyTemplate() now routes through introDoctrine for canonical output.
 */

import { composeIntro, ConnectorMode as DoctrineMode } from '../copy/introDoctrine';

// =============================================================================
// TYPES
// =============================================================================

export type ConnectorMode =
  | 'recruiting'
  | 'biotech_licensing'
  | 'wealth_management'
  | 'real_estate_capital'
  | 'enterprise_partnerships'
  | 'logistics'
  | 'crypto'
  | 'custom';

export type EvidenceType =
  | 'job_signal'
  | 'funding_signal'
  | 'tech_signal'
  | 'partnership_signal'
  | 'crypto_signal';

export interface EvidenceRule {
  claim: string;           // The word/phrase that requires evidence
  requiredEvidence: EvidenceType;
  errorMessage: string;    // Shown when evidence missing
}

export interface PresignalExamples {
  demand: string[];
  supply: string[];
}

export type VocabularyProfile = 'strict' | 'broad' | 'custom';

export interface ModeContract {
  id: ConnectorMode;
  label: string;
  description: string;
  docsAnchor: string;

  // Data source support
  supportedSources: string[];

  // Contract enforcement
  contracts: {
    deterministicFilters: boolean;
    safeVocabularyProfile: VocabularyProfile;
    requiresOperatorConfirmation: boolean;
  };

  // UI education
  ui: {
    tooltip: string;
    whatItDoes: string;
    whatItBlocks: string;
  };

  demand: {
    allowedIndustries: string[];
    forbiddenIndustries: string[];
    requiredFields: string[];
    defaultTitles: string[];
  };

  supply: {
    allowedIndustries: string[];
    forbiddenIndustries: string[];
    defaultTitles: string[];
    companySizeMin?: number;
  };

  vocabulary: {
    allowed: string[];
    forbidden: string[];
  };

  evidenceRules: EvidenceRule[];

  copyTemplates: {
    demand: string;
    supply: string;
  };

  presignalExamples: PresignalExamples;
}

// =============================================================================
// REGISTRY VERSION (for rollback capability)
// =============================================================================

export const MODE_REGISTRY_VERSION = '1.0.0';

// =============================================================================
// GLOBAL EVIDENCE RULES (apply to ALL modes)
// =============================================================================

const GLOBAL_EVIDENCE_RULES: EvidenceRule[] = [
  {
    claim: 'hiring',
    requiredEvidence: 'job_signal',
    errorMessage: 'Cannot say "hiring" without job posting evidence',
  },
  {
    claim: 'role',
    requiredEvidence: 'job_signal',
    errorMessage: 'Cannot reference "role" without job posting evidence',
  },
  {
    claim: 'position',
    requiredEvidence: 'job_signal',
    errorMessage: 'Cannot reference "position" without job posting evidence',
  },
  {
    claim: 'open position',
    requiredEvidence: 'job_signal',
    errorMessage: 'Cannot reference "open position" without job posting evidence',
  },
  {
    claim: 'looking for',
    requiredEvidence: 'job_signal',
    errorMessage: 'Cannot say "looking for" without job posting evidence',
  },
  {
    claim: 'raised',
    requiredEvidence: 'funding_signal',
    errorMessage: 'Cannot say "raised" without funding evidence',
  },
  {
    claim: 'funded',
    requiredEvidence: 'funding_signal',
    errorMessage: 'Cannot say "funded" without funding evidence',
  },
  {
    claim: 'Series',
    requiredEvidence: 'funding_signal',
    errorMessage: 'Cannot reference funding round without funding evidence',
  },
  {
    claim: 'uses',
    requiredEvidence: 'tech_signal',
    errorMessage: 'Cannot claim tech usage without tech stack evidence',
  },
  {
    claim: 'stack',
    requiredEvidence: 'tech_signal',
    errorMessage: 'Cannot reference tech stack without evidence',
  },
];

// =============================================================================
// MODE CONTRACTS
// =============================================================================

const RECRUITING_CONTRACT: ModeContract = {
  id: 'recruiting',
  label: 'Recruiting',
  description: 'Companies hiring → Recruiters',
  docsAnchor: 'recruiting',

  supportedSources: ['wellfound'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'strict',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting companies who need help hiring with recruiters who can help them.',
    whatItDoes: 'Finds recruiters for companies with open jobs',
    whatItBlocks: 'Pharma words, licensing words',
  },

  demand: {
    allowedIndustries: [],
    forbiddenIndustries: [],
    requiredFields: ['company', 'domain'],
    defaultTitles: ['VP', 'Director', 'Head of', 'Manager'],
  },

  supply: {
    allowedIndustries: [
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Human Resources',
      'Executive Search',
    ],
    forbiddenIndustries: [],
    defaultTitles: [
      'Partner',
      'Managing Director',
      'Director',
      'Founder',
      'CEO',
      'President',
      'Principal',
      'VP Recruiting',
      'Head of Talent',
    ],
  },

  vocabulary: {
    allowed: [
      'hiring',
      'recruiting',
      'talent',
      'candidates',
      'roles',
      'positions',
      'team',
      'scaling',
    ],
    forbidden: [
      'licensing',
      'in-licensing',
      'M&A',
      'acquisition',
      'portfolio',
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — {company} came up is {signal}. I know someone who does this. Worth an intro?',
    supply: 'Hey {firstName} — got a lead. {company} is {signal}. {contactName} is running point. Worth a look?',
  },

  presignalExamples: {
    demand: [
      'Hiring 3 engineers this quarter',
      'Recently funded, scaling team',
      'VP Engineering role open for 60+ days',
    ],
    supply: [
      'Places senior engineering roles',
      'Specializes in fintech recruiting',
      'Has placed at similar companies',
    ],
  },
};

const BIOTECH_LICENSING_CONTRACT: ModeContract = {
  id: 'biotech_licensing',
  label: 'Biotech/Pharma',
  description: 'Biotech → Pharma partners',
  docsAnchor: 'biotech',

  supportedSources: ['linkedin', 'apollo', 'csv'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'strict',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting biotech companies with pharma business development teams.',
    whatItDoes: 'Finds pharma partners for biotech companies',
    whatItBlocks: 'Recruiting words, hiring words',
  },

  demand: {
    allowedIndustries: [
      'Biotechnology',
      'Pharmaceuticals',
      'Life Sciences',
      'Healthcare',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Marketing Agency',
      'Consulting',
    ],
    requiredFields: ['company', 'domain'],
    defaultTitles: ['Founder', 'CEO', 'CSO', 'VP', 'Head of', 'Director', 'BD'],
  },

  supply: {
    allowedIndustries: [
      'Pharmaceuticals',
      'Biotechnology',
      'Life Sciences',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Human Resources',
      'Executive Search',
      'Consulting',
      'Marketing Agency',
    ],
    defaultTitles: [
      'Founder',
      'CEO',
      'VP Corporate Development',
      'VP Business Development',
      'VP Partnerships',
      'Head of Corporate Development',
      'Head of Business Development',
      'Director of Business Development',
      'Chief Business Officer',
    ],
    // REMOVED: companySizeMin (stage gating)
  },

  vocabulary: {
    allowed: [
      'licensing',
      'in-licensing',
      'partnership',
      'pipeline',
      'asset',
      'deal',
      'collaboration',
      'opportunity',
    ],
    forbidden: [
      'hiring',
      'recruiting',
      'staffing',
      'talent',
      'candidates',
      'role',
      'position',
      'headhunter',
      'placement',
    ],
  },

  // REMOVED: Phase gating evidence rules (Broad ICP doctrine)
  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — {company} came up is {signal}. Know a pharma partner that could help. Interested?',
    supply: 'Hey {firstName} — got a biotech opportunity. {company} is {signal}. {contactName} is leading the deal. Worth exploring?',
  },

  // REMOVED: Phase-specific presignal examples (Broad ICP doctrine)
  presignalExamples: {
    demand: [
      'Biotech seeking partnership',
      'Exploring licensing opportunities',
      'Pipeline activity, exploring deals',
    ],
    supply: [
      'Actively in-licensing assets',
      'Looking for partnership opportunities',
      'Recent deals in therapeutics space',
    ],
  },
};

const WEALTH_MANAGEMENT_CONTRACT: ModeContract = {
  id: 'wealth_management',
  label: 'Wealth',
  description: 'Wealthy People → Advisors',
  docsAnchor: 'wealth-management',

  supportedSources: ['linkedin', 'apollo', 'csv'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'strict',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting people with wealth managers and family offices.',
    whatItDoes: 'Finds wealth advisors for people who need them',
    whatItBlocks: 'Recruiting words, retail banking',
  },

  demand: {
    allowedIndustries: [],  // All industries - broad
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Marketing Agency',
    ],
    requiredFields: ['firstName', 'lastName'],
    defaultTitles: ['Founder', 'CEO', 'Executive', 'Partner', 'Owner'],
  },

  supply: {
    allowedIndustries: [
      'Financial Services',
      'Investment Management',
      'Wealth Management',
      'Family Office',
      'Private Banking',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Retail Banking',
      'Marketing Agency',
      'Consulting',
    ],
    defaultTitles: [
      'Founder',
      'Managing Director',
      'Partner',
      'Wealth Advisor',
      'Principal',
      'Director',
    ],
  },

  vocabulary: {
    allowed: [
      'wealth',
      'portfolio',
      'investment',
      'advisory',
      'family office',
      'estate',
      'opportunity',
    ],
    forbidden: [
      'hiring',
      'recruiting',
      'staffing',
      'role',
      'position',
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — quick note. Saw some activity that suggested you might be exploring options. I know someone who specializes in this. Worth connecting?',
    supply: 'Hey {firstName} — got an intro. {firstName} at {company} is exploring wealth advisory. Worth a conversation?',
  },

  // REMOVED: AUM thresholds, HNW references (Broad ICP doctrine)
  presignalExamples: {
    demand: [
      'Exploring wealth advisory options',
      'Looking for investment guidance',
      'Interested in diversification',
    ],
    supply: [
      'Wealth advisory practice',
      'Family office services',
      'Investment management services',
    ],
  },
};

const REAL_ESTATE_CAPITAL_CONTRACT: ModeContract = {
  id: 'real_estate_capital',
  label: 'Real Estate',
  description: 'Deals → Capital',
  docsAnchor: 'real-estate',

  supportedSources: ['linkedin', 'apollo', 'csv'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'strict',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting real estate projects with investors and capital partners.',
    whatItDoes: 'Finds investors for real estate projects',
    whatItBlocks: 'Recruiting words',
  },

  demand: {
    allowedIndustries: [
      'Real Estate',
      'Commercial Real Estate',
      'Construction',
      'Property Development',
      'Real Assets',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Marketing Agency',
    ],
    requiredFields: ['company', 'domain'],
    defaultTitles: ['Founder', 'Principal', 'Partner', 'Director', 'VP', 'CEO'],
  },

  supply: {
    allowedIndustries: [
      'Real Estate',
      'Commercial Real Estate',
      'Investment Management',
      'Private Equity',
      'Real Assets',
    ],
    // REMOVED: Residential Real Estate exclusion (Broad ICP doctrine - no commercial vs residential logic)
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Marketing Agency',
      'Consulting',
    ],
    defaultTitles: [
      'Founder',
      'Managing Director',
      'Principal',
      'Partner',
      'Director',
      'VP',
    ],
  },

  vocabulary: {
    allowed: [
      'capital',
      'investment',
      'development',
      'portfolio',
      'asset',
      'deal',
      'opportunity',
      'partnership',
    ],
    forbidden: [
      'hiring',
      'recruiting',
      'staffing',
      'role',
      'position',
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — {company} came up has a project in motion. I know capital partners actively deploying. Worth an intro?',
    supply: 'Hey {firstName} — got a deal. {company} is {signal}. Fits your criteria. Worth a look?',
  },

  // REMOVED: Dollar amounts, property type specifics (Broad ICP doctrine)
  presignalExamples: {
    demand: [
      'Real estate project seeking capital',
      'Development opportunity available',
      'Property deal in motion',
    ],
    supply: [
      'Actively deploying capital',
      'Looking for RE partnerships',
      'Seeking deal flow',
    ],
  },
};

const ENTERPRISE_PARTNERSHIPS_CONTRACT: ModeContract = {
  id: 'enterprise_partnerships',
  label: 'General B2B',
  description: 'Any market → Any partners',
  docsAnchor: 'b2b-broad',

  supportedSources: ['linkedin', 'apollo', 'csv', 'wellfound'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'broad',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting any business with potential partners. Uses safe, neutral wording.',
    whatItDoes: 'Finds business partners using safe language',
    whatItBlocks: 'Unproven claims (hiring, funding)',
  },

  demand: {
    allowedIndustries: [], // All industries allowed
    forbiddenIndustries: [
      // Avoid confusion with recruiting mode
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Employment Services',
    ],
    requiredFields: ['company', 'domain'],
    defaultTitles: ['VP', 'Director', 'Head of', 'Chief', 'Founder', 'CEO'],
  },

  supply: {
    allowedIndustries: [], // Broad - all industries
    forbiddenIndustries: [
      // Core exclusions to prevent lane confusion
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Employment Services',
      'Executive Search',
      'Recruitment',
      // Consulting/agencies that could cause confusion
      'Marketing Agency',
      'Digital Agency',
      'Creative Agency',
    ],
    defaultTitles: [
      // B2B decision maker titles (required for supply)
      'Founder',
      'Co-Founder',
      'CEO',
      'COO',
      'CRO',
      'VP Partnerships',
      'VP Business Development',
      'VP Sales',
      'VP Corporate Development',
      'Director of Partnerships',
      'Director of Business Development',
      'Director of Sales',
      'Head of Partnerships',
      'Head of Business Development',
      'Head of Strategic Alliances',
      'Partner',
      'Managing Director',
      'Principal',
      'GM',
      'General Manager',
    ],
  },

  vocabulary: {
    allowed: [
      // Neutral, safe vocabulary
      'relevant',
      'exploring',
      'connect',
      'intro',
      'opportunity',
      'potential',
      'partnership',
      'integration',
      'collaboration',
      'platform',
      'solution',
    ],
    forbidden: [
      // Claims that require evidence
      'hiring',
      'recruiting',
      'staffing',
      'role',
      'position',
      'raised',
      'funded',
      'Series',
      'expanding',  // unless evidence
      'partnered',  // unless evidence
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — some activity at {company} that might be relevant. I know someone who could help. Worth a quick intro?',
    supply: 'Hey {firstName} — got a potential opportunity. {company} is showing activity. Might be worth exploring?',
  },

  presignalExamples: {
    demand: [
      'Company showing growth signals',
      'Expanding into new markets',
      'Platform actively seeking partners',
    ],
    supply: [
      'B2B service provider in relevant space',
      'Partnership team actively sourcing',
      'Solution that fits the need',
    ],
  },
};

// =============================================================================
// LOGISTICS MODE — BROAD SUPPLY CHAIN/TRANSPORTATION (No sub-niche logic)
// =============================================================================

const LOGISTICS_CONTRACT: ModeContract = {
  id: 'logistics',
  label: 'Logistics',
  description: 'Supply Chain → Partners',
  docsAnchor: 'logistics',

  supportedSources: ['linkedin', 'apollo', 'csv'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'strict',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting logistics and supply chain operators.',
    whatItDoes: 'Routes logistics operators to partners',
    whatItBlocks: 'Recruiting words, staffing language',
  },

  demand: {
    allowedIndustries: [
      'Logistics and Supply Chain',
      'Transportation/Trucking/Railroad',
      'Warehousing',
      'Package/Freight Delivery',
      'Import and Export',
      'Maritime',
      'Airlines/Aviation',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Human Resources',
      'Executive Search',
      'Consulting',
      'Marketing Agency',
    ],
    requiredFields: ['company', 'domain'],
    defaultTitles: ['Founder', 'CEO', 'COO', 'VP', 'Director', 'Head of', 'GM'],
  },

  supply: {
    allowedIndustries: [
      'Logistics and Supply Chain',
      'Transportation/Trucking/Railroad',
      'Warehousing',
      'Package/Freight Delivery',
      'Import and Export',
      'Maritime',
      'Airlines/Aviation',
    ],
    forbiddenIndustries: [
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Human Resources',
      'Executive Search',
      'Consulting',
      'Marketing Agency',
    ],
    defaultTitles: [
      'Founder',
      'CEO',
      'COO',
      'VP Operations',
      'VP Supply Chain',
      'Director of Logistics',
      'Head of Operations',
      'General Manager',
    ],
  },

  vocabulary: {
    allowed: [
      'logistics',
      'supply chain',
      'freight',
      'carrier',
      'shipment',
      'route',
      'fleet',
      'distribution',
      'warehouse',
      'fulfillment',
    ],
    forbidden: [
      'hiring',
      'recruiting',
      'staffing',
      'talent',
      'candidates',
      'role',
      'position',
      'headhunter',
      'placement',
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — {company} came up in the space. Know an operator that could help. Interested?',
    supply: 'Hey {firstName} — got an opportunity. {company} could be a fit. Worth a look?',
  },

  presignalExamples: {
    demand: [
      'Looking for logistics partners',
      'Exploring distribution options',
    ],
    supply: [
      'Capacity available',
      'Looking for new routes',
    ],
  },
};

// =============================================================================
// CRYPTO MODE — BROAD WEB3/BLOCKCHAIN (No sub-niche logic)
// =============================================================================

const CRYPTO_CONTRACT: ModeContract = {
  id: 'crypto',
  label: 'Crypto/Web3',
  description: 'Crypto → Partners',
  docsAnchor: 'crypto',

  supportedSources: ['linkedin', 'apollo', 'csv'],

  contracts: {
    deterministicFilters: true,
    safeVocabularyProfile: 'broad',
    requiresOperatorConfirmation: false,
  },

  ui: {
    tooltip: 'For connecting crypto and Web3 companies with partners.',
    whatItDoes: 'Finds partners for crypto companies',
    whatItBlocks: 'Unproven claims (token launch, fundraising)',
  },

  demand: {
    // BROAD industries only - no sub-segments (defi, L2, exchanges, etc.)
    allowedIndustries: [
      'Blockchain',
      'Cryptocurrency',
      'Web3',
      'Fintech',
      'Decentralized Finance',
      'DeFi',
    ],
    forbiddenIndustries: [
      'Marketing Agency',
      'Digital Agency',
      'Staffing and Recruiting',
      'Software Outsourcing',
      'Consulting',
    ],
    requiredFields: ['company', 'domain'],
    // Role families only - no specialties
    defaultTitles: ['Founder', 'Co-Founder', 'CEO', 'CTO', 'Head of Partnerships', 'BD', 'Operations'],
  },

  supply: {
    // IDENTICAL logic to demand - broad industries only
    allowedIndustries: [
      'Blockchain',
      'Cryptocurrency',
      'Web3',
      'Fintech',
      'Decentralized Finance',
      'DeFi',
      'Venture Capital',
      'Investment Management',
    ],
    forbiddenIndustries: [
      'Marketing Agency',
      'Digital Agency',
      'Staffing and Recruiting',
      'Staffing & Recruiting',
      'Software Outsourcing',
      'Consulting',
    ],
    // Role families only - no specialties
    defaultTitles: ['Founder', 'Co-Founder', 'CEO', 'CTO', 'Head of Partnerships', 'BD', 'Operations', 'Partner'],
  },

  vocabulary: {
    allowed: [
      // Neutral, safe vocabulary
      'crypto',
      'web3',
      'blockchain',
      'partnership',
      'opportunity',
      'relevant',
      'exploring',
      'connect',
    ],
    forbidden: [
      // Claims that require evidence
      'hiring',
      'recruiting',
      'staffing',
      'role',
      'position',
      'raised',
      'funded',
      'Series',
      // Crypto-specific forbidden claims (require evidence)
      'token launch',
      'fundraise',
      'fundraising',
      'listing',
      'protocol expansion',
      'TGE',
    ],
  },

  // Crypto-specific evidence rules
  evidenceRules: [
    {
      claim: 'token launch',
      requiredEvidence: 'crypto_signal',
      errorMessage: 'Cannot reference token launch without evidence',
    },
    {
      claim: 'fundraise',
      requiredEvidence: 'funding_signal',
      errorMessage: 'Cannot reference fundraising without evidence',
    },
    {
      claim: 'listing',
      requiredEvidence: 'crypto_signal',
      errorMessage: 'Cannot reference listing without evidence',
    },
  ],

  copyTemplates: {
    demand: 'Hey {firstName} — some activity at {company}. I know someone in the space who might be relevant. Worth a quick intro?',
    supply: 'Hey {firstName} — got a potential opportunity. {company} is showing activity. Worth exploring?',
  },

  // NO sub-niche references - broad presignal examples only
  presignalExamples: {
    demand: [
      'Web3 company seeking partnerships',
      'Crypto project exploring opportunities',
      'Blockchain company showing activity',
    ],
    supply: [
      'Active in crypto/web3 space',
      'Partnerships in blockchain ecosystem',
      'Investing in web3 companies',
    ],
  },
};

const CUSTOM_CONTRACT: ModeContract = {
  id: 'custom',
  label: 'Custom',
  description: 'You define the rules',
  docsAnchor: 'custom',

  supportedSources: ['linkedin', 'apollo', 'csv', 'wellfound', 'any'],

  contracts: {
    deterministicFilters: false,
    safeVocabularyProfile: 'custom',
    requiresOperatorConfirmation: true,
  },

  ui: {
    tooltip: 'You pick everything. No auto-filtering. You must confirm before starting.',
    whatItDoes: 'Lets you use any data without filtering',
    whatItBlocks: 'Unproven claims (hiring, funding). You pick the datasets.',
  },

  demand: {
    allowedIndustries: [],  // All allowed
    forbiddenIndustries: [], // None blocked
    requiredFields: ['company', 'domain'],
    defaultTitles: [],  // User must configure
  },

  supply: {
    allowedIndustries: [],  // All allowed
    forbiddenIndustries: [], // None blocked
    defaultTitles: [],  // User must configure
  },

  vocabulary: {
    allowed: [
      // Neutral vocabulary only
      'relevant',
      'exploring',
      'connect',
      'intro',
      'opportunity',
      'potential',
    ],
    forbidden: [
      // Confident claims blocked without evidence
      'hiring',
      'recruiting',
      'role',
      'position',
      'raised',
      'funded',
      'Series',
      'expanding',
      'partnered',
      // Extra confidence words blocked in custom
      'i saw',
      'noticed you\'re hiring',
      'you\'re raising',
      'you\'re expanding',
    ],
  },

  evidenceRules: [],

  copyTemplates: {
    demand: 'Hey {firstName} — some activity at {company}. I know someone who might be relevant. Worth a quick intro?',
    supply: 'Hey {firstName} — got a potential lead. {company} is showing activity. Might be worth a look?',
  },

  presignalExamples: {
    demand: [
      'Custom demand signal (you define)',
      'Industry-specific observation',
    ],
    supply: [
      'Custom supply context (you define)',
      'Provider-specific fit',
    ],
  },
};

// =============================================================================
// REGISTRY
// =============================================================================

const MODE_REGISTRY: Record<ConnectorMode, ModeContract> = {
  recruiting: RECRUITING_CONTRACT,
  biotech_licensing: BIOTECH_LICENSING_CONTRACT,
  wealth_management: WEALTH_MANAGEMENT_CONTRACT,
  real_estate_capital: REAL_ESTATE_CAPITAL_CONTRACT,
  enterprise_partnerships: ENTERPRISE_PARTNERSHIPS_CONTRACT,
  logistics: LOGISTICS_CONTRACT,
  crypto: CRYPTO_CONTRACT,
  custom: CUSTOM_CONTRACT,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get contract for a mode. Throws if mode unknown.
 */
export function getModeContract(mode: ConnectorMode): ModeContract {
  const contract = MODE_REGISTRY[mode];
  if (!contract) {
    throw new Error(`Unknown connector mode: ${mode}`);
  }
  return contract;
}

/**
 * Get all evidence rules for a mode (global + mode-specific)
 */
export function getEvidenceRules(mode: ConnectorMode): EvidenceRule[] {
  const contract = getModeContract(mode);
  return [...GLOBAL_EVIDENCE_RULES, ...contract.evidenceRules];
}

/**
 * Check if a mode is valid
 */
export function isValidMode(mode: string): mode is ConnectorMode {
  return mode in MODE_REGISTRY;
}

/**
 * Get all available modes for UI
 */
export function getAvailableModes(): { id: ConnectorMode; label: string; description: string }[] {
  return Object.values(MODE_REGISTRY).map(contract => ({
    id: contract.id,
    label: contract.label,
    description: contract.description,
  }));
}

/**
 * Get forbidden vocabulary for a mode
 */
export function getForbiddenVocabulary(mode: ConnectorMode): string[] {
  const contract = getModeContract(mode);
  return contract.vocabulary.forbidden;
}

/**
 * Get allowed vocabulary for a mode
 */
export function getAllowedVocabulary(mode: ConnectorMode): string[] {
  const contract = getModeContract(mode);
  return contract.vocabulary.allowed;
}

/**
 * Get copy template for a side.
 * PHASE 6: Routes through introDoctrine for canonical, doctrine-compliant output.
 * Legacy copyTemplates in ModeContract are ignored.
 */
export function getCopyTemplate(mode: ConnectorMode, side: 'demand' | 'supply'): string {
  // Map ConnectorMode to DoctrineMode (they overlap but have different type definitions)
  const doctrineMode: DoctrineMode = mode === 'recruiting' ? 'recruiting'
    : mode === 'biotech_licensing' ? 'biotech_licensing'
    : mode === 'crypto' ? 'crypto'
    : 'b2b_general';

  return composeIntro({
    side: side === 'demand' ? 'demand' : 'supply',
    mode: doctrineMode,
    ctx: {
      firstName: '{firstName}',
      company: '{company}',
    },
  });
}

/**
 * Check if an industry is allowed for supply in this mode
 */
export function isSupplyIndustryAllowed(mode: ConnectorMode, industry: string): boolean {
  const contract = getModeContract(mode);
  const industryLower = industry.toLowerCase();

  // Check forbidden first
  for (const forbidden of contract.supply.forbiddenIndustries) {
    if (industryLower.includes(forbidden.toLowerCase())) {
      return false;
    }
  }

  // If allowlist is empty, all non-forbidden are allowed
  if (contract.supply.allowedIndustries.length === 0) {
    return true;
  }

  // Check allowlist
  for (const allowed of contract.supply.allowedIndustries) {
    if (industryLower.includes(allowed.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an industry is forbidden for supply in this mode
 */
export function isSupplyIndustryForbidden(mode: ConnectorMode, industry: string): { forbidden: boolean; reason?: string } {
  const contract = getModeContract(mode);
  const industryLower = industry.toLowerCase();

  for (const forbidden of contract.supply.forbiddenIndustries) {
    if (industryLower.includes(forbidden.toLowerCase())) {
      return {
        forbidden: true,
        reason: `Industry "${industry}" is forbidden in ${contract.label} mode`,
      };
    }
  }

  return { forbidden: false };
}

/**
 * Get presignal examples for a mode and side
 */
export function getPresignalExamples(mode: ConnectorMode, side: 'demand' | 'supply'): string[] {
  const contract = getModeContract(mode);
  return contract.presignalExamples[side];
}

/**
 * Get the docs anchor for a mode
 */
export function getModeDocsAnchor(mode: ConnectorMode): string {
  const contract = getModeContract(mode);
  return contract.docsAnchor;
}

export { GLOBAL_EVIDENCE_RULES };
