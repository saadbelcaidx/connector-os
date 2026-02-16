/**
 * markets-stress-test.test.ts — Multi-Market Stress Test Before Release
 *
 * PURPOSE: Prove pipeline is market-agnostic across 3 non-recruiting verticals.
 * Uses the REAL production code paths — not mocks, not approximations.
 *
 * Pipeline under test:
 *   Search (Instantly backend) → Normalize (MarketsService) → Supply Gate →
 *   Match (matching/index) → Enrich (enrichment/index) → Intro (templates/index)
 *
 * Markets tested:
 *   1. Wealth Management — capital events → wealth advisors
 *   2. Logistics / Supply Chain — ops growth → logistics consultants
 *   3. Cybersecurity / IT Services — security hiring → MSSPs/compliance vendors
 *
 * Run:
 *   MARKETS_API_KEY=<key> ANYMAIL_API_KEY=<key> npx vitest run tests/markets-stress-test.test.ts
 *
 * No code changes. Only tests + diagnostics. Results go to MARKETS_AUDIT.md.
 */

import { describe, it, expect } from 'vitest';
import { matchRecordsSync, scoreMatch } from '../src/matching/index';
import { normalizeToRecord } from '../src/services/MarketsService';
import { enrichRecord, type EnrichmentConfig, type EnrichmentResult } from '../src/enrichment/index';
import { generateDemandIntro, generateSupplyIntro, isValidIntro } from '../src/templates/index';
import { generateIntrosAI, type IntroAIConfig } from '../src/services/IntroAI';
import { extractRecordIntel, clearIntelCache, type ExtractedIntel } from '../src/services/RecordIntel';
import type { DemandRecord } from '../src/schemas/DemandRecord';
import type { SupplyRecord } from '../src/schemas/SupplyRecord';
import type { Edge } from '../src/schemas/Edge';
import { CSV_SCHEMA } from '../src/schemas';
import type { NormalizedRecord } from '../src/schemas';
import type { Match } from '../src/matching/index';
import crypto from 'crypto';

// =============================================================================
// CONFIG
// =============================================================================

const API_KEY = process.env.MARKETS_API_KEY || '';
const ANYMAIL_KEY = process.env.ANYMAIL_API_KEY || '';
const ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';
const ENRICH_ENDPOINT = 'https://api.connector-os.com/markets/enrich-batch';

// Enrichment limit per market (protect credits)
const ENRICH_LIMIT = 5;

// =============================================================================
// HELPERS — same as production pipeline
// =============================================================================

interface SearchLead {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  linkedIn?: string;
  companyName?: string;
  companyId?: number | string;
  companyLogo?: string;
  location?: string;
}

interface CompanyIntel {
  name?: string;
  description?: string;
  employee_count?: number;
  industries?: Array<{ name: string; id?: number; primary?: boolean }>;
  locations?: Array<any>;
  funding?: Array<{ amount?: string; type?: string; date?: string }>;
  news?: Array<{ title?: string; date?: string; type?: string }>;
  technologies?: Array<{ name?: string; type?: string }>;
  keywords?: { linkedIn_Data?: string[]; bright_data?: string[] };
  logo?: string;
}

async function searchLeads(filters: Record<string, any>): Promise<SearchLead[]> {
  const payload = { search_filters: filters, skip_owned_leads: false, show_one_lead_per_company: true };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Search failed: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.leads || [];
}

async function enrichCompanies(companyIds: string[]): Promise<Map<string, CompanyIntel>> {
  const result = new Map<string, CompanyIntel>();
  if (companyIds.length === 0) return result;
  const res = await fetch(ENRICH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds: [...new Set(companyIds)] }),
  });
  if (!res.ok) return result;
  const data = await res.json();
  for (const [id, company] of Object.entries(data.companies || {})) {
    if (company) result.set(String(id), company as CompanyIntel);
  }
  return result;
}

function buildRecords(leads: SearchLead[], companies: Map<string, CompanyIntel>, signalLabel: string, searchIndustry?: string): NormalizedRecord[] {
  return leads.map(lead => {
    const company = companies.get(String(lead.companyId)) || null;
    return normalizeToRecord(lead as any, company as any, signalLabel, searchIndustry || null);
  });
}

// =============================================================================
// SUPPLY QUALITY GATE (copied from MarketsService.ts — same as production)
// =============================================================================

const PROVIDER_PATTERNS = [
  /\bconsult/i, /\bagency\b/i, /\bagencies\b/i, /\bservices?\b/i,
  /\brecruit/i, /\bstaffing\b/i, /\boutsourc/i, /\bsolutions?\s+provider/i,
  /\bsystems?\s+integrat/i, /\badvisor/i, /\bmanaged\s+services/i,
  /\bimplementation/i, /\bsupport\s+services/i, /\bvendor\b/i, /\bpartner\b/i,
  /\bplacement/i, /\btalent\s+(acquisition|search|sourcing)/i,
  /\bexecutive\s+search/i, /\bprofessional\s+services/i, /\bbpo\b/i, /\bfirm\b/i,
];

const PRODUCT_PATTERNS = [
  /\bplatform\b/i, /\bsaas\b/i, /\bsoftware\s+company/i, /\bmanufactur/i,
  /\bconsumer\s+brand/i, /\be-?commerce\s+(company|brand|retailer)/i,
  /\bdevelops?\s+(software|apps?|products?)/i, /\bbuilds?\s+(software|apps?|products?)/i,
];

function isServiceProvider(record: NormalizedRecord): boolean {
  const text = [
    record.companyDescription || '',
    record.headline || '',
    record.industry || '',
    record.raw?.description || '',
  ].join(' ');
  if (text.trim().length < 10) return false;
  const hasProvider = PROVIDER_PATTERNS.some(p => p.test(text));
  const hasProduct = PRODUCT_PATTERNS.some(p => p.test(text));
  if (hasProvider) return true;
  if (hasProduct) return false;
  return false;
}

function skip() {
  if (!API_KEY) { console.log('⏭ Skipped: set MARKETS_API_KEY'); return true; }
  return false;
}

// =============================================================================
// AI CONFIG (Azure — same as production)
// =============================================================================

const AZURE_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';

function getAIConfig(): IntroAIConfig | null {
  if (!AZURE_KEY || !AZURE_ENDPOINT) return null;
  // Parse endpoint: https://outreachking.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=...
  const match = AZURE_ENDPOINT.match(/^(https:\/\/[^/]+)\/openai\/deployments\/([^/]+)/);
  if (!match) return null;
  return {
    provider: 'azure',
    apiKey: AZURE_KEY,
    azureEndpoint: match[1],
    azureDeployment: match[2],
  };
}

// =============================================================================
// DTO BUILDERS — same as Flow.tsx (lines 183-230)
// =============================================================================

function buildDemandRecord(demand: NormalizedRecord, matchObj: Match): DemandRecord {
  const raw = demand.raw || {};
  const industry = Array.isArray(demand.industry) ? demand.industry[0] || '' : (demand.industry || '');

  return {
    domain: demand.domain,
    company: demand.company,
    contact: demand.fullName || `${demand.firstName} ${demand.lastName}`.trim() || '',
    email: demand.email || '',
    title: demand.title || '',
    industry,  // Real industry string — never internal codes like "finance_co" or "tech"
    signals: [],
    metadata: {
      companyDescription: demand.companyDescription || raw.company_description || raw.description || '',
      description: demand.companyDescription || raw.company_description || raw.description || '',
      fundingType: raw.last_funding_type || null,
      fundingUsd: null,
      employeeEnum: raw.num_employees_enum || null,
    },
  };
}

function buildSupplyRecord(supply: NormalizedRecord, matchObj: Match): SupplyRecord {
  const raw = supply.raw || {};
  const capCat = matchObj.capabilityProfile?.category;
  const capabilityLabel =
    capCat === 'recruiting' ? 'talent placement' :
    capCat === 'consulting' ? 'consulting services' :
    capCat === 'marketing' ? 'growth marketing' :
    capCat === 'engineering' ? 'software development' :
    capCat === 'fractional' ? 'fractional leadership' :
    capCat === 'finance_contact' ? 'financial services' :
    null;

  const capability =
    raw.capability ||
    raw.services ||
    capabilityLabel ||
    supply.headline ||
    supply.companyDescription?.slice(0, 100) ||
    'business services';

  return {
    domain: supply.domain,
    company: supply.company,
    contact: supply.firstName || '',
    email: supply.email || '',
    title: supply.title || '',
    capability,
    targetProfile: Array.isArray(supply.industry) ? supply.industry[0] || '' : (supply.industry || ''),
    metadata: {
      companyDescription: supply.companyDescription || raw.company_description || raw.description || '',
      description: supply.companyDescription || raw.company_description || raw.description || '',
    },
  };
}

function buildEdge(demand: NormalizedRecord, signalLabel: string): Edge {
  // Build evidence from signal + company description (same as Flow's detectEdge)
  const evidence = demand.signal || signalLabel || 'showing momentum';
  return {
    type: demand.signalMeta?.kind || 'GROWTH',
    evidence,
    confidence: 0.7,
  };
}

// =============================================================================
// MARKET DEFINITIONS
// =============================================================================

interface MarketDef {
  name: string;
  demandFilters: Record<string, any>;
  demandSignalLabel: string;
  supplyFilters: Record<string, any>;
  supplySignalLabel: string;
  demandAccuracyRegex: RegExp;
  supplyAccuracyRegex: RegExp;
}

const MARKETS: MarketDef[] = [
  {
    name: 'Wealth Management',
    demandFilters: {
      news: ['receives_financing'],
      subIndustry: { include: ['Financial Services', 'Investment Management'] },
    },
    demandSignalLabel: 'Funding raised',
    supplyFilters: {
      subIndustry: { include: ['Financial Services', 'Investment Management'] },
      keywordFilter: { include: 'wealth advisory RIA family office financial advisor', exclude: '' },
    },
    supplySignalLabel: 'Wealth Advisory',
    demandAccuracyRegex: /financ|invest|capital|fund|bank|wealth|asset|insurance|venture/i,
    supplyAccuracyRegex: /advisor|advisory|wealth|financ|invest|consult|services|firm|partner|family.?office/i,
  },
  {
    name: 'Logistics / Supply Chain',
    demandFilters: {
      news: ['increases_headcount_by'],
      subIndustry: { include: ['Logistics and Supply Chain', 'Transportation/Trucking/Railroad', 'Warehousing'] },
    },
    demandSignalLabel: 'Headcount growth',
    supplyFilters: {
      // Target logistics service providers: consulting + logistics keywords
      subIndustry: { include: ['Logistics and Supply Chain', 'Management Consulting', 'Transportation/Trucking/Railroad'] },
      keywordFilter: { include: 'logistics consulting supply chain optimization 3PL freight operations advisory', exclude: '' },
    },
    supplySignalLabel: 'Logistics Consulting',
    demandAccuracyRegex: /logistic|transport|freight|warehouse|supply.?chain|shipping|fleet|trucking|distribution|fulfillment/i,
    supplyAccuracyRegex: /consult|advisor|services|solutions|optimi|firm|partner|outsourc|3pl|managed/i,
  },
  {
    name: 'Cybersecurity / IT Services',
    demandFilters: {
      news: ['hires'],
      subIndustry: { include: ['Computer & Network Security', 'Information Technology and Services'] },
    },
    demandSignalLabel: 'Hiring',
    supplyFilters: {
      // Target service providers, not product companies
      // Use consulting/services industries + security keywords (like biotech uses Staffing + life sciences)
      subIndustry: { include: ['Computer & Network Security', 'Management Consulting', 'Information Technology and Services'] },
      keywordFilter: { include: 'MSSP security consulting SOC compliance risk advisory incident response managed detection', exclude: 'SaaS platform product' },
    },
    supplySignalLabel: 'Security Services',
    demandAccuracyRegex: /security|cyber|infosec|IT|software|tech|information|computer|network|cloud/i,
    supplyAccuracyRegex: /security|consult|services|managed|compliance|advisor|firm|partner|MSSP|SOC/i,
  },
];

// =============================================================================
// RESULTS TABLE
// =============================================================================

interface MarketResult {
  market: string;
  demandCount: number;
  supplyRaw: number;
  supplyFiltered: number;
  demandAccuracy: string;
  supplyAccuracy: string;
  matchCount: number;
  avgScore: string;
  enrichAttempted: number;
  enrichSuccess: number;
  emailSuccessRate: string;
  introGenerated: number;
  introValid: number;
  verdict: 'PASS' | 'FAIL' | 'PARTIAL';
}

const results: MarketResult[] = [];

// =============================================================================
// SHARED TEST LOGIC PER MARKET
// =============================================================================

async function runMarketTest(market: MarketDef): Promise<MarketResult> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  MARKET: ${market.name}`);
  console.log(`${'='.repeat(70)}`);

  // --- STEP 1: DEMAND ---
  console.log(`\n--- DEMAND: ${market.demandSignalLabel} ---`);
  const demandLeads = await searchLeads(market.demandFilters);
  const demandIds = demandLeads.map(l => String(l.companyId)).filter(Boolean);
  const demandCompanies = await enrichCompanies(demandIds);
  const demandSearchIndustry = market.demandFilters.subIndustry?.include?.[0] || undefined;
  const demandRecords = buildRecords(demandLeads, demandCompanies, market.demandSignalLabel, demandSearchIndustry);

  console.log(`  Leads: ${demandLeads.length}, enriched companies: ${demandCompanies.size}`);
  demandRecords.slice(0, 5).forEach(r => {
    console.log(`    ${r.company} | ${r.industry || '?'} | ${r.title}`);
  });

  // Demand accuracy
  const demandAccurate = demandRecords.filter(r =>
    market.demandAccuracyRegex.test(`${r.company} ${r.industry} ${r.companyDescription}`)
  );
  const demandAccPct = demandRecords.length > 0
    ? Math.round(demandAccurate.length / demandRecords.length * 100)
    : 0;
  console.log(`  Demand accuracy: ${demandAccurate.length}/${demandRecords.length} (${demandAccPct}%)`);

  // --- STEP 2: SUPPLY ---
  console.log(`\n--- SUPPLY: ${market.supplySignalLabel} ---`);
  let supplyLeads = await searchLeads(market.supplyFilters);

  // Fallback: if keyword search returns 0, try without keywords
  if (supplyLeads.length === 0) {
    console.log('  Keyword search returned 0, trying without keywords...');
    const { keywordFilter, ...filtersWithoutKeywords } = market.supplyFilters;
    supplyLeads = await searchLeads(filtersWithoutKeywords);
  }

  const supplyIds = supplyLeads.map(l => String(l.companyId)).filter(Boolean);
  const supplyCompanies = await enrichCompanies(supplyIds);
  const supplySearchIndustry = market.supplyFilters.subIndustry?.include?.[0] || undefined;
  const supplyRecords = buildRecords(supplyLeads, supplyCompanies, market.supplySignalLabel, supplySearchIndustry);

  // Supply gate
  const filteredSupply = supplyRecords.filter(isServiceProvider);
  const dropped = supplyRecords.length - filteredSupply.length;

  console.log(`  Raw: ${supplyRecords.length}, gate kept: ${filteredSupply.length}, dropped: ${dropped}`);
  filteredSupply.slice(0, 5).forEach(r => {
    console.log(`    ${r.company} | ${r.industry || '?'} | ${r.companyDescription?.slice(0, 80) || '(none)'}`);
  });

  // Supply accuracy (among filtered)
  const supplyAccurate = filteredSupply.filter(r =>
    market.supplyAccuracyRegex.test(`${r.company} ${r.industry} ${r.companyDescription}`)
  );
  const supplyAccPct = filteredSupply.length > 0
    ? Math.round(supplyAccurate.length / filteredSupply.length * 100)
    : 0;
  console.log(`  Supply accuracy: ${supplyAccurate.length}/${filteredSupply.length} (${supplyAccPct}%)`);

  // --- STEP 3: MATCHING ---
  let matchCount = 0;
  let avgScore = 0;
  let result: ReturnType<typeof matchRecordsSync> | null = null;

  if (demandRecords.length > 0 && filteredSupply.length > 0) {
    console.log(`\n--- MATCHING ---`);
    result = matchRecordsSync(demandRecords, filteredSupply);
    matchCount = result.demandMatches.length;
    avgScore = result.stats.avgScore;

    console.log(`  Matches: ${matchCount}, avg score: ${avgScore.toFixed(1)}`);
    console.log('\n  Top 10 matches:');
    result.demandMatches.slice(0, 10).forEach(m => {
      console.log(`    ${m.demand.company} (${m.demand.industry || '?'}) → ${m.supply.company} (${m.supply.industry || '?'})`);
      console.log(`      score=${m.score} tier=${m.tier} need=${m.needProfile?.category || '?'} cap=${m.capabilityProfile?.category || '?'}`);
    });
  } else {
    console.log('\n--- MATCHING: SKIPPED (no demand or supply) ---');
  }

  // --- STEP 4: ENRICHMENT (real Anymail Finder, capped) ---
  let enrichAttempted = 0;
  let enrichSuccess = 0;

  if (ANYMAIL_KEY && demandRecords.length > 0) {
    console.log(`\n--- ENRICHMENT (limit ${ENRICH_LIMIT}) ---`);
    const enrichConfig: EnrichmentConfig = {
      anymailApiKey: ANYMAIL_KEY,
    };

    const toEnrich = demandRecords.slice(0, ENRICH_LIMIT);
    enrichAttempted = toEnrich.length;

    for (const record of toEnrich) {
      try {
        const result = await enrichRecord(record, CSV_SCHEMA, enrichConfig, record.signal);
        const found = result.outcome === 'ENRICHED' && !!result.email;
        if (found) enrichSuccess++;
        console.log(`    ${record.company} | ${record.fullName} → ${found ? result.email : 'NO EMAIL'} (${result.outcome}, source=${result.source})`);
      } catch (e: any) {
        console.log(`    ${record.company} | ${record.fullName} → ERROR: ${e.message?.slice(0, 80)}`);
      }
    }

    console.log(`  Enrichment: ${enrichSuccess}/${enrichAttempted} emails found (${enrichAttempted > 0 ? Math.round(enrichSuccess / enrichAttempted * 100) : 0}%)`);
  } else {
    console.log('\n--- ENRICHMENT: SKIPPED (no ANYMAIL_API_KEY) ---');
  }

  // --- STEP 5: INTRO GENERATION (real AI pipeline with match data) ---
  let introGenerated = 0;
  let introValid = 0;

  const aiConfig = getAIConfig();
  const useAI = !!aiConfig && demandRecords.length > 0 && filteredSupply.length > 0 && matchCount > 0;

  if (useAI && result) {
    console.log(`\n--- INTRO GENERATION (AI — Azure gpt-4o + Step 0 RecordIntel) ---`);
    clearIntelCache(); // Fresh extraction per market
    const sampleMatches = result.demandMatches.slice(0, 2);

    for (const matchObj of sampleMatches) {
      try {
        const demandCacheKey = `d_${matchObj.demand.company}_${matchObj.demand.domain}`;
        const supplyCacheKey = `s_${matchObj.supply.company}_${matchObj.supply.domain}`;

        // ====================================================================
        // RAW DATA FROM INSTANTLY (what the API returned)
        // ====================================================================
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  MATCH #${sampleMatches.indexOf(matchObj) + 1}: ${matchObj.demand.company} → ${matchObj.supply.company}`);
        console.log(`${'─'.repeat(60)}`);

        console.log(`\n  RAW DEMAND LEAD (from Instantly):`);
        console.log(`    company: "${matchObj.demand.company}"`);
        console.log(`    title: "${matchObj.demand.title}"`);
        console.log(`    industry: "${matchObj.demand.industry}"`);
        console.log(`    companyDescription: "${(matchObj.demand.companyDescription || '(null)').slice(0, 120)}"`);
        console.log(`    signal: "${matchObj.demand.signal || '(null)'}"`);
        console.log(`    headline: "${matchObj.demand.headline || '(null)'}"`);

        console.log(`\n  RAW SUPPLY LEAD (from Instantly):`);
        console.log(`    company: "${matchObj.supply.company}"`);
        console.log(`    title: "${matchObj.supply.title}"`);
        console.log(`    industry: "${matchObj.supply.industry}"`);
        console.log(`    companyDescription: "${(matchObj.supply.companyDescription || '(null)').slice(0, 120)}"`);
        console.log(`    signal: "${matchObj.supply.signal || '(null)'}"`);

        // ====================================================================
        // STEP 0: RECORD INTEL EXTRACTION (before DTO building)
        // ====================================================================
        console.log(`\n  STEP 0: EXTRACTING RECORD INTEL...`);

        const demandIntel = await extractRecordIntel(aiConfig!, {
          company: matchObj.demand.company,
          companyDescription: matchObj.demand.companyDescription,
          signal: matchObj.demand.signal,
          headline: matchObj.demand.headline,
        }, demandCacheKey);

        const supplyIntel = await extractRecordIntel(aiConfig!, {
          company: matchObj.supply.company,
          companyDescription: matchObj.supply.companyDescription,
          signal: matchObj.supply.signal,
          headline: matchObj.supply.headline,
        }, supplyCacheKey);

        console.log(`\n  DEMAND INTEL (Step 0 output):`);
        console.log(`    capability: "${demandIntel.capability}"`);
        console.log(`    signalSummary: "${demandIntel.signalSummary}"`);
        console.log(`    signalQuality: "${demandIntel.signalQuality}"`);

        console.log(`\n  SUPPLY INTEL (Step 0 output):`);
        console.log(`    capability: "${supplyIntel.capability}"`);
        console.log(`    signalSummary: "${supplyIntel.signalSummary}"`);
        console.log(`    signalQuality: "${supplyIntel.signalQuality}"`);

        // ====================================================================
        // BUILD DTOs WITH EXTRACTED INTEL (same as updated Flow.tsx)
        // ====================================================================
        const rawDemandRecord = buildDemandRecord(matchObj.demand, matchObj);
        const rawSupplyRecord = buildSupplyRecord(matchObj.supply, matchObj);
        const rawEdge = buildEdge(matchObj.demand, market.demandSignalLabel);

        // Apply Step 0 intel to DTOs (same as Flow.tsx)
        const demandSignal = demandIntel.signalSummary || rawEdge.evidence;
        const demandRecord: DemandRecord = {
          ...rawDemandRecord,
          signals: [demandSignal],
        };

        const supplyCapability =
          supplyIntel.capability ||
          rawSupplyRecord.capability;
        const supplyRecord: SupplyRecord = {
          ...rawSupplyRecord,
          capability: supplyCapability,
        };

        const edge: Edge = demandIntel.signalSummary
          ? { ...rawEdge, evidence: demandIntel.signalSummary }
          : rawEdge;

        // ====================================================================
        // BEFORE vs AFTER comparison
        // ====================================================================
        console.log(`\n  BEFORE → AFTER (Step 0 impact):`);
        console.log(`    demand.signals:     "${rawEdge.evidence}" → "${demandSignal}"`);
        console.log(`    supply.capability:  "${rawSupplyRecord.capability}" → "${supplyCapability}"`);
        console.log(`    edge.evidence:      "${rawEdge.evidence}" → "${edge.evidence}"`);

        // ====================================================================
        // FINAL DTOs FED TO AI
        // ====================================================================
        console.log(`\n  FINAL DEMAND DTO → AI:`);
        console.log(`    company: "${demandRecord.company}"`);
        console.log(`    contact: "${demandRecord.contact}"`);
        console.log(`    title: "${demandRecord.title}"`);
        console.log(`    industry: "${demandRecord.industry}"`);
        console.log(`    signals: ${JSON.stringify(demandRecord.signals)}`);
        console.log(`    metadata.companyDescription: "${(demandRecord.metadata?.companyDescription || '(null)').slice(0, 100)}"`);

        console.log(`\n  FINAL SUPPLY DTO → AI:`);
        console.log(`    company: "${supplyRecord.company}"`);
        console.log(`    contact: "${supplyRecord.contact}"`);
        console.log(`    capability: "${supplyRecord.capability}"`);

        console.log(`\n  FINAL EDGE → AI:`);
        console.log(`    type: "${edge.type}"`);
        console.log(`    evidence: "${edge.evidence}"`);

        // ====================================================================
        // AI OUTPUT (what came back)
        // ====================================================================
        const intros = await generateIntrosAI(aiConfig!, demandRecord, supplyRecord, edge);
        introGenerated += 2;

        const dValid = intros.demandIntro.length > 20;
        const sValid = intros.supplyIntro.length > 20;
        if (dValid) introValid++;
        if (sValid) introValid++;

        console.log(`\n  DEMAND INTRO:`);
        console.log(`    "${intros.demandIntro}"`);
        console.log(`  SUPPLY INTRO:`);
        console.log(`    "${intros.supplyIntro}"`);
        console.log(`  VALUE PROPS:`);
        console.log(`    demand: "${intros.valueProps.demandValueProp}"`);
        console.log(`    supply: "${intros.valueProps.supplyValueProp}"`);
      } catch (e: any) {
        console.log(`    INTRO ERROR: ${e.message?.slice(0, 200)}`);
      }
    }

    console.log(`  Intros: ${introValid}/${introGenerated} valid`);
  } else if (demandRecords.length > 0 && filteredSupply.length > 0) {
    // Fallback: deterministic templates (no AI key)
    console.log(`\n--- INTRO GENERATION (deterministic — no AI key) ---`);
    const sampleDemand = demandRecords.slice(0, 3);
    const sampleSupply = filteredSupply[0];

    for (const demand of sampleDemand) {
      try {
        const demandIntro = generateDemandIntro(demand);
        const supplyIntro = generateSupplyIntro(sampleSupply, demand);
        introGenerated += 2;

        const dValid = isValidIntro(demandIntro);
        const sValid = isValidIntro(supplyIntro);
        if (dValid) introValid++;
        if (sValid) introValid++;

        console.log(`\n    DEMAND INTRO for ${demand.company}:`);
        console.log(`      "${demandIntro}"`);
        console.log(`    SUPPLY INTRO for ${sampleSupply.company} → ${demand.company}:`);
        console.log(`      "${supplyIntro}"`);
      } catch (e: any) {
        console.log(`    INTRO ERROR: ${e.message?.slice(0, 100)}`);
      }
    }

    console.log(`  Intros: ${introValid}/${introGenerated} valid (deterministic)`);
  }

  // --- VERDICT ---
  const emailSuccessRate = enrichAttempted > 0
    ? `${Math.round(enrichSuccess / enrichAttempted * 100)}%`
    : 'N/A';

  let verdict: 'PASS' | 'FAIL' | 'PARTIAL' = 'PASS';
  if (demandRecords.length === 0 || filteredSupply.length === 0) verdict = 'FAIL';
  else if (demandAccPct < 50 || supplyAccPct < 30) verdict = 'FAIL';
  else if (matchCount === 0) verdict = 'FAIL';
  else if (demandAccPct < 70 || supplyAccPct < 50) verdict = 'PARTIAL';

  console.log(`\n  VERDICT: ${verdict}`);

  return {
    market: market.name,
    demandCount: demandRecords.length,
    supplyRaw: supplyRecords.length,
    supplyFiltered: filteredSupply.length,
    demandAccuracy: `${demandAccPct}%`,
    supplyAccuracy: `${supplyAccPct}%`,
    matchCount,
    avgScore: avgScore.toFixed(1),
    enrichAttempted,
    enrichSuccess,
    emailSuccessRate,
    introGenerated,
    introValid,
    verdict,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Multi-Market Stress Test', () => {
  for (const market of MARKETS) {
    it(`${market.name}: full pipeline`, async () => {
      if (skip()) return;

      const result = await runMarketTest(market);
      results.push(result);

      // Assertions
      expect(result.demandCount).toBeGreaterThan(0);
      expect(result.supplyFiltered).toBeGreaterThan(0);
      expect(result.matchCount).toBeGreaterThan(0);
      expect(parseFloat(result.avgScore)).toBeGreaterThan(0);
    }, 120000);
  }

  it('FINAL REPORT: Summary table', () => {
    if (skip() || results.length === 0) return;

    console.log('\n');
    console.log('='.repeat(120));
    console.log('  MULTI-MARKET STRESS TEST — FINAL REPORT');
    console.log('='.repeat(120));

    // Header
    console.log('\n' + [
      'Market'.padEnd(28),
      'Demand'.padEnd(8),
      'Supply(raw)'.padEnd(13),
      'Supply(gate)'.padEnd(14),
      'D.Acc%'.padEnd(8),
      'S.Acc%'.padEnd(8),
      'Matches'.padEnd(9),
      'AvgScore'.padEnd(10),
      'Email%'.padEnd(8),
      'Intros'.padEnd(8),
      'Verdict'.padEnd(8),
    ].join('| '));

    console.log('-'.repeat(120));

    // Rows
    for (const r of results) {
      console.log([
        r.market.padEnd(28),
        String(r.demandCount).padEnd(8),
        String(r.supplyRaw).padEnd(13),
        String(r.supplyFiltered).padEnd(14),
        r.demandAccuracy.padEnd(8),
        r.supplyAccuracy.padEnd(8),
        String(r.matchCount).padEnd(9),
        r.avgScore.padEnd(10),
        r.emailSuccessRate.padEnd(8),
        `${r.introValid}/${r.introGenerated}`.padEnd(8),
        r.verdict.padEnd(8),
      ].join('| '));
    }

    console.log('-'.repeat(120));

    // Verdict summary
    const passed = results.filter(r => r.verdict === 'PASS').length;
    const failed = results.filter(r => r.verdict === 'FAIL').length;
    const partial = results.filter(r => r.verdict === 'PARTIAL').length;

    console.log(`\n  PASS: ${passed} | PARTIAL: ${partial} | FAIL: ${failed}`);

    if (failed === 0 && partial === 0) {
      console.log('  ✓ ALL MARKETS PRODUCTION-SAFE');
    } else if (failed === 0) {
      console.log('  ⚠ PARTIAL — some markets need investigation');
    } else {
      console.log('  ✗ FAIL — investigate normalization or filters before release');
    }

    console.log('\n  Verdict rules:');
    console.log('    PASS    → D.Acc >= 70% AND S.Acc >= 50% AND matches > 0');
    console.log('    PARTIAL → D.Acc >= 50% AND S.Acc >= 30% AND matches > 0');
    console.log('    FAIL    → below thresholds or zero records');

    // All markets must at least produce matches
    for (const r of results) {
      expect(r.matchCount).toBeGreaterThan(0);
    }
  });
});
