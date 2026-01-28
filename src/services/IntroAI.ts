/**
 * INTRO AI — 3-Step AI Generation (user.txt contract)
 *
 * STEP 1: Generate Value Proposition (WHY this match matters)
 * STEP 2: Generate Demand Intro (using value prop)
 * STEP 3: Generate Supply Intro (using value prop)
 *
 * NO hardcoded switch statements. NO "companies like this" garbage.
 * Pure AI generation using ALL available rich data.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';

// =============================================================================
// TYPES
// =============================================================================

export interface IntroAIConfig {
  provider: 'openai' | 'anthropic' | 'azure';
  apiKey: string;
  model?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  // LAYER 3: Optional fallback key for when Azure content filter blocks
  openaiApiKeyFallback?: string;
}

export interface ValueProps {
  demandValueProp: string;
  supplyValueProp: string;
}

export interface GeneratedIntros {
  demandIntro: string;
  supplyIntro: string;
  valueProps: ValueProps;
}

// =============================================================================
// HELPER: CLEAN COMPANY NAME
// =============================================================================

/**
 * Clean company name: ALL CAPS → Title Case, remove legal suffixes.
 * "REFLEXIVE CAPITAL MANAGEMENT LP" → "Reflexive Capital Management"
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Convert ALL CAPS to Title Case
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  const isAllCaps = lettersOnly.length > 3 && uppercaseCount / lettersOnly.length > 0.8;

  if (isAllCaps) {
    const acronyms = new Set(['LP', 'LLC', 'LLP', 'GP', 'INC', 'CORP', 'LTD', 'CO', 'USA', 'UK', 'NYC', 'LA', 'SF', 'AI', 'ML', 'IT', 'HR', 'VP', 'CEO', 'CFO', 'CTO', 'COO', 'RIA', 'AUM', 'PE', 'VC']);
    cleaned = cleaned
      .toLowerCase()
      .split(/(\s+)/)
      .map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  // Remove legal suffixes
  cleaned = cleaned.replace(/,?\s*(llc|l\.l\.c\.|inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i, '').trim();

  return cleaned;
}

// =============================================================================
// STEP 1: GENERATE VALUE PROPOSITION
// =============================================================================

function buildStep1Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): string {
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;

  return `Generate two short value propositions for a B2B introduction.
Tone: understated and cautious. Use hedging language—you are guessing, not claiming.

Input data:

DEMAND:
- Company: ${cleanCompanyName(demand.company)}
- Industry: ${demand.industry || 'tech'}
- Signal: ${edge.type} - ${edge.evidence}
${demand.metadata.employeeEnum ? `- Size: ${demand.metadata.employeeEnum}\n` : ''}${fundingAmount ? `- Funding: ${fundingAmount}\n` : ''}
SUPPLY:
- Company: ${cleanCompanyName(supply.company)}
- Capability: ${supply.capability || 'business services'}

=== VOICE (from $2M/yr playbook) ===

DEMAND VALUE PROP (max 15 words):
• "You raised $28M. Probably in the phase where you need pharma partnerships."
• "You raised $16M. Probably need help landing enterprise shippers."
• "Hit $950M AUM. Probably looking to bring in a couple more HNW clients."
• "Expanded capacity by 50%. Probably need help landing tier 1 contracts."
• "Just got 510(k). Probably need help with hospital introductions."

SUPPLY VALUE PROP (max 20 words):
• "48 people, $28M Series B. CEO is probably scaling partnerships & looking to land a couple pharma co-dev discussions."
• "55 people, $16M Series A. VP Sales is probably trying to land first 2-3 enterprise shipper accounts."
• "20 advisors, $1.1B AUM. Managing partner is probably looking to bring in a couple more HNW clients."
• "72 people, just expanded 50%. Operations director is probably trying to land a couple multi-year contracts."
• "45 people, 510(k) clearance. CEO is probably trying to land first hospital pilot programs."

HEDGING WORDS (use these):
• probably, might, would guess, seems like, a couple, first 2-3

AVOID: pipeline, systematic, strategic, significant, perfect, ideal, aggressively

Output (JSON only):
{"demandValueProp": "...", "supplyValueProp": "..."}`;
}

// =============================================================================
// STEP 2: GENERATE DEMAND INTRO
// =============================================================================

function buildStep2Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
  valueProps: ValueProps
): string {
  const demandFirstName = extractFirstName(demand.contact);
  // Greeting format: if name is missing or is "Decision", use fallback
  const greeting = (!demandFirstName || demandFirstName === 'there' || demandFirstName === 'Decision')
    ? 'Hey—figured I\'d reach out.'
    : `Hey ${demandFirstName}—`;
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;

  return `Write a short, professional B2B introduction email for the demand side.
Tone: specific and personal. Every word should relate to this company, this signal, this person. Generic language will be rejected.

Input data:

DEMAND (the person you're emailing):
- First name: ${demandFirstName}
- Company: ${cleanCompanyName(demand.company)}
- Title: ${demand.title || 'decision maker'}
- Industry: ${demand.industry || 'tech'}
- Funding: ${fundingAmount || 'raised funding'}

SUPPLY (the provider you're offering):
- Contact: ${supply.contact}
- Company: ${cleanCompanyName(supply.company)}
- Capability: ${supply.capability || 'business services'}

VALUE PROP: ${valueProps.demandValueProp}

SIGNAL (what triggered this): ${edge.evidence}

GREETING TO USE: ${greeting}

=== THE $2M/YEAR PLAYBOOK (500+ REAL INTROS) ===

STRUCTURE (follow exactly):
1. Greeting + Signal mention + Personal touch
2. Soft offer with specific provider
3. Options line (always)
4. Competitive frame + Short CTA

OPENING PATTERNS:
• "Hey—figured I'd reach out. Saw your $28M Series B for [Company] and ended up going down a rabbit hole on your [specific thing]."
• "Hey—noticed your [company] just [specific event]. Ended up reading through your [specific detail]—really [adjective] approach."
• "Hey [Name]— Saw you launched [specific thing] (went deep down a [topic] rabbit hole)."

PERSONAL TOUCH (pick one, make it SPECIFIC to the COMPANY):
• "ended up going down a rabbit hole on your [blood-brain barrier delivery platform]"
• "ended up reading through your [carrier network optimization algorithm]"
• "went through the whole [release notes]—impressive [workflow automation]"
• "ended up reading your recent [articles on founder liquidity planning]"
• "(solid engagement)" for launches

CRITICAL: The "rabbit hole" or "diving into" MUST reference something about the COMPANY:
✓ CORRECT: "ended up diving into your AI-native platform"
✓ CORRECT: "ended up reading about your Series B"
✓ CORRECT: "went down a rabbit hole on your matching algorithm"
✗ WRONG: "ended up diving into your approach as Co-Founder and CTO" ← NEVER do this
✗ WRONG: "ended up reading about your role as CEO" ← NEVER reference job titles
The rabbit hole is about their PRODUCT, TECHNOLOGY, or NEWS — never their job title.

SOFT OFFERS:
• "Would you be open to connecting with [Sarah] from [BioPharma Partners]?"
• "Would you be open to chatting with [Marcus] at [Supply Chain Accelerate]?"
• "Might be worth chatting with [Name] from [Company]."
• "Know someone who might be helpful: [Name] at [Company]."

PROVIDER DESCRIPTION (specific value):
• "She helps post-raise CNS biotechs land early pharma co-development discussions."
• "He works with funded logistics tech companies to secure their first 2-3 enterprise shipper contracts."
• "They help B2B SaaS companies at your stage land a couple midmarket logos before scaling outbound heavy."

OPTIONS (always include):
• "Got a couple others parked depending on your therapeutic focus."
• "Got a few other folks I trust if you want to compare."
• "Got more options if helpful."
• "Others in the same lane if you want options."
• "A few others in that zone if useful."

COMPETITIVE FRAME + CTA (use FULL phrase, not fragments):
• "You pick — we just keep the winner. Worth a chat?"
• "Got a couple others parked. You pick — we just keep the winner."
• "Got a few others if you want to compare. Worth exploring?"
• "Worth connecting?"

NEVER use "We keep the winner" alone. Always pair with "You pick —" first.

=== 20 REAL EXAMPLES (copy EXACTLY) ===

BIOTECH:
"Hey—figured I'd reach out. Saw your $28M Series B for NeuroPath Therapeutics and ended up going down a rabbit hole on your blood-brain barrier delivery platform. Would you be open to connecting with Sarah from BioPharma Partners? She helps post-raise CNS biotechs land early pharma co-development discussions. Got a couple others parked depending on your therapeutic focus. You pick — we just keep the winner. Worth a chat?"

LOGISTICS:
"Hey—noticed your logistics platform just raised $16M Series A. Ended up reading through your carrier network optimization algorithm—really elegant approach to the matching problem. Might be worth chatting with Marcus from Supply Chain Accelerate. He works with funded logistics tech companies to secure their first 2-3 enterprise shipper contracts. Got a few other folks I trust if you want to compare. Worth connecting?"

B2B SAAS:
"Hey—figured I'd reach out. Saw you launched version 4.0 of your revenue operations platform (ended up going through the whole release notes—impressive workflow automation). Would you be open to meeting Jessica from GTM Scale Partners? She helps B2B SaaS companies at your stage land a couple midmarket logos before scaling outbound heavy. Got more options if helpful. You pick — we just keep the winner. Worth a chat?"

WEALTH/RIA:
"Hey—noticed your RIA just crossed $950M AUM and added two new partners. Ended up reading your recent articles on founder liquidity planning—really sophisticated approach to concentration risk. Might be worth connecting with David from Founder Wealth Advisory. He routes 1-2 warm HNW intros per month from the late-stage startup ecosystem. Got a couple other advisors in this space parked if you want options. Worth exploring?"

MEDTECH:
"Hey—figured I'd reach out. Saw you closed your $22M Series A for advanced surgical robotics (ended up going down a rabbit hole on your haptic feedback system—impressive precision work). Would you be open to chatting with Elena at MedDevice Commercial Partners? She helps surgical robotics companies land early hospital evaluations and surgeon champions. Got a couple others parked for different procedure specialties. You pick — we just keep the winner. Worth a chat?"

RECRUITING:
"Hey—noticed your recruiting agency just hit $15M annual revenue. Ended up reading about your AI engineer placement process—really interesting approach to technical screening. Might be worth connecting with Alicia from Tech Talent Networks. She helps recruiting firms access venture-backed AI companies building their ML teams. Got a few other connectors I trust in this space. Worth exploring?"

MANUFACTURING:
"Hey—figured I'd reach out. Saw your precision manufacturing facility just expanded capacity by 50% (ended up reading about your new 5-axis equipment—serious capability upgrade). Would you be open to meeting Tom at Aerospace Supply Partners? He helps precision shops land multi-year contracts with tier 1 aerospace and defense primes. Got a couple others parked depending on your tolerance specs. You pick — we just keep the winner. Worth a chat?"

REAL ESTATE:
"Hey—noticed your development company just broke ground on that $140M mixed-use project downtown. Ended up looking at the site plans—really thoughtful urban infill approach. Might be worth chatting with Rachel from Corporate Tenant Advisory. She helps developers secure anchor office tenants before delivery. Got a few other leasing partners I trust if you want options. Worth connecting?"

FINTECH:
"Hey—figured I'd reach out. Saw you raised $22M Series B for embedded lending (ended up going down a rabbit hole on your balance sheet integration approach—elegant solution). Would you be open to connecting with Carlos at FinTech Partnership Labs? He helps embedded finance platforms land their first tier 1 bank integrations. Got a couple others parked depending on your target bank segment. You pick — we just keep the winner. Worth a chat?"

CPG:
"Hey—noticed your organic snack brand just launched in 650 Whole Foods stores nationwide. Ended up reading your DTC growth story—really impressive trajectory. Might be worth chatting with Amanda from Natural Channel Expansion. She helps CPG brands land regional distributor partnerships in conventional grocery. Got a few other distribution partners I trust if you want to compare. Worth exploring?"

EDTECH:
"Hey—figured I'd reach out. Saw your K-12 platform just crossed 15K school district customers (ended up going through your implementation case studies—impressive adoption metrics). Would you be open to meeting Kevin at EdTech Enterprise Partners? He helps ed-tech companies land state-level contracts and major urban districts. Got a couple others parked for different education segments. You pick — we just keep the winner. Worth a chat?"

CLEAN ENERGY:
"Hey—noticed you just secured $95M in project financing for your 180MW solar portfolio. Ended up reading about your corporate PPA strategy—really sophisticated offtake approach. Might be worth connecting with Jason from Renewable Energy Offtake. He helps solar developers land Fortune 500 offtake agreements. Got a few other corporate energy buyers I trust if you want options. Worth exploring?"

BIOTECH/CRO:
"Hey—figured I'd reach out. Saw your CRISPR screening platform raised $24M Series B (went deep down a gene editing rabbit hole on your target identification approach). Would you be open to chatting with Dr. Maria at Therapeutic Discovery Partners? She helps tool platforms set up pharma validation partnerships and licensing discussions. Got a couple others parked depending on your therapeutic focus. You pick — we just keep the winner. Worth a chat?"

3PL/LOGISTICS:
"Hey—noticed your 3PL operation just opened warehousing in 3 new regions. Ended up looking at your network coverage—really impressive geographic expansion. Might be worth connecting with Derek from Enterprise Logistics Partnerships. He helps 3PLs land anchor shipper relationships in new markets. Got a few other supply chain connectors I trust if you want to compare. Worth a chat?"

CUSTOMER SUCCESS:
"Hey—figured I'd reach out. Saw your customer success platform raised $16M Series A (ended up going through your automation workflows—really smart approach to at-risk account detection). Would you be open to meeting Nina at SaaS Growth Labs? She helps CS platforms land their first F500 SaaS customers. Got a couple others parked depending on your enterprise vs mid-market focus. You pick — we just keep the winner. Worth a chat?"

WEALTH/EXIT PLANNING:
"Hey—noticed you specialize in business exit planning and ESOP transactions. Ended up reading about your employee ownership approach—really thoughtful transition strategy. Might be worth connecting with Robert from BridgeHouse. He works with business owners exploring ownership transitions in the next 12-24 months. Got a couple other exit specialists I trust if you want options. Worth exploring?"

ORTHOPEDIC DEVICES:
"Hey—figured I'd reach out. Saw you completed $32M Series B for orthopedic implants (ended up going down a rabbit hole on your implant technology—impressive clinical results). Would you be open to chatting with Dr. James at MedPilot? He helps device companies get early surgeon evaluations at academic medical centers. Got a couple others parked depending on your surgical specialty focus. You pick — we just keep the winner. Worth a chat?"

EXECUTIVE SEARCH:
"Hey—noticed your retained search firm placed 6 C-suite executives last quarter. Ended up reading about your life sciences track record—really impressive hit rate. Might be worth connecting with Lisa from Life Science Executive Network. She helps search firms access PE-backed portfolio companies and venture-backed biotechs. Got a few other PE talent connectors I trust if you want to compare. Worth a chat?"

DEFENSE/AEROSPACE:
"Hey—figured I'd reach out. Saw your composites facility just achieved Nadcap and AS9100 certifications (ended up reading about your advanced materials capabilities—serious aerospace-grade capacity). Would you be open to meeting Michael at Defense & Aerospace Supply Chain? He helps certified suppliers land tier 1 contracts with defense primes. Got a couple others parked depending on your material specialization. You pick — we just keep the winner. Worth a chat?"

MULTIFAMILY:
"Hey—noticed you just broke ground on 340 units in a growing suburban market. Ended up looking at your development portfolio—really consistent execution on workforce housing. Might be worth connecting with Jennifer from Multifamily Capital Partners. She helps apartment developers secure construction takeout financing and JV equity. Got a few other capital partners I trust if you want options. Worth exploring?"

AVOID these corporate words: pipeline, systematic, repeatable, fuel, deploy, specialize, strategic, effectively, efficiently, seamlessly, holistically, aggressively, perfect fit, ideal opportunity, significant revenue

STYLE NOTES:
• Use greeting: ${greeting}
• Em dash (—) has no spaces
• Be specific to this company
• Include options line
• End with short CTA like "Worth a chat?"

Output: Just the intro text.`;
}

// =============================================================================
// STEP 3: GENERATE SUPPLY INTRO
// =============================================================================

function buildStep3Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
  valueProps: ValueProps
): string {
  const supplyFirstName = extractFirstName(supply.contact);
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;
  // Greeting format: if name is missing, use "Hey there—"
  const greeting = (!supplyFirstName || supplyFirstName === 'there' || supplyFirstName === 'Contact')
    ? 'Hey there—'
    : `Hey ${supplyFirstName}—`;

  return `Write a short, professional B2B introduction email for the supply side.
Tone: casual, like giving a friend a tip about a lead. Understate. Let them decide.

Input data:

SUPPLY (the provider you're emailing):
- First name: ${supplyFirstName}

DEMAND (the lead you're offering):
- Company: ${cleanCompanyName(demand.company)}
- What they do: ${demand.metadata.companyDescription || demand.metadata.description || ''}
- Contact: ${demand.contact}
- Title: ${demand.title || 'decision maker'}
- Industry: ${demand.industry || 'tech'}
${demand.metadata.employeeEnum ? `- Size: ${demand.metadata.employeeEnum}\n` : ''}${(demand.metadata.fundingType || fundingAmount) ? `- Funding: ${demand.metadata.fundingType || ''}${demand.metadata.fundingType && fundingAmount ? ', ' : ''}${fundingAmount || ''}\n` : ''}
VALUE PROP: ${valueProps.supplyValueProp}

SIGNAL (what triggered this): ${edge.evidence}

GREETING TO USE: ${greeting}

=== THE $2M/YEAR SUPPLY PLAYBOOK (100+ REAL INTROS) ===

STRUCTURE (follow exactly):
1. Greeting
2. Company description (specific)
3. Contact + what they're probably doing
4. Phase framing (where they are)
5. Value close + CTA

COMPANY DESCRIPTION (always specific):
• "[Company] is a CNS biotech (48 people), they just raised $28M Series B for their blood-brain barrier delivery platform."
• "[Company] is a logistics tech company (55 people), just closed $16M Series A."
• "[Company] is a RevOps platform (42 people), they just raised $14M Series A."
• "[Company] is an RIA (20 advisors), they just crossed $1.1B AUM serving startup founders."
• "[Company] just raised $22M Series A. About 30-person team developing a novel device."

CRITICAL: If size or funding data is NOT provided above, OMIT it entirely. Never say "unknown", "not sure", "team size unknown", etc. Just skip that part.

CONTACT + ROLE FRAMING (use hedging):
• "The CEO is probably scaling partnerships & looking to land a couple early pharma co-development discussions."
• "VP of Sales is probably trying to land their first 2-3 enterprise shipper accounts & scale the sales team."
• "Founder is probably scaling enterprise sales & looking to land a couple midmarket B2B SaaS logos."
• "Managing partner is probably looking to scale & bring in a couple more HNW clients from the late-stage startup ecosystem."
• "CEO is probably trying to land their first hospital pilot programs & build early surgeon champions."
• "Operations director is probably trying to land a couple multi-year supply contracts with larger OEMs."

NEED FRAMING (always hedge):
• "Would guess they might need help with outbound to Fortune 500 supply chain leaders."
• "Seems like they might need help with health system introductions, value analysis committees and KOL relationship building."
• "Would guess they might need help getting meetings with heads of talent at venture-backed AI companies."
• "Seems like they might need help with procurement introductions at Boeing, Lockheed Martin and tier 1 suppliers."

PHASE FRAMING (critical pattern):
• "They're in the phase where they have funding but might need help getting warm BD intros to big pharma neuroscience teams."
• "They're in the phase where they have $ but might need more leads."
• "They're in the phase where they have product-market fit but might need meeting generation."
• "They're post-raise but might need channel development."
• "They're in early commercialization but might need channel support."
• "They're scaling clinical offerings but might need channel support."
• "Seems like they're post-product but might need pipeline generation."
• "Seems like they're scaling fast."

VALUE CLOSE:
• "Pretty sure you can deliver, would be helpful if I connect you two?"
• "Pretty sure it'd be helpful if I connect you."
• "Pretty sure it'd be helpful to connect."
• "Pretty sure you can help."
• "Pretty sure you know the right [surgeons/people/ecosystem]."
• "Would be helpful to connect you two."

CTA (always casual):
• "Let me know"
• "Let me know if worth connecting."
• "Let me know if you want the intro."

=== 20 REAL EXAMPLES (copy EXACTLY) ===

CNS BIOTECH:
"Hey Sarah— NeuroPath Therapeutics is a CNS biotech (48 people), they just raised $28M Series B for their blood-brain barrier delivery platform. The CEO is probably scaling partnerships & looking to land a couple early pharma co-development discussions. They're in the phase where they have funding but might need help getting warm BD intros to big pharma neuroscience teams. Pretty sure you can deliver, would be helpful if I connect you two? Let me know"

LOGISTICS TECH:
"Hey Marcus— Supply Chain Accelerate is a logistics tech company (55 people), just closed $16M Series A. VP of Sales is probably trying to land their first 2-3 enterprise shipper accounts & scale the sales team. Would guess they might need help with outbound to Fortune 500 supply chain leaders. Seems like they're post-product but might need pipeline generation. Let me know if worth connecting."

B2B SAAS:
"Hey Jessica— GTM Scale Partners is a RevOps platform (42 people), they just raised $14M Series A. Founder is probably scaling enterprise sales & looking to land a couple midmarket B2B SaaS logos before going full enterprise. They're in the phase where they have product-market fit but might need meeting generation with revenue operations leaders. Would be helpful to connect you two. Let me know"

WEALTH MANAGEMENT:
"Hey David— Founder Wealth Advisory is an RIA (20 advisors), they just crossed $1.1B AUM serving startup founders and tech executives. Managing partner is probably looking to scale & bring in a couple more HNW clients from the late-stage startup ecosystem. Would guess they might need help with warm founder introductions from VCs and startup CFOs. Pretty sure it'd be helpful if I connect you. Let me know"

MEDTECH:
"Hey Elena— MedTech Commercial Partners is a surgical device company (45 people), they just got 510(k) clearance for spine procedures. CEO is probably trying to land their first hospital pilot programs & build early surgeon champions. Seems like they might need help with health system introductions, value analysis committees and KOL relationship building. They're in early commercialization but might need channel support. Let me know if you want the intro."

RECRUITING:
"Hey Alicia— Tech Talent Bridge is a recruiting agency (32 recruiters), just hit $15M annual revenue placing AI and ML engineers. Founder is probably scaling placements & looking to land a couple corporate recruiting contracts with well-funded AI startups building their teams. Would guess they might need help getting meetings with heads of talent at venture-backed AI companies. Let me know if worth connecting."

AEROSPACE MANUFACTURING:
"Hey Tom— Aerospace Supply Partners is a precision machining company (72 people), they just expanded capacity by 50% with new 5-axis equipment. Operations director is probably trying to land a couple multi-year supply contracts with larger aerospace OEMs & defense primes. Seems like they might need help with procurement introductions at Boeing, Lockheed Martin and tier 1 suppliers. Pretty sure you can help. Let me know"

REAL ESTATE:
"Hey Rachel— Corporate Tenant Advisory is a mixed-use developer (25 people), they just broke ground on a $140M office and retail project downtown. Managing partner is probably looking to secure anchor office tenants & pre-lease retail space before delivery. Would guess they're trying to connect with corporate real estate teams and national retailers. Let me know if you want the intro."

FINTECH:
"Hey Carlos— FinTech Partnership Labs is an embedded lending platform (52 people), just raised $22M Series B. Head of partnerships is probably scaling bank relationships & looking to land their first tier 1 bank integration for balance sheet lending. They're in the phase where they have funding but might need warm introductions to bank innovation and partnership teams. Pretty sure it'd be helpful to connect. Let me know"

CPG:
"Hey Amanda— Natural Channel Expansion is an organic snack brand (28 people), just launched in 650 Whole Foods stores nationwide. Founder is probably trying to expand distribution beyond Whole Foods & land a couple regional distributor partnerships in conventional grocery. Would guess they might need help with broker introductions at UNFI, KeHE and regional distributors. Seems like they're scaling fast. Let me know if worth connecting."

EDTECH:
"Hey Kevin— EdTech Enterprise Partners is a K-12 LMS platform (38 people), they just crossed 15K school district customers. CEO is probably looking to move upmarket & land a couple large state-level contracts or major urban districts. They're in the phase where they have product traction but might need help with superintendent, CIO and state education agency introductions. Let me know if you want the intro."

CLEAN ENERGY:
"Hey Jason— Renewable Energy Offtake is a solar developer (62 people), just secured $95M in project financing for 180MW portfolio. VP of Development is probably trying to accelerate corporate PPA negotiations & land a couple Fortune 500 offtake agreements. Would guess they might need help with introductions to corporate sustainability and procurement teams. Pretty sure you can deliver. Let me know"

BIOTECH TOOLS:
"Hey Dr. Maria— Therapeutic Discovery Partners is a CRISPR screening platform company (42 people), just raised $24M Series B. CEO is probably advancing commercial partnerships & looking to set up a couple pharma validation partnerships for their tool platform. Seems like they might need help with pharma R&D business development team introductions for tool evaluation and potential licensing discussions. They're post-raise but might need channel development. Let me know if worth connecting."

3PL LOGISTICS:
"Hey Derek— Enterprise Logistics Partnerships is a 3PL operation (85 people), just opened warehousing facilities in 3 new regions. COO is probably trying to land anchor shipper relationships in those markets & fill the new capacity. Would guess they might need help getting meetings with supply chain VPs at enterprise shippers and manufacturers expanding their fulfillment networks. Pretty sure it'd be helpful to connect you. Let me know"

CUSTOMER SUCCESS:
"Hey Nina— SaaS Growth Labs is a customer success automation platform (48 people), they just raised $16M Series A. Founder is probably scaling enterprise sales & looking to land their first F500 SaaS customers. They're in the phase where they have funding but might need warm channel partner introductions to revenue operations leaders at enterprise subscription companies. Let me know if you want the intro."

WEALTH/EXIT:
"Hey Robert— BridgeHouse is a wealth management firm (14 advisors), specializes in business exit planning and ESOP transactions. Managing partner is probably looking to get in front of a couple business owners exploring employee ownership transitions in the next 12-24 months. Would guess they might need help with warm introductions from business brokers, M&A intermediaries and CPAs working with founder-owned businesses. Seems like they're growing this specialized niche. Let me know if worth connecting."

ORTHOPEDICS:
"Hey Dr. James— MedPilot is an orthopedic implant company (38 people), just completed Series B funding of $32M. CEO is probably trying to get early surgeon evaluations & clinical feedback on their implant technology before broader commercialization. Seems like they might need help with key opinion leader introductions in orthopedic surgery at academic medical centers and high-volume orthopedic practices. Pretty sure you know the right surgeons. Let me know"

EXECUTIVE SEARCH:
"Hey Lisa— Life Science Executive Network is a retained search firm (18 recruiters), just placed 6 C-suite executives in life science companies last quarter. Managing director is probably looking to access more PE-backed life science portfolio companies and venture-backed biotechs hiring senior commercial and operational leadership. Would guess they might need warm introductions to operating partners at healthcare-focused PE firms and talent leads at life science VCs. Let me know if you want the intro."

DEFENSE MATERIALS:
"Hey Michael— Defense & Aerospace Supply Chain is a composite materials manufacturer (95 people), just achieved Nadcap and AS9100 certifications. VP of Sales is probably trying to land additional tier 1 contracts with defense primes and commercial aerospace OEMs expanding their supplier base for advanced materials. They're scaling capability but might need help with procurement and supplier development team introductions at major aerospace and defense contractors. Pretty sure it'd be helpful to connect. Let me know"

MULTIFAMILY:
"Hey Jennifer— Multifamily Capital Partners is a garden-style apartment developer (22 people), just broke ground on 340 units in growing suburban market. Managing partner is probably looking to secure construction takeout financing & might need preferred equity or JV partners for the project. Would guess they're also planning next developments and might need relationships with construction lenders and equity partners for workforce housing. Seems like they're scaling the pipeline. Let me know if worth connecting."

AVOID these corporate words: pipeline, systematic, repeatable, fuel, deploy, specialize, strategic, effectively, efficiently, seamlessly, holistically, significant, perfect opportunity, aggressively scaling

STYLE NOTES:
• Use greeting: ${greeting}
• Em dash (—) has no spaces
• Include (X people) in company description
• Use hedging: "probably", "might", "would guess"
• Include phase framing: "They're in the phase where..."
• End with "Let me know"
• Understate—tip a friend, don't pitch

Output: Just the intro text.`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractFirstName(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'there';
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

function cleanIntroOutput(text: string): string {
  let cleaned = text.trim();
  // Remove surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
  return cleaned;
}

// =============================================================================
// AI PROVIDER CALLS
// =============================================================================

async function callOpenAI(config: IntroAIConfig, prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(config: IntroAIConfig, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

async function callAzure(config: IntroAIConfig, prompt: string): Promise<string> {
  if (!config.azureEndpoint || !config.azureDeployment) {
    throw new Error('Azure endpoint and deployment required');
  }

  const url = `${config.azureEndpoint}/openai/deployments/${config.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[IntroAI] Azure error body:', errorBody);

    // LAYER 2: Explicit content_filter detection (Stripe-grade observability)
    if (
      response.status === 400 &&
      errorBody.toLowerCase().includes('content_filter')
    ) {
      console.error('[IntroAI] AZURE_CONTENT_FILTER_BLOCK detected');
      throw new Error('AZURE_CONTENT_FILTER_BLOCK');
    }

    throw new Error(`Azure error: ${response.status} - ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAI(config: IntroAIConfig, prompt: string): Promise<string> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(config, prompt);
    case 'anthropic':
      return callAnthropic(config, prompt);
    case 'azure':
      // LAYER 3: Deterministic provider fallback (Stripe-grade resilience)
      // Azure blocks → automatic fallback to OpenAI
      // No user interruption, no retry loop, no prompt mutation
      try {
        return await callAzure(config, prompt);
      } catch (err) {
        if (err instanceof Error && err.message === 'AZURE_CONTENT_FILTER_BLOCK') {
          // Check if OpenAI fallback key is configured
          if (!config.openaiApiKeyFallback) {
            console.error('[IntroAI] Azure content filter blocked, no OpenAI fallback key configured');
            throw new Error('AZURE_CONTENT_FILTER_BLOCK: Configure OpenAI API key in Settings as fallback');
          }

          console.log('[IntroAI] Azure content filter triggered, falling back to OpenAI');
          const fallbackConfig: IntroAIConfig = {
            provider: 'openai',
            apiKey: config.openaiApiKeyFallback,
            model: 'gpt-4o-mini', // Cost-effective fallback
          };
          try {
            return await callOpenAI(fallbackConfig, prompt);
          } catch (fallbackErr) {
            console.error('[IntroAI] OpenAI fallback failed:', fallbackErr);
            throw new Error('AZURE_CONTENT_FILTER_BLOCK: OpenAI fallback also failed - check API key');
          }
        }
        throw err;
      }
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// =============================================================================
// MAIN EXPORT: 3-STEP GENERATION
// =============================================================================

/**
 * Generate intros using 3-step AI process (user.txt contract)
 *
 * STEP 1: Generate value props (WHY this match matters)
 * STEP 2: Generate demand intro (using value prop)
 * STEP 3: Generate supply intro (using value prop)
 */
export async function generateIntrosAI(
  config: IntroAIConfig,
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): Promise<GeneratedIntros> {
  // STEP 1: Generate Value Propositions
  console.log('[IntroAI] Step 1: Generating value props...');
  const step1Prompt = buildStep1Prompt(demand, supply, edge);
  const step1Response = await callAI(config, step1Prompt);

  let valueProps: ValueProps;
  try {
    // Parse JSON response
    const cleaned = step1Response.replace(/```json\n?|\n?```/g, '').trim();
    valueProps = JSON.parse(cleaned);
  } catch (e) {
    console.error('[IntroAI] Step 1 parse error:', e);
    // Fallback value props
    valueProps = {
      demandValueProp: `${edge.evidence} creates an opportunity.`,
      supplyValueProp: `${cleanCompanyName(demand.company)} is an attractive prospect.`,
    };
  }
  console.log('[IntroAI] Step 1 complete:', valueProps);

  // STEP 2: Generate Demand Intro
  console.log('[IntroAI] Step 2: Generating demand intro...');
  const step2Prompt = buildStep2Prompt(demand, supply, edge, valueProps);
  const demandIntro = await callAI(config, step2Prompt);
  console.log('[IntroAI] Step 2 complete');

  // STEP 3: Generate Supply Intro
  console.log('[IntroAI] Step 3: Generating supply intro...');
  const step3Prompt = buildStep3Prompt(demand, supply, edge, valueProps);
  const supplyIntro = await callAI(config, step3Prompt);
  console.log('[IntroAI] Step 3 complete');

  return {
    demandIntro: cleanIntroOutput(demandIntro),
    supplyIntro: cleanIntroOutput(supplyIntro),
    valueProps,
  };
}

// =============================================================================
// BATCH GENERATION (for multiple matches)
// =============================================================================

export interface BatchIntroItem {
  id: string;
  demand: DemandRecord;
  supply: SupplyRecord;
  edge: Edge;
}

export interface BatchIntroResult {
  id: string;
  demandIntro: string;
  supplyIntro: string;
  valueProps: ValueProps;
  error?: string;
}

/**
 * Sequential batch (legacy) - kept for backwards compatibility
 */
export async function generateIntrosBatch(
  config: IntroAIConfig,
  items: BatchIntroItem[],
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult[]> {
  const results: BatchIntroResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);

    try {
      const intros = await generateIntrosAI(config, item.demand, item.supply, item.edge);
      results.push({
        id: item.id,
        demandIntro: intros.demandIntro,
        supplyIntro: intros.supplyIntro,
        valueProps: intros.valueProps,
      });
    } catch (e) {
      console.error(`[IntroAI] Batch error for ${item.id}:`, e);
      results.push({
        id: item.id,
        demandIntro: '',
        supplyIntro: '',
        valueProps: { demandValueProp: '', supplyValueProp: '' },
        error: String(e),
      });
    }
  }

  return results;
}

/**
 * Parallel batch with bounded concurrency.
 *
 * @param concurrency - Max parallel requests (default 5, safe for most AI providers)
 */
export async function generateIntrosBatchParallel(
  config: IntroAIConfig,
  items: BatchIntroItem[],
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult[]> {
  const results: BatchIntroResult[] = new Array(items.length);
  let completed = 0;

  // Process in chunks of `concurrency`
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map(async (item, idx) => {
        try {
          const intros = await generateIntrosAI(config, item.demand, item.supply, item.edge);
          return {
            index: i + idx,
            result: {
              id: item.id,
              demandIntro: intros.demandIntro,
              supplyIntro: intros.supplyIntro,
              valueProps: intros.valueProps,
            } as BatchIntroResult,
          };
        } catch (e) {
          console.error(`[IntroAI] Parallel batch error for ${item.id}:`, e);
          return {
            index: i + idx,
            result: {
              id: item.id,
              demandIntro: '',
              supplyIntro: '',
              valueProps: { demandValueProp: '', supplyValueProp: '' },
              error: String(e),
            } as BatchIntroResult,
          };
        }
      })
    );

    // Store results in correct order
    for (const { index, result } of chunkResults) {
      results[index] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  return results;
}
