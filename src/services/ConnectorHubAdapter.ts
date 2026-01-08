/**
 * CONNECTOR HUB ADAPTER
 *
 * Maps Connector Hub contacts → existing flow input schema
 *
 * This is an ADAPTER, not an integration.
 * It does NOT modify existing datasets, queries, or flow logic.
 * It only transforms Hub output to match the existing flow input schema.
 */

// Data source types (hard isolation)
export type DataSource = 'hub' | 'google_maps';

// Hub contact format (from BigQuery)
export interface HubContact {
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  website: string;
  revenue: string | null;
  employee_count: string | null;
  industry: string | null;
  industry_detail: string | null;
  source?: DataSource; // Hard boundary tag
}

// Existing flow format (DemandSignal from FlowEngine)
export interface DemandSignal {
  id: string;
  domain: string;
  companyName: string;
  signalSummary: string;
  raw: any;
  contact?: {
    email: string;
    name: string;
    title: string;
  };
  intro?: string;
}

// Two-sided storage keys (Hub collects both sides before Flow)
const DEMAND_STORAGE_KEY = 'connector_hub_demand';
const SUPPLY_STORAGE_KEY = 'connector_hub_supply';

// Legacy key (backwards compatibility)
const LEGACY_STORAGE_KEY = 'connector_hub_contacts';

/**
 * Check if Hub has both sides (required for Flow)
 */
export function hasHubContacts(): boolean {
  const demand = getHubDemandContacts();
  const supply = getHubSupplyContacts();
  return demand.length > 0 && supply.length > 0;
}

/**
 * Check if Hub has demand contacts
 */
export function hasHubDemand(): boolean {
  const stored = localStorage.getItem(DEMAND_STORAGE_KEY);
  if (!stored) return false;
  try {
    const contacts = JSON.parse(stored);
    return Array.isArray(contacts) && contacts.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if Hub has supply contacts
 */
export function hasHubSupply(): boolean {
  const stored = localStorage.getItem(SUPPLY_STORAGE_KEY);
  if (!stored) return false;
  try {
    const contacts = JSON.parse(stored);
    return Array.isArray(contacts) && contacts.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get Hub DEMAND contacts from localStorage
 */
export function getHubDemandContacts(): HubContact[] {
  const stored = localStorage.getItem(DEMAND_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get Hub SUPPLY contacts from localStorage
 */
export function getHubSupplyContacts(): HubContact[] {
  const stored = localStorage.getItem(SUPPLY_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get raw Hub contacts from localStorage (legacy - returns demand)
 * @deprecated Use getHubDemandContacts() and getHubSupplyContacts() instead
 */
export function getHubContacts(): HubContact[] {
  return getHubDemandContacts();
}

/**
 * Clear all Hub contacts from localStorage
 */
export function clearHubContacts(): void {
  localStorage.removeItem(DEMAND_STORAGE_KEY);
  localStorage.removeItem(SUPPLY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY); // Clean up legacy key if exists
}

/**
 * Normalize size/employee_count to legacy string format.
 *
 * Matching engine expects: "1-10", "11-50", "51-200", "201-500", "500+"
 * Hub data has: "0 - 25", "25 - 100", numbers, null, etc.
 *
 * This ensures bit-compatibility with existing matching logic.
 */
function normalizeSize(input: any): string | null {
  if (!input) return null;

  // Already a properly formatted string
  if (typeof input === 'string') {
    // Hub format: "0 - 25", "25 - 100" → extract first number and normalize
    const match = input.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num < 11) return '1-10';
      if (num < 51) return '11-50';
      if (num < 201) return '51-200';
      if (num < 501) return '201-500';
      return '500+';
    }
    return input; // Return as-is if no numbers found
  }

  // Number input
  if (typeof input === 'number') {
    if (input < 11) return '1-10';
    if (input < 51) return '11-50';
    if (input < 201) return '51-200';
    if (input < 501) return '201-500';
    return '500+';
  }

  // Array - take first element
  if (Array.isArray(input) && input.length > 0) {
    return normalizeSize(input[0]);
  }

  return null;
}

/**
 * Extract domain from website or email
 */
function extractDomain(contact: HubContact): string {
  // Try website first
  if (contact.website) {
    try {
      const url = contact.website.startsWith('http')
        ? contact.website
        : `https://${contact.website}`;
      return new URL(url).hostname.replace('www.', '');
    } catch {
      // If URL parse fails, use as-is
      return contact.website.replace('www.', '').replace(/^https?:\/\//, '');
    }
  }

  // Fall back to email domain
  if (contact.email && contact.email.includes('@')) {
    return contact.email.split('@')[1];
  }

  // Last resort: company name slug
  return contact.company?.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

/**
 * Generate signal summary from Hub contact data.
 * CONTRACT: Event-only, 3-8 words, no enrichment.
 * Hub contacts have no event data → always fallback.
 */
function generateSignalSummary(_contact: HubContact): string {
  // Hub contacts are static lists, not events.
  // No job postings, no funding announcements, no signals.
  // Fallback is the only correct output.
  return 'showing momentum';
}

/**
 * ADAPTER: Transform Hub contacts → DemandSignal[]
 *
 * This is the bridge between Connector Hub and the existing flow.
 * It does NOT modify any existing code — it just maps data.
 */
export function adaptHubContactsToDemandSignals(contacts: HubContact[]): DemandSignal[] {
  return contacts.map((contact, idx) => {
    const domain = extractDomain(contact);
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');

    return {
      id: `hub-${domain}-${idx}`,
      domain,
      companyName: contact.company || 'Unknown Company',
      signalSummary: generateSignalSummary(contact),
      raw: contact, // Keep original Hub data
      contact: contact.email ? {
        email: contact.email,
        name: fullName || 'Contact',
        title: contact.title || '',
      } : undefined,
    };
  });
}

/**
 * Main adapter function: Get Hub contacts as DemandSignals
 *
 * Call this from the flow to get Hub data in the correct format.
 * After calling, clear the Hub contacts so they don't persist.
 */
export function getHubContactsAsDemandSignals(): DemandSignal[] {
  const hubContacts = getHubContacts();
  if (hubContacts.length === 0) return [];

  const signals = adaptHubContactsToDemandSignals(hubContacts);

  // Clear after reading (one-time handoff)
  clearHubContacts();

  console.log(`[HubAdapter] Transformed ${hubContacts.length} Hub contacts → ${signals.length} DemandSignals`);

  return signals;
}

// =============================================================================
// FLOW.TSX ADAPTER — NormalizedRecord format
// =============================================================================

// NormalizedRecord format (from schemas/index.ts)
export interface NormalizedRecord {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  title: string;
  linkedin: string | null;
  headline: string | null;
  seniorityLevel: string | null;
  company: string;
  domain: string;
  industry: string | string[] | null;
  size: string | string[] | null;
  companyDescription: string | null;
  companyFunding: string | null;
  companyRevenue: string | null;
  companyFoundedYear: string | null;
  companyLinkedin: string | null;
  signal: string;
  signalDetail: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  schemaId: string;
  raw: any;
  source?: DataSource; // Hard boundary tag (hub | google_maps)
}

/**
 * ADAPTER: Transform Hub contacts → NormalizedRecord[]
 *
 * This is the bridge between Connector Hub and Flow.tsx.
 * It maps Hub data to the exact format Flow expects.
 */
export function adaptHubContactsToNormalizedRecords(contacts: HubContact[]): NormalizedRecord[] {
  return contacts.map((contact) => {
    const domain = extractDomain(contact);
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    const source = contact.source || 'hub'; // Default to hub for backwards compatibility

    // Log source for debugging (per GPT requirement)
    if (source !== 'hub') {
      console.log(`[Flow] Source: ${source}`);
    }

    return {
      // Contact
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      fullName: fullName || 'Contact',
      email: contact.email || null,
      title: contact.title || '',
      linkedin: null,
      headline: contact.title || null,
      seniorityLevel: null,

      // Company
      company: contact.company || 'Unknown Company',
      domain,
      industry: contact.industry || contact.industry_detail || null,
      size: normalizeSize(contact.employee_count),
      companyDescription: null,
      companyFunding: null,
      companyRevenue: contact.revenue || null,
      companyFoundedYear: null,
      companyLinkedin: null,

      // Signal — event-only, no enrichment
      signal: generateSignalSummary(contact),
      signalDetail: null, // Hub has no events, signalDetail stays null

      // Location
      city: contact.city || null,
      state: contact.state || null,
      country: contact.country || null,

      // Meta
      schemaId: source === 'google_maps' ? 'google-maps' : 'connector-hub',
      raw: contact,
      source, // Hard boundary tag
    };
  });
}

/**
 * Main adapter function for Flow.tsx: Get Hub contacts as NormalizedRecords
 * @deprecated Use getHubDemandAsNormalizedRecords() and getHubSupplyAsNormalizedRecords()
 */
export function getHubContactsAsNormalizedRecords(): NormalizedRecord[] {
  const hubContacts = getHubContacts();
  if (hubContacts.length === 0) return [];

  const records = adaptHubContactsToNormalizedRecords(hubContacts);

  // INSTRUMENTATION: Verify size normalization
  records.forEach((r, i) => {
    if (i < 5) {
      console.log(`[HubAdapter] Record ${i} size: typeof=${typeof r.size}, value=${r.size}`);
    }
    // Assert contract
    if (r.size !== null && typeof r.size !== 'string') {
      console.error(`[HubAdapter] CONTRACT VIOLATION: size is ${typeof r.size}, not string|null`, r.size);
    }
  });

  // Clear after reading (one-time handoff)
  clearHubContacts();

  console.log(`[HubAdapter] Transformed ${hubContacts.length} Hub contacts → ${records.length} NormalizedRecords`);

  return records;
}

/**
 * Get Hub DEMAND contacts as NormalizedRecords for Flow.tsx
 */
export function getHubDemandAsNormalizedRecords(): NormalizedRecord[] {
  const hubContacts = getHubDemandContacts();
  if (hubContacts.length === 0) return [];

  const records = adaptHubContactsToNormalizedRecords(hubContacts);

  // INSTRUMENTATION: Verify size normalization
  records.forEach((r, i) => {
    if (i < 5) {
      console.log(`[HubAdapter:Demand] Record ${i} size: typeof=${typeof r.size}, value=${r.size}`);
    }
    // Assert contract
    if (r.size !== null && typeof r.size !== 'string') {
      console.error(`[HubAdapter:Demand] CONTRACT VIOLATION: size is ${typeof r.size}, not string|null`, r.size);
    }
  });

  console.log(`[HubAdapter] Transformed ${hubContacts.length} Hub DEMAND contacts → ${records.length} NormalizedRecords`);

  return records;
}

/**
 * Get Hub SUPPLY contacts as NormalizedRecords for Flow.tsx
 */
export function getHubSupplyAsNormalizedRecords(): NormalizedRecord[] {
  const hubContacts = getHubSupplyContacts();
  if (hubContacts.length === 0) return [];

  const records = adaptHubContactsToNormalizedRecords(hubContacts);

  // INSTRUMENTATION: Verify size normalization
  records.forEach((r, i) => {
    if (i < 5) {
      console.log(`[HubAdapter:Supply] Record ${i} size: typeof=${typeof r.size}, value=${r.size}`);
    }
    // Assert contract
    if (r.size !== null && typeof r.size !== 'string') {
      console.error(`[HubAdapter:Supply] CONTRACT VIOLATION: size is ${typeof r.size}, not string|null`, r.size);
    }
  });

  console.log(`[HubAdapter] Transformed ${hubContacts.length} Hub SUPPLY contacts → ${records.length} NormalizedRecords`);

  return records;
}

/**
 * Get BOTH sides from Hub
 * Returns { demand, supply } for Flow.tsx to process
 *
 * NOTE: Does NOT auto-clear. User must explicitly clear via Hub UI.
 * This prevents data loss if user navigates back to Hub.
 *
 * CROSS-SOURCE MATCHING BLOCK:
 * - hub ↔ hub ✅
 * - google_maps ↔ google_maps ✅
 * - hub ↔ google_maps ❌ (blocked)
 */
export function getHubBothSides(): { demand: NormalizedRecord[]; supply: NormalizedRecord[]; error?: string } {
  const demand = getHubDemandAsNormalizedRecords();
  const supply = getHubSupplyAsNormalizedRecords();

  console.log(`[HubAdapter] Read collections: ${demand.length} demand + ${supply.length} supply`);

  // Cross-source matching block
  if (demand.length > 0 && supply.length > 0) {
    const demandSource = demand[0]?.source || 'hub';
    const supplySource = supply[0]?.source || 'hub';

    if (demandSource !== supplySource) {
      console.error(`[HubAdapter] BLOCKED: Cross-source matching not allowed. Demand: ${demandSource}, Supply: ${supplySource}`);
      return {
        demand: [],
        supply: [],
        error: `Cross-source matching blocked. Demand is from "${demandSource}" but Supply is from "${supplySource}". Both must be from the same source.`,
      };
    }

    console.log(`[HubAdapter] Source match OK: ${demandSource}`);
  }

  return { demand, supply };
}

/**
 * Check URL params for Hub source
 */
export function isFromHub(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('source') === 'hub';
}
