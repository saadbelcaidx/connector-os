/**
 * anonymous-intro-test.test.ts — Proof-of-concept: Anonymous Intros
 *
 * Takes REAL match data from Instantly API (same pipeline as stress test),
 * runs Step 0 extraction, then generates intros WITH and WITHOUT names.
 * Side-by-side comparison to prove anonymous intros work with existing data.
 *
 * Run:
 *   MARKETS_API_KEY=<key> AZURE_OPENAI_KEY=<key> AZURE_OPENAI_ENDPOINT=<url> npx vitest run tests/anonymous-intro-test.test.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeToRecord } from '../src/services/MarketsService';
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

function getAIConfig(): IntroAIConfig | null {
  if (!AZURE_KEY || !AZURE_ENDPOINT) return null;
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
// HELPERS
// =============================================================================

async function searchLeads(filters: Record<string, any>): Promise<any[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ search_filters: filters, skip_owned_leads: false, show_one_lead_per_company: true }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  return data.leads || [];
}

async function enrichCompanies(companyIds: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (companyIds.length === 0) return result;
  const res = await fetch(ENRICH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds: [...new Set(companyIds)] }),
  });
  if (!res.ok) return result;
  const data = await res.json();
  for (const [id, company] of Object.entries(data.companies || {})) {
    if (company) result.set(String(id), company as any);
  }
  return result;
}

// =============================================================================
// ANONYMOUS DESCRIPTOR PROMPT (added to RecordIntel extraction)
// =============================================================================

async function extractAnonymousDescriptor(
  config: IntroAIConfig,
  record: { company: string; companyDescription?: string | null; industry?: string; employeeCount?: string | null }
): Promise<string> {
  const prompt = `Generate a 1-line anonymous company descriptor. NO company name. Include: sector, size hint, geography if available.

COMPANY: ${record.company}
DESCRIPTION: ${(record.companyDescription || '').slice(0, 300)}
INDUSTRY: ${record.industry || ''}
SIZE: ${record.employeeCount || ''}

Good examples:
- "a mid-size wealth management firm in France, ~12 advisors"
- "an early-stage fintech in India, working capital loans for SMBs"
- "a US logistics company, nationwide freight forwarding"
- "a boutique recruitment firm specializing in financial advisory"
- "a Vancouver-based AI and data intelligence company, ~50 employees"

Bad examples:
- "Lendingkart" (name exposed!)
- "a company" (too vague)
- "a leading provider of innovative solutions" (corporate jargon)

Output ONLY the descriptor, nothing else. Max 15 words.`;

  const raw = await callAI(config, prompt);
  return raw.trim().replace(/^["']|["']$/g, '');
}

// =============================================================================
// ANONYMOUS INTRO PROMPTS (modified Step 2 & 3)
// =============================================================================

function buildAnonymousDemandPrompt(
  demandFirstName: string,
  demandCompany: string,
  signal: string,
  supplyDescriptor: string,
  supplyCapability: string,
  companyDescription: string,
): string {
  const greeting = (!demandFirstName || demandFirstName === 'there')
    ? "Hey—figured I'd reach out."
    : `Hey ${demandFirstName}—`;

  return `Write a short demand-side intro email. You're a connector who noticed a signal and is offering to make an introduction. The person you're introducing is ANONYMOUS — you do NOT reveal their name or company.

VOICE: Casual, direct, insider tone. Like a DM between peers.

DATA:
- DEMAND COMPANY: ${demandCompany}
- TIMING: ${signal}
${companyDescription ? `- CONTEXT: ${companyDescription.slice(0, 400)}\n` : ''}- ANONYMOUS SUPPLY DESCRIPTOR: ${supplyDescriptor}
- SUPPLY CAPABILITY: ${supplyCapability}

GREETING: ${greeting}

WRITE EXACTLY THIS STRUCTURE:

Paragraph 1: State what you noticed (from TIMING). ONE fact, ONE sentence.

Paragraph 2: The timing bridge — ONE sentence connecting signal to why they might want help.

Paragraph 3: "I'm in touch with ${supplyDescriptor}—${supplyCapability}. Want an intro?"
Do NOT mention any name or company for the supply side. Use the descriptor only.

HARD RULES:
• 40–70 words total.
• NEVER mention the supply company name or contact name.
• NEVER use corporate/robotic language.
• Use natural contractions.
• Em dash (—) has no spaces.

BANNED WORDS: probably, might, sounds like, seems like, could be, exploring, partnerships, strategic, solutions, expertise, alignment, leverage, optimize, streamline, based in, based firm, based company

Output: Just the intro text. No quotes. No labels.`;
}

function buildAnonymousSupplyPrompt(
  supplyFirstName: string,
  demandDescriptor: string,
  demandCapability: string,
  signal: string,
  demandTitle: string,
): string {
  const greeting = (!supplyFirstName || supplyFirstName === 'there')
    ? 'Hey there—'
    : `Hey ${supplyFirstName}—`;

  return `Write a short supply-side intro email. You're a connector tipping someone about a lead. The lead is ANONYMOUS — you do NOT reveal their name or company.

VOICE: Casual, direct, insider tone. Like tipping a friend about a deal.

DATA:
- ANONYMOUS DEMAND DESCRIPTOR: ${demandDescriptor}
- DEMAND CAPABILITY: ${demandCapability}
- TIMING: ${signal}
- DEMAND ROLE: ${demandTitle || 'a senior decision maker'}

GREETING: ${greeting}

WRITE EXACTLY THIS STRUCTURE:

Paragraph 1: "${demandDescriptor} ${signal}. A ${demandTitle || 'senior decision maker'} is driving this."
Lead with the anonymous descriptor. Name the role, not the person.

Paragraph 2: The timing bridge — why you're flagging this NOW.

Paragraph 3: "Let me know if you want an intro."

HARD RULES:
• 35–60 words total. Three short paragraphs. Shorter is better.
• NEVER mention the demand company name or contact name.
• Use the anonymous descriptor and role title only.
• NEVER use corporate/robotic language.
• Use natural contractions.
• Em dash (—) has no spaces.

BANNED WORDS: probably, might, sounds like, seems like, could be, exploring, partnerships, strategic, solutions, expertise, alignment, leverage, optimize, streamline, based in, based firm, based company, worth a look, worth exploring, up your alley, congrats

Output: Just the intro text. No quotes. No labels.`;
}

// =============================================================================
// TEST
// =============================================================================

describe('Anonymous Intro Proof-of-Concept', () => {
  it('Wealth Management: anonymous vs named side-by-side', async () => {
    if (!API_KEY || !AZURE_KEY) {
      console.log('Skipped: set MARKETS_API_KEY + AZURE_OPENAI_KEY');
      return;
    }

    const aiConfig = getAIConfig()!;
    clearIntelCache();

    // Fetch real data — same as stress test
    console.log('\n--- Fetching Wealth Management data ---');
    const demandLeads = await searchLeads({
      news: ['receives_financing'],
      subIndustry: { include: ['Financial Services', 'Investment Management'] },
    });
    const supplyLeads = await searchLeads({
      subIndustry: { include: ['Financial Services', 'Investment Management'] },
    });

    const demandIds = demandLeads.map(l => String(l.companyId)).filter(Boolean);
    const supplyIds = supplyLeads.map(l => String(l.companyId)).filter(Boolean);
    const demandCompanies = await enrichCompanies(demandIds);
    const supplyCompanies = await enrichCompanies(supplyIds);

    const demandRecords = demandLeads.map(l =>
      normalizeToRecord(l as any, demandCompanies.get(String(l.companyId)) || null, 'Funding raised', 'Financial Services')
    );
    const supplyRecords = supplyLeads.map(l =>
      normalizeToRecord(l as any, supplyCompanies.get(String(l.companyId)) || null, 'Wealth Advisory', 'Financial Services')
    );

    // Pick 2 pairs
    const pairs = [
      { demand: demandRecords[0], supply: supplyRecords[0] },
      { demand: demandRecords[1], supply: supplyRecords[1] },
    ].filter(p => p.demand && p.supply);

    for (const { demand, supply } of pairs) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`  ${demand.company} → ${supply.company}`);
      console.log(`${'='.repeat(70)}`);

      // Step 0: Extract intel
      const demandIntel = await extractRecordIntel(aiConfig, {
        company: demand.company,
        companyDescription: demand.companyDescription,
        signal: demand.signal,
        headline: demand.headline,
      }, `d_${demand.company}`);

      const supplyIntel = await extractRecordIntel(aiConfig, {
        company: supply.company,
        companyDescription: supply.companyDescription,
        signal: supply.signal,
        headline: supply.headline,
      }, `s_${supply.company}`);

      // Extract anonymous descriptors
      const demandDescriptor = await extractAnonymousDescriptor(aiConfig, {
        company: demand.company,
        companyDescription: demand.companyDescription,
        industry: typeof demand.industry === 'string' ? demand.industry : '',
        employeeCount: demand.raw?.num_employees_enum || null,
      });

      const supplyDescriptor = await extractAnonymousDescriptor(aiConfig, {
        company: supply.company,
        companyDescription: supply.companyDescription,
        industry: typeof supply.industry === 'string' ? supply.industry : '',
        employeeCount: supply.raw?.num_employees_enum || null,
      });

      console.log(`\n  STEP 0 INTEL:`);
      console.log(`    Demand capability: "${demandIntel.capability}"`);
      console.log(`    Demand signal: "${demandIntel.signalSummary}"`);
      console.log(`    Supply capability: "${supplyIntel.capability}"`);

      console.log(`\n  ANONYMOUS DESCRIPTORS:`);
      console.log(`    Demand: "${demandDescriptor}"`);
      console.log(`    Supply: "${supplyDescriptor}"`);

      // Generate ANONYMOUS demand intro
      const anonDemandIntro = await callAI(aiConfig, buildAnonymousDemandPrompt(
        demand.firstName || '',
        demand.company,
        demandIntel.signalSummary,
        supplyDescriptor,
        supplyIntel.capability,
        demand.companyDescription || '',
      ));

      // Generate ANONYMOUS supply intro
      const anonSupplyIntro = await callAI(aiConfig, buildAnonymousSupplyPrompt(
        supply.firstName || '',
        demandDescriptor,
        demandIntel.capability,
        demandIntel.signalSummary,
        demand.title || '',
      ));

      // Check for name leaks
      const demandLeaked = anonDemandIntro.toLowerCase().includes(supply.company.toLowerCase()) ||
        (supply.firstName && anonDemandIntro.toLowerCase().includes(supply.firstName.toLowerCase()));
      const supplyLeaked = anonSupplyIntro.toLowerCase().includes(demand.company.toLowerCase()) ||
        (demand.firstName && anonSupplyIntro.toLowerCase().includes(demand.firstName.toLowerCase()));

      console.log(`\n  ANONYMOUS DEMAND INTRO${demandLeaked ? ' ⚠️ NAME LEAKED!' : ' ✓ clean'}:`);
      console.log(`    "${anonDemandIntro.trim()}"`);

      console.log(`\n  ANONYMOUS SUPPLY INTRO${supplyLeaked ? ' ⚠️ NAME LEAKED!' : ' ✓ clean'}:`);
      console.log(`    "${anonSupplyIntro.trim()}"`);

      // Assertions
      expect(anonDemandIntro.length).toBeGreaterThan(20);
      expect(anonSupplyIntro.length).toBeGreaterThan(20);

      if (demandLeaked) console.log(`    ⚠️ DEMAND INTRO LEAKED: "${supply.company}" or "${supply.firstName}"`);
      if (supplyLeaked) console.log(`    ⚠️ SUPPLY INTRO LEAKED: "${demand.company}" or "${demand.firstName}"`);
    }
  }, 120000);
});
