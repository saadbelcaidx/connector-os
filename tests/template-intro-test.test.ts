/**
 * template-intro-test.test.ts — Operator Template Intro Test
 *
 * Tests the proven 2-sentence template approach across 3 markets.
 * AI fills variables, doesn't write emails.
 *
 * Supply: "Not sure how many people are on your waiting list, but I got a couple [dreamICP] who are looking for [painTheySolve]"
 * Demand: "Saw {{company}} [signalEvent]. I'm connected to a [supplierType] who's been doing [exactlyWhatTheyNeed] for [similarCompanies]"
 *
 * Run:
 *   MARKETS_API_KEY=<key> AZURE_OPENAI_KEY=<key> AZURE_OPENAI_ENDPOINT=<url> npx vitest run tests/template-intro-test.test.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeToRecord } from '../src/services/MarketsService';
import { matchRecordsSync } from '../src/matching/index';
import { extractRecordIntel, clearIntelCache } from '../src/services/RecordIntel';
import { callAI, type IntroAIConfig } from '../src/services/IntroAI';
import type { NormalizedRecord } from '../src/schemas';

// =============================================================================
// CONFIG
// =============================================================================

const API_KEY = process.env.MARKETS_API_KEY || '';
const AZURE_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';
const ENRICH_ENDPOINT = 'https://api.connector-os.com/markets/enrich-batch';

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
];

function isServiceProvider(record: NormalizedRecord): boolean {
  const text = [record.companyDescription || '', record.headline || '', record.industry || '', record.raw?.description || ''].join(' ');
  if (text.trim().length < 10) return false;
  if (PROVIDER_PATTERNS.some(p => p.test(text))) return true;
  if (PRODUCT_PATTERNS.some(p => p.test(text))) return false;
  return false;
}

function getAIConfig(): IntroAIConfig | null {
  if (!AZURE_KEY || !AZURE_ENDPOINT) return null;
  const match = AZURE_ENDPOINT.match(/^(https:\/\/[^/]+)\/openai\/deployments\/([^/]+)/);
  if (!match) return null;
  return { provider: 'azure', apiKey: AZURE_KEY, azureEndpoint: match[1], azureDeployment: match[2] };
}

// =============================================================================
// API HELPERS
// =============================================================================

async function searchLeads(filters: Record<string, any>): Promise<any[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ search_filters: filters, skip_owned_leads: false, show_one_lead_per_company: true }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return (await res.json()).leads || [];
}

async function enrichCompanies(ids: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (ids.length === 0) return result;
  const res = await fetch(ENRICH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds: [...new Set(ids)] }),
  });
  if (!res.ok) return result;
  const data = await res.json();
  for (const [id, co] of Object.entries(data.companies || {})) {
    if (co) result.set(String(id), co as any);
  }
  return result;
}

// =============================================================================
// VARIABLE-FILL PROMPTS (AI fills blanks, doesn't write emails)
// =============================================================================

function buildSupplyVariablesPrompt(
  demandCapability: string,
  demandSignal: string,
  demandIndustry: string,
  demandDescription: string,
): string {
  return `You are filling in variables for a cold email template. Output ONLY the two variables, nothing else.

TEMPLATE:
"Not sure how many people are on your waiting list, but I got a couple [dreamICP] who are looking for [painTheySolve]"

DATA ABOUT THE DEMAND SIDE (the companies you're describing):
- CAPABILITY: ${demandCapability}
- SIGNAL: ${demandSignal}
- INDUSTRY: ${demandIndustry}
- DESCRIPTION: ${demandDescription.slice(0, 300)}

RULES FOR [dreamICP]:
- Must be a plural ICP group written the way operators talk
- Good: "pharma companies", "fintech startups in payments", "logistics firms scaling ops", "mid-market SaaS companies"
- Bad: "decision-makers", "stakeholders", "leaders", "organizations" (corporate speak)
- 3-6 words max

RULES FOR [painTheySolve]:
- Must be how they'd naturally complain, not corporate jargon
- Good: "senior clinical and regulatory talent", "help scaling cross-border payments", "reliable logistics partners who can keep up"
- Bad: "optimize operations", "leverage synergies", "streamline workflows"
- Derive from the DATA — do NOT hallucinate
- 5-10 words max

Output JSON only:
{"dreamICP": "...", "painTheySolve": "..."}`;
}

function buildDemandVariablesPrompt(
  demandSignal: string,
  supplyCapability: string,
  supplyIndustry: string,
  supplyDescription: string,
  demandIndustry: string,
): string {
  return `You are filling in variables for a cold email template. Output ONLY the three variables, nothing else.

TEMPLATE:
"Saw {{companyName}} [signalEvent]. I'm connected to a [supplierType] who's been doing [exactlyWhatTheyNeed] for [similarCompanies]"

DATA ABOUT THE SUPPLY SIDE (the person you're describing anonymously):
- CAPABILITY: ${supplyCapability}
- INDUSTRY: ${supplyIndustry}
- DESCRIPTION: ${supplyDescription.slice(0, 300)}

DATA ABOUT THE DEMAND SIDE (who you're writing to):
- SIGNAL: ${demandSignal}
- INDUSTRY: ${demandIndustry}

RULES FOR [signalEvent]:
- Plain fact, past tense, what happened
- Good: "just launched a settlement tool for banks", "brought on a new CTO", "raised a Series A"
- Bad: "is actively seeking strategic partnerships" (corporate), "active in market" (vague — if signal is vague, say "is expanding" or "is growing the team")
- 4-10 words max

RULES FOR [supplierType]:
- Anonymous descriptor of the supplier. NO company name. NO person name.
- Good: "boutique recruitment firm in life sciences", "wealth advisory practice out of DC", "logistics consultancy, US nationwide"
- Bad: "Singh Capital Partners" (name!), "a company" (too vague), "a leading provider" (corporate)
- 5-10 words max

RULES FOR [exactlyWhatTheyNeed]:
- What the supplier actually does for companies like the demand company
- Good: "placing senior regulatory hires", "managing cross-border settlement", "running freight ops coast to coast"
- Bad: "providing solutions", "helping companies grow" (vague corporate speak)
- 4-8 words max

RULES FOR [similarCompanies]:
- Social proof bucket — who else the supplier works with
- Good: "companies like yours", "other Series B fintechs", "firms in your space"
- Bad: "various organizations" (corporate)
- 2-5 words max

Output JSON only:
{"signalEvent": "...", "supplierType": "...", "exactlyWhatTheyNeed": "...", "similarCompanies": "..."}`;
}

// =============================================================================
// ASSEMBLE FINAL EMAILS
// =============================================================================

function assembleSupplyIntro(
  firstName: string,
  vars: { dreamICP: string; painTheySolve: string },
): string {
  const name = firstName || 'there';
  return `Hey ${name}\n\nNot sure how many people are on your waiting list, but I got a couple ${vars.dreamICP} who are looking for ${vars.painTheySolve}\n\nWorth an intro?`;
}

function assembleDemandIntro(
  firstName: string,
  companyName: string,
  vars: { signalEvent: string; supplierType: string; exactlyWhatTheyNeed: string; similarCompanies: string },
): string {
  const name = firstName || 'there';
  return `Hey ${name}\n\nSaw ${companyName} ${vars.signalEvent}. I'm connected to a ${vars.supplierType} who's been doing ${vars.exactlyWhatTheyNeed} for ${vars.similarCompanies}\n\nWant an intro?`;
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
}

const MARKETS: MarketDef[] = [
  {
    name: 'Wealth Management',
    demandFilters: { news: ['receives_financing'], subIndustry: { include: ['Financial Services', 'Investment Management'] } },
    demandSignalLabel: 'Funding raised',
    supplyFilters: { subIndustry: { include: ['Financial Services', 'Investment Management'] } },
    supplySignalLabel: 'Wealth Advisory',
  },
  {
    name: 'Logistics / Supply Chain',
    demandFilters: { news: ['increases_headcount_by'], subIndustry: { include: ['Logistics and Supply Chain', 'Transportation/Trucking/Railroad', 'Warehousing'] } },
    demandSignalLabel: 'Headcount growth',
    supplyFilters: { subIndustry: { include: ['Logistics and Supply Chain', 'Management Consulting', 'Transportation/Trucking/Railroad'] } },
    supplySignalLabel: 'Logistics Consulting',
  },
  {
    name: 'Cybersecurity / IT Services',
    demandFilters: { news: ['hires'], subIndustry: { include: ['Computer & Network Security', 'Information Technology and Services'] } },
    demandSignalLabel: 'Hiring',
    supplyFilters: { subIndustry: { include: ['Computer & Network Security', 'Management Consulting', 'Information Technology and Services'] } },
    supplySignalLabel: 'Security Services',
  },
];

// =============================================================================
// TEST
// =============================================================================

describe('Operator Template Intros — 3 Markets', () => {
  for (const market of MARKETS) {
    it(`${market.name}: template variable fill`, async () => {
      if (!API_KEY || !AZURE_KEY) { console.log('Skipped: set API keys'); return; }

      const aiConfig = getAIConfig()!;
      clearIntelCache();

      console.log(`\n${'='.repeat(70)}`);
      console.log(`  MARKET: ${market.name}`);
      console.log(`${'='.repeat(70)}`);

      // Fetch data
      const demandLeads = await searchLeads(market.demandFilters);
      let supplyLeads = await searchLeads(market.supplyFilters);
      if (supplyLeads.length === 0) {
        const { keywordFilter, ...rest } = market.supplyFilters;
        supplyLeads = await searchLeads(rest);
      }

      const demandIds = demandLeads.map((l: any) => String(l.companyId)).filter(Boolean);
      const supplyIds = supplyLeads.map((l: any) => String(l.companyId)).filter(Boolean);
      const demandCompanies = await enrichCompanies(demandIds);
      const supplyCompanies = await enrichCompanies(supplyIds);

      const demandRecords = demandLeads.map((l: any) =>
        normalizeToRecord(l, demandCompanies.get(String(l.companyId)) || null, market.demandSignalLabel, market.demandFilters.subIndustry?.include?.[0] || null)
      );
      const supplyRecords = supplyLeads.map((l: any) =>
        normalizeToRecord(l, supplyCompanies.get(String(l.companyId)) || null, market.supplySignalLabel, market.supplyFilters.subIndustry?.include?.[0] || null)
      );
      const filteredSupply = supplyRecords.filter(isServiceProvider);

      console.log(`  Demand: ${demandRecords.length} | Supply: ${filteredSupply.length}`);

      // Match
      if (demandRecords.length === 0 || filteredSupply.length === 0) {
        console.log('  SKIP — no data');
        return;
      }
      const matching = matchRecordsSync(demandRecords, filteredSupply);
      const pairs = matching.demandMatches.slice(0, 2);

      console.log(`  Matches: ${matching.demandMatches.length} | Testing: ${pairs.length}`);

      for (const matchObj of pairs) {
        const demand = matchObj.demand;
        const supply = matchObj.supply;

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  ${demand.company} → ${supply.company}`);
        console.log(`${'─'.repeat(60)}`);

        // Step 0: Extract intel
        const demandIntel = await extractRecordIntel(aiConfig, {
          company: demand.company,
          companyDescription: demand.companyDescription,
          signal: demand.signal,
          headline: demand.headline,
        }, `d_${demand.company}_${demand.domain}`);

        const supplyIntel = await extractRecordIntel(aiConfig, {
          company: supply.company,
          companyDescription: supply.companyDescription,
          signal: supply.signal,
          headline: supply.headline,
        }, `s_${supply.company}_${supply.domain}`);

        console.log(`\n  STEP 0 EXTRACTION:`);
        console.log(`    Demand: capability="${demandIntel.capability}" signal="${demandIntel.signalSummary}" quality=${demandIntel.signalQuality}`);
        console.log(`    Supply: capability="${supplyIntel.capability}" signal="${supplyIntel.signalSummary}" quality=${supplyIntel.signalQuality}`);

        const demandIndustry = typeof demand.industry === 'string' ? demand.industry : '';
        const supplyIndustry = typeof supply.industry === 'string' ? supply.industry : '';

        // Fill SUPPLY template variables
        console.log(`\n  FILLING SUPPLY TEMPLATE VARIABLES...`);
        const supplyVarsRaw = await callAI(aiConfig, buildSupplyVariablesPrompt(
          demandIntel.capability,
          demandIntel.signalSummary,
          demandIndustry,
          demand.companyDescription || '',
        ));
        let supplyVars: { dreamICP: string; painTheySolve: string };
        try {
          supplyVars = JSON.parse(supplyVarsRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch {
          console.log(`    PARSE ERROR: ${supplyVarsRaw.slice(0, 200)}`);
          supplyVars = { dreamICP: 'companies in your space', painTheySolve: 'help with what they need' };
        }

        console.log(`    dreamICP: "${supplyVars.dreamICP}"`);
        console.log(`    painTheySolve: "${supplyVars.painTheySolve}"`);

        // Fill DEMAND template variables
        console.log(`\n  FILLING DEMAND TEMPLATE VARIABLES...`);
        const demandVarsRaw = await callAI(aiConfig, buildDemandVariablesPrompt(
          demandIntel.signalSummary,
          supplyIntel.capability,
          supplyIndustry,
          supply.companyDescription || '',
          demandIndustry,
        ));
        let demandVars: { signalEvent: string; supplierType: string; exactlyWhatTheyNeed: string; similarCompanies: string };
        try {
          demandVars = JSON.parse(demandVarsRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch {
          console.log(`    PARSE ERROR: ${demandVarsRaw.slice(0, 200)}`);
          demandVars = { signalEvent: 'is growing', supplierType: 'firm in your space', exactlyWhatTheyNeed: 'this exact thing', similarCompanies: 'companies like yours' };
        }

        console.log(`    signalEvent: "${demandVars.signalEvent}"`);
        console.log(`    supplierType: "${demandVars.supplierType}"`);
        console.log(`    exactlyWhatTheyNeed: "${demandVars.exactlyWhatTheyNeed}"`);
        console.log(`    similarCompanies: "${demandVars.similarCompanies}"`);

        // Assemble final emails
        const supplyEmail = assembleSupplyIntro(supply.firstName || '', supplyVars);
        const demandEmail = assembleDemandIntro(demand.firstName || '', demand.company, demandVars);

        // Check for name leaks
        const supplyLeaked = supplyEmail.toLowerCase().includes(demand.company.toLowerCase());
        const demandLeaked = demandEmail.toLowerCase().includes(supply.company.toLowerCase()) ||
          (supply.firstName && demandEmail.toLowerCase().includes(supply.firstName.toLowerCase()));

        console.log(`\n  SUPPLY EMAIL (to ${supply.company})${supplyLeaked ? ' ⚠️ DEMAND NAME LEAKED' : ' ✓ anonymous'}:`);
        console.log(`  ┌──────────────────────────────────────────────`);
        supplyEmail.split('\n').forEach(line => console.log(`  │ ${line}`));
        console.log(`  └──────────────────────────────────────────────`);

        console.log(`\n  DEMAND EMAIL (to ${demand.company})${demandLeaked ? ' ⚠️ SUPPLY NAME LEAKED' : ' ✓ anonymous'}:`);
        console.log(`  ┌──────────────────────────────────────────────`);
        demandEmail.split('\n').forEach(line => console.log(`  │ ${line}`));
        console.log(`  └──────────────────────────────────────────────`);

        expect(supplyEmail.length).toBeGreaterThan(20);
        expect(demandEmail.length).toBeGreaterThan(20);
        // Supply email must NOT contain demand company name
        expect(supplyEmail.toLowerCase()).not.toContain(demand.company.toLowerCase());
      }
    }, 120000);
  }
});
