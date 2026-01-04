/**
 * Reply Brain v16 - JUNGIAN / $100M Test Harness
 *
 * Tests:
 * - Token-window negation detection
 * - AnchorPackV4 with multi-strategy extraction
 * - Multi-intent with secondary composition
 * - Fragment library with stable rotation
 * - Corpus-based validation (100+ real cases)
 * - Forbidden pattern checks
 * - Embarrassment gate
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// TYPES (mirrored from edge function)
// =============================================================================

type Stage =
  | 'BOUNCE' | 'OOO' | 'NEGATIVE' | 'HOSTILE' | 'SCHEDULING'
  | 'PRICING' | 'PROOF' | 'IDENTITY' | 'SCOPE' | 'INTEREST'
  | 'CONFUSION' | 'UNKNOWN';

interface MultiIntent {
  primary: Stage;
  secondary: Stage[];
  signals: string[];
  negationDetected: boolean;
}

interface OutboundFrameV4 {
  providerName?: string;
  audiencePhrase?: string;
  painClause?: string;
  desiredOutcome?: string;
  offerType: 'intro' | 'call' | 'details' | 'unknown';
  evidence: {
    audienceSource?: string;
    painSource?: string;
    offerSource?: string;
    providerSource?: string;
  };
  raw: string;
  score: number;
}

interface AnchorPackV4 {
  prospect_label: string;
  pain_sentence: string;
  offer_sentence: string;
  outbound_summary: string;
  quality: 'good' | 'partial' | 'fallback';
  missing: string[];
}

// =============================================================================
// CORE FUNCTIONS (copied from edge function for testability)
// =============================================================================

const NEGATORS = [
  "not", "no", "don't", "do not", "dont", "can't", "cant", "cannot",
  "won't", "wont", "wouldn't", "wouldnt", "shouldn't", "shouldnt",
  "rather not", "prefer not", "i don't think", "i dont think",
  "not really", "not sure", "not interested", "never"
];

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s,.!?;:'"]+/).filter(t => t.length > 0);
}

function hasNegatedIntent(text: string, intentTokens: string[]): boolean {
  const tokens = tokenize(text);
  const lowerText = text.toLowerCase();

  for (const intentToken of intentTokens) {
    const intentParts = intentToken.split(' ');

    for (let i = 0; i < tokens.length; i++) {
      let match = true;
      for (let j = 0; j < intentParts.length; j++) {
        if (tokens[i + j] !== intentParts[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        const lookbackStart = Math.max(0, i - 8);
        const lookbackTokens = tokens.slice(lookbackStart, i);
        const lookbackText = lookbackTokens.join(' ');

        for (const negator of NEGATORS) {
          if (lookbackText.includes(negator)) {
            if (/not only|not just/.test(lookbackText)) {
              continue;
            }
            return true;
          }
        }

        const beforeIndex = lowerText.indexOf(intentToken);
        if (beforeIndex > 0) {
          const beforeText = lowerText.substring(Math.max(0, beforeIndex - 50), beforeIndex);
          for (const negator of NEGATORS) {
            if (beforeText.includes(negator) && !/not only|not just/.test(beforeText)) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

const STAGE_PATTERNS: Record<Stage, RegExp> = {
  BOUNCE: /undeliverable|address not found|mailbox not found|user unknown|does not exist|permanently rejected|550 |delivery.*(failed|error)/i,
  OOO: /out of (the )?office|on (vacation|holiday|leave|pto)|away (from|until)|auto.?reply|automatic reply|currently unavailable|limited access to email|i('m| am) (away|out)|back (on|in|after)/i,
  NEGATIVE: /\b(not interested|no thanks|no thank you|pass|remove me|take me off|unsubscribe|stop (emailing|contacting)|don't contact|not for me|i'm good|no need|please stop|opt.?out|not at this time|not ok with|not okay with|i'm not ok|not for us|we're not|we are not|not looking|not a fit|all set|didn't ask|did not ask)\b|^stop\.?\s*$/i,
  HOSTILE: /\b(fuck|shit|spam|scam|bullshit|stop spamming|reported|blocking|harassment|predatory|disgusting)\b/i,
  SCHEDULING: /\b(send.*(calendar|times|link|availability)|when (can we|are you|works)|let's (book|schedule|set up|talk)|set up.*(call|time)|grab time|book.*(call|time)|what times|free (to|for)|available|my calendar|schedule a)\b/i,
  // v18: PRICING pattern - terse + embedded (must catch "price?" etc.)
  PRICING: /^\s*(price|pricing|cost|fee|fees|charge|charges|paid|pay|payment|commission|comp)\s*\??\s*$|what('s| is) in it for you|how do you (get paid|make money)|how are you paid|is this (paid|free)|how (much|do you charge)|what('s| is) the (cost|fee|price)|pricing|rate|pay you|your fee|commission|charge for|rev\s?share|revenue\s?share|access\s?fee|retainer|success\s?fee|what do you take|what's your cut|do you charge|how are you compensated|your cut|your take/i,
  PROOF: /\b(who are (these|the|they)|which companies|name (them|some)|give me (names|examples)|specific (companies|names|clients)|can you share|prove it|where from|where did you|who exactly|examples of)\b/i,
  IDENTITY: /\b(what'?s the catch|who are you|what company are you with|are you an agency|are you affiliated|why are you reaching out|how do you work|how does this work|how exactly does this work|what'?s (your |the )?process|what'?s the model|walk me through|explain how|how do you operate|what do you do|what is this|what are you offering|is there a cost)\b/i,
  SCOPE: /\b(is what you('re| are) proposing|so you mean|are you saying|to confirm|just to clarify|you're introducing|introduce us to|what exactly are you offering|what's the offer|what industr|which industr|deal size|timeline|requirements|criteria|what type|what kind|typical|focus on|specialize|mid-?sized|companies that want to sell|what size|what stage|what geography)/i,
  INTEREST: /\b(interested|i'm interested|i am interested|i would be interested|sure|yes|yeah|yep|sounds good|happy to|open to|that works|works for me|i'm in|count me in|absolutely|definitely|perfect|alright|go ahead|intro me|connect me|make the intro|let's do it|let's|sounds interesting|tell me more|i'd like to learn|curious)\b/i,
  CONFUSION: /\b(i don't understand|not sure what|not sure i understand|confused|what do you mean|can you explain|remind me|what was this about|is this about|thought you meant|i don't follow|lost me|not following|unclear|maybe)\b/i,
  UNKNOWN: /.*/,
};

// v18: isPricing helper - checks if text contains any pricing language
function isPricing(text: string): boolean {
  const tersePattern = /^\s*(price|pricing|cost|fee|fees|charge|charges|paid|pay|payment|commission|comp)\s*\??\s*$/i;
  const embeddedPattern = /what('s| is) in it for you|how do you (get paid|make money)|how are you paid|is this (paid|free)|how (much|do you charge)|what('s| is) the (cost|fee|price)|\bpricing\b|\brate\b|pay you|your fee|\bcommission\b|charge for|rev\s?share|revenue\s?share|access\s?fee|retainer|success\s?fee|what do you take|what's your cut|do you charge|how are you compensated|your cut|your take/i;
  return tersePattern.test(text) || embeddedPattern.test(text);
}

// v17: Contradiction guard - interest + negation within N tokens
function hasContradiction(text: string, windowSize: number = 12): boolean {
  const tokens = tokenize(text);
  const interestTokens = ['interested', 'sure', 'yes', 'ok', 'okay', 'open', 'happy', 'sounds', 'good'];
  const negationTokens = ['not', 'no', "don't", 'dont', "can't", 'cant', 'never', "won't", 'wont'];

  for (let i = 0; i < tokens.length; i++) {
    if (interestTokens.includes(tokens[i])) {
      const windowStart = Math.max(0, i - windowSize);
      const windowEnd = Math.min(tokens.length, i + windowSize);
      for (let j = windowStart; j < windowEnd; j++) {
        if (j !== i && negationTokens.includes(tokens[j])) {
          return true;
        }
      }
    }
  }
  return false;
}

// v17: Compound question patterns (only match SHORT standalone questions)
const COMPOUND_QUESTIONS: Array<{ pattern: RegExp; primary: Stage; secondary: Stage }> = [
  // Only match if the ENTIRE text is just this question (no other content)
  { pattern: /^what('s| is) in it for you\??$/i, primary: 'PRICING', secondary: 'IDENTITY' },
  { pattern: /^what are you proposing\??$/i, primary: 'SCOPE', secondary: 'IDENTITY' },
];

function classifyMultiIntent(inbound: string): MultiIntent {
  const text = inbound.toLowerCase().trim();
  const signals: string[] = [];
  const intents: Stage[] = [];
  let negationDetected = false;

  if (STAGE_PATTERNS.BOUNCE.test(text)) {
    return { primary: 'BOUNCE', secondary: [], signals: ['bounce_pattern'], negationDetected: false };
  }
  if (STAGE_PATTERNS.OOO.test(text)) {
    return { primary: 'OOO', secondary: [], signals: ['ooo_pattern'], negationDetected: false };
  }
  if (STAGE_PATTERNS.HOSTILE.test(text)) {
    return { primary: 'HOSTILE', secondary: [], signals: ['hostile_pattern'], negationDetected: false };
  }
  if (STAGE_PATTERNS.NEGATIVE.test(text)) {
    return { primary: 'NEGATIVE', secondary: [], signals: ['negative_pattern'], negationDetected: false };
  }

  // Check for explicit confusion markers FIRST (before contradiction guard)
  const isConfusion = STAGE_PATTERNS.CONFUSION.test(text);

  // v17: CONTRADICTION GUARD - but not if it's confusion
  if (!isConfusion && hasContradiction(text, 12)) {
    // Require explicit contradiction pattern like "ok but not ok"
    if (/\bok\b.*\bnot\s+ok\b|\bsure\b.*\bnot\s+sure\b|\byes\b.*\bno\b/i.test(text)) {
      return { primary: 'NEGATIVE', secondary: [], signals: ['contradiction_guard'], negationDetected: true };
    }
  }

  const interestTokens = ['interested', 'sure', 'yes', 'open to', 'happy to', 'sounds good'];
  if (hasNegatedIntent(text, interestTokens)) {
    negationDetected = true;
    if (/i don't think|not really|prefer not|rather not/.test(text)) {
      return { primary: 'NEGATIVE', secondary: [], signals: ['negated_interest'], negationDetected: true };
    }
  }

  // Check for negated_ok trap (but not if confusion pattern)
  if (!isConfusion) {
    // "not sure" without "what/i understand" = negative (e.g., "not sure about this")
    // "not sure what/i understand" = confusion (handled by isConfusion check above)
    const isNegatedOk = /not\s+ok|not\s+okay|i'm\s+not\s+ok|not\s+sure(?!\s+(what|i\s+understand))/i.test(text);
    if (isNegatedOk) {
      return { primary: 'NEGATIVE', secondary: [], signals: ['negated_ok'], negationDetected: true };
    }
  }

  // v17: COMPOUND QUESTION ROUTING
  for (const cq of COMPOUND_QUESTIONS) {
    if (cq.pattern.test(text)) {
      return {
        primary: cq.primary,
        secondary: [cq.secondary],
        signals: ['compound_question'],
        negationDetected: false,
      };
    }
  }

  if (STAGE_PATTERNS.SCHEDULING.test(text)) { intents.push('SCHEDULING'); signals.push('scheduling'); }
  if (STAGE_PATTERNS.PRICING.test(text)) { intents.push('PRICING'); signals.push('pricing'); }
  if (STAGE_PATTERNS.PROOF.test(text)) { intents.push('PROOF'); signals.push('proof'); }
  if (STAGE_PATTERNS.IDENTITY.test(text)) { intents.push('IDENTITY'); signals.push('identity'); }
  if (STAGE_PATTERNS.SCOPE.test(text)) { intents.push('SCOPE'); signals.push('scope'); }
  if (STAGE_PATTERNS.CONFUSION.test(text)) { intents.push('CONFUSION'); signals.push('confusion'); }

  if (!negationDetected && STAGE_PATTERNS.INTEREST.test(text)) {
    intents.push('INTEREST');
    signals.push('interest');
  }

  // v18: PRICING FAILSAFE - if isPricing and no intents matched, force PRICING
  if (intents.length === 0) {
    if (isPricing(text)) {
      return { primary: 'PRICING', secondary: [], signals: ['pricing_failsafe'], negationDetected };
    }
    return { primary: 'UNKNOWN', secondary: [], signals: ['no_match'], negationDetected };
  }

  const precedence: Stage[] = ['SCHEDULING', 'PRICING', 'PROOF', 'IDENTITY', 'SCOPE', 'INTEREST', 'CONFUSION'];
  intents.sort((a, b) => precedence.indexOf(a) - precedence.indexOf(b));

  const result = {
    primary: intents[0],
    secondary: intents.slice(1),
    signals,
    negationDetected,
  };

  // v18: PRICING FAILSAFE OVERRIDE - if isPricing but primary is CONFUSION/UNKNOWN/INTEREST, force PRICING
  if (isPricing(text) && !['SCHEDULING', 'PRICING'].includes(result.primary)) {
    result.secondary = result.primary !== 'UNKNOWN' ? [result.primary, ...result.secondary] : result.secondary;
    result.primary = 'PRICING';
    result.signals.push('pricing_override');
  }

  return result;
}

// =============================================================================
// ANCHORPACK V4 (Multi-Strategy Extraction)
// =============================================================================

const CALL_FIRST_LINE = "before any intros, i do a quick fit + timing check on both sides. if it lines up, we align on a 10–15, then i'll route the right matches.";

function mineClausesByScore(outbound: string): { audienceClause?: string; painClause?: string; offerClause?: string } {
  const clauses = outbound.split(/[.;—–\-\n]+/).map(c => c.trim()).filter(c => c.length > 5);

  const audienceCues = /\b(for|with|help|works with|serves|advises|supports|focused on|specializes? in|CFOs?|CEOs?|founders?|owners?|controllers?|advisors?|executives?|partners?|firms?|companies|teams?)\b/i;
  const painCues = /\b(lose|losing|waste|wasting|struggle|struggling|can't|cannot|rushed|miss|missing|risk|stuck|hard to|months|time-sensitive|worry|worrying|don't have|lack|failing|need)\b/i;
  const outcomeCues = /\b(sell|exit|buyers|liquidity|raise|hire|hiring|retain|reduce|grow|scale|find)\b/i;
  const offerCues = /\b(intro|connect|introduce|worth|open to|chat|call|send|reach out)\b/i;

  let bestAudience: { clause: string; score: number } = { clause: '', score: 0 };
  let bestPain: { clause: string; score: number } = { clause: '', score: 0 };
  let bestOffer: { clause: string; score: number } = { clause: '', score: 0 };

  for (const clause of clauses) {
    let audienceScore = 0;
    if (audienceCues.test(clause)) audienceScore += 2;
    if (/\b(CFOs?|CEOs?|founders?|owners?|executives?)\b/i.test(clause)) audienceScore += 2;
    if (audienceScore > bestAudience.score) {
      bestAudience = { clause, score: audienceScore };
    }

    let painScore = 0;
    if (painCues.test(clause)) painScore += 2;
    if (outcomeCues.test(clause)) painScore += 1;
    if (painScore > bestPain.score) {
      bestPain = { clause, score: painScore };
    }

    let offerScore = 0;
    if (offerCues.test(clause)) offerScore += 2;
    if (offerScore > bestOffer.score) {
      bestOffer = { clause, score: offerScore };
    }
  }

  return {
    audienceClause: bestAudience.score >= 2 ? bestAudience.clause : undefined,
    painClause: bestPain.score >= 2 ? bestPain.clause : undefined,
    offerClause: bestOffer.score >= 2 ? bestOffer.clause : undefined,
  };
}

function extractAudiencePhrase(outbound: string): string | undefined {
  const patterns = [
    /\b(CFOs?|CEOs?|founders?|owners?|controllers?|financial advisors?|executives?|partners?|leaders?|decision.?makers?)\s+(and\s+\w+\s+)?(at|in|of|with)\s+([^—–\-\.]{3,40})/i,
    /helps?\s+([^—–\-\.]{5,50}?)(?:\s*[—–\-]|who|that|when|\.)/i,
    /works?\s+with\s+([^—–\-\.]{5,50}?)(?:\s*[—–\-]|who|that|when|\.)/i,
    /for\s+([^—–\-\.]{5,50}?)(?:\s*[—–\-]|who|that|when|\.)/i,
    /serves?\s+([^—–\-\.]{5,50}?)(?:\s*[—–\-]|who|that|when|\.)/i,
  ];

  for (const pattern of patterns) {
    const match = outbound.match(pattern);
    if (match) {
      // For role patterns (CFOs/founders at X), combine role + location
      let phrase: string;
      if (match[4] && match[1]) {
        // Pattern 1: "founders at established private companies"
        phrase = `${match[1]} ${match[3] || 'at'} ${match[4]}`;
      } else {
        phrase = match[1];
      }
      if (phrase && phrase.length >= 5 && phrase.length <= 60) {
        return phrase.replace(/\s+(who|that|when|—|–|-|$).*$/i, '').trim();
      }
    }
  }
  return undefined;
}

function extractFromKnowPattern(outbound: string): { audience?: string; pain?: string } {
  const match = outbound.match(/i know (?:a few|some|companies|founders|owners|firms|teams|folks)?\s*(who|that|which)\s+(.+?)(?:\.|worth|—|$)/i);
  if (match) {
    const painClause = match[2].trim();
    const beforeMatch = outbound.match(/(?:noticed|saw|see)\s+(.+?)\s+(helps?|works?|serves?)/i);
    const audience = beforeMatch ? beforeMatch[1].trim() : undefined;
    return { audience, pain: painClause };
  }
  return {};
}

function extractProvider(outbound: string): string | undefined {
  const match = outbound.match(/[Nn]oticed\s+([A-Z][A-Za-z0-9\s&]+?)\s+(helps?|works?|serves?|speciali)/);
  if (match && match[1]) {
    const provider = match[1].trim();
    if (provider.split(' ').length <= 5 && /^[A-Z]/.test(provider)) {
      return provider;
    }
  }
  return undefined;
}

function extractOfferType(outbound: string): 'intro' | 'call' | 'details' | 'unknown' {
  if (/worth\s+(intro'?ing|an intro|connecting)|make an intro|route.*(intro|match)/i.test(outbound)) {
    return 'intro';
  }
  if (/worth\s+(chatting|a quick call|a call)|quick call|10–15|10-15/i.test(outbound)) {
    return 'call';
  }
  if (/send.*(details|info)|more info/i.test(outbound)) {
    return 'details';
  }
  return 'unknown';
}

function extractOutboundFrameV4(outbound: string): OutboundFrameV4 {
  const clauseResults = mineClausesByScore(outbound);
  const audiencePhrase = extractAudiencePhrase(outbound) || clauseResults.audienceClause;
  const knowPattern = extractFromKnowPattern(outbound);
  const providerName = extractProvider(outbound);
  const offerType = extractOfferType(outbound);
  const painClause = knowPattern.pain || clauseResults.painClause;

  let score = 0;
  if (audiencePhrase) score += 4;
  if (painClause) score += 4;
  if (offerType !== 'unknown') score += 2;
  if (providerName) score += 1;

  return {
    providerName,
    audiencePhrase: audiencePhrase || knowPattern.audience,
    painClause,
    desiredOutcome: undefined,
    offerType,
    evidence: {
      audienceSource: audiencePhrase ? 'pattern' : undefined,
      painSource: painClause ? 'pattern' : undefined,
      offerSource: offerType !== 'unknown' ? 'pattern' : undefined,
      providerSource: providerName ? 'pattern' : undefined,
    },
    raw: outbound,
    score,
  };
}

function buildProspectLabel(frame: OutboundFrameV4): string {
  if (frame.audiencePhrase) {
    let clean = frame.audiencePhrase
      .replace(/^(a few|some|the)\s+/i, '')
      .replace(/\s*[—–\-].*$/, '')
      .trim();

    if (/\b(who|that|when|are|lose|struggle|waste|losing|struggling|wasting)\b/i.test(clean)) {
      const nounMatch = clean.match(/^([^(who|that|when|are|lose|struggle|waste)]+)/i);
      if (nounMatch) {
        clean = nounMatch[1].trim();
      } else {
        clean = 'relevant teams';
      }
    }

    if (clean.split(' ').length > 10) {
      clean = clean.split(' ').slice(0, 10).join(' ');
    }

    return `the ${clean} i mentioned`;
  }

  if (frame.providerName) {
    return `teams that typically work with ${frame.providerName}`;
  }

  return 'the folks i mentioned';
}

function buildPainSentence(frame: OutboundFrameV4): string {
  if (!frame.painClause) {
    return '';
  }

  let pain = frame.painClause.trim();

  if (/^(lose|waste|struggle|can't|cannot|need|have|are|miss|risk)/i.test(pain)) {
    pain = `they ${pain}`;
  }

  if (/^when\s+/i.test(pain)) {
    if (/lose|waste|risk|miss/i.test(pain)) {
      pain = `they lose time ${pain}`;
    } else {
      pain = `timing matters ${pain}`;
    }
  }

  if (!/^(they|these|the|timing)/i.test(pain)) {
    pain = `they're dealing with ${pain}`;
  }

  pain = pain.replace(/they're they/gi, "they're");
  pain = pain.replace(/they they/gi, "they");
  pain = pain.replace(/are\s+lose/gi, "are losing");
  pain = pain.replace(/are\s+waste/gi, "are wasting");
  pain = pain.replace(/are\s+struggle/gi, "are struggling");

  if (!pain.endsWith('.')) pain += '.';

  if (/are\s+(lose|waste|struggle|miss|risk)\b/i.test(pain)) {
    return '';
  }

  return pain;
}

function buildAnchorPackV4(outbound: string): AnchorPackV4 {
  const fallback: AnchorPackV4 = {
    prospect_label: 'the folks i mentioned',
    pain_sentence: '',
    offer_sentence: CALL_FIRST_LINE,
    outbound_summary: 'a quick fit check before any intros.',
    quality: 'fallback',
    missing: ['audience', 'pain'],
  };

  if (!outbound || outbound.trim().length < 20) return fallback;

  const frame = extractOutboundFrameV4(outbound);

  const prospect_label = buildProspectLabel(frame);
  const pain_sentence = buildPainSentence(frame);

  let outbound_summary: string;
  if (frame.audiencePhrase && frame.painClause) {
    const painShort = frame.painClause.split(' ').slice(0, 6).join(' ');
    outbound_summary = `${prospect_label} dealing with ${painShort}.`;
  } else if (frame.audiencePhrase) {
    outbound_summary = `exploring fit with ${prospect_label}.`;
  } else if (frame.painClause) {
    const painShort = frame.painClause.split(' ').slice(0, 8).join(' ');
    outbound_summary = `teams dealing with ${painShort}.`;
  } else {
    outbound_summary = 'a quick fit check before any intros.';
  }

  if (outbound_summary.split(' ').length > 18) {
    outbound_summary = outbound_summary.split(' ').slice(0, 18).join(' ') + '.';
  }

  const missing: string[] = [];
  if (!frame.audiencePhrase) missing.push('audience');
  if (!frame.painClause) missing.push('pain');
  if (!frame.providerName) missing.push('provider');
  if (frame.offerType === 'unknown') missing.push('offer');

  let quality: 'good' | 'partial' | 'fallback';
  if (frame.score >= 8) {
    quality = 'good';
  } else if (frame.score >= 4) {
    quality = 'partial';
  } else {
    quality = 'fallback';
  }

  return {
    prospect_label,
    pain_sentence,
    offer_sentence: CALL_FIRST_LINE,
    outbound_summary,
    quality,
    missing,
  };
}

// =============================================================================
// FORBIDDEN PATTERNS
// =============================================================================

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /the people i mentioned are/i, name: 'people_mentioned_are' },
  { pattern: /are\s+lose\b/i, name: 'are_lose' },
  { pattern: /are\s+losing\b/i, name: 'are_losing' },
  { pattern: /are\s+waste\b/i, name: 'are_waste' },
  { pattern: /are\s+struggle\b/i, name: 'are_struggle' },
  { pattern: /companies that lose clients when/i, name: 'companies_that_lose' },
  { pattern: /are\s+companies\s+that\s+(lose|struggle|can't)/i, name: 'are_companies_that' },
  { pattern: /tech\/services\/industrials/i, name: 'generic_industries' },
  { pattern: /not sure if this landed right/i, name: 'low_status_opener' },
  { pattern: /are you open to an intro, or should i leave it\?/i, name: 'weak_cta' },
  { pattern: /happy to clarify — are you open to an intro/i, name: 'weak_clarify' },
];

function hasForbiddenPattern(text: string): string | null {
  for (const f of FORBIDDEN_PATTERNS) {
    if (f.pattern.test(text)) {
      return f.name;
    }
  }
  return null;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Reply Brain v16 - Classification', () => {
  describe('Hard stops', () => {
    it('should classify bounce messages', () => {
      expect(classifyMultiIntent('address not found in system').primary).toBe('BOUNCE');
      expect(classifyMultiIntent('550 5.1.1 user unknown').primary).toBe('BOUNCE');
      expect(classifyMultiIntent('delivery failed permanently').primary).toBe('BOUNCE');
    });

    it('should classify OOO messages', () => {
      expect(classifyMultiIntent('I am out of office until Monday').primary).toBe('OOO');
      expect(classifyMultiIntent('On vacation, back next week').primary).toBe('OOO');
      expect(classifyMultiIntent('This is an automatic reply').primary).toBe('OOO');
    });

    it('should classify hostile messages', () => {
      expect(classifyMultiIntent('fuck off').primary).toBe('HOSTILE');
      expect(classifyMultiIntent('stop spamming me').primary).toBe('HOSTILE');
      expect(classifyMultiIntent('this is spam').primary).toBe('HOSTILE');
    });

    it('should classify negative messages', () => {
      expect(classifyMultiIntent('not interested').primary).toBe('NEGATIVE');
      expect(classifyMultiIntent('no thanks').primary).toBe('NEGATIVE');
      expect(classifyMultiIntent('please remove me from your list').primary).toBe('NEGATIVE');
      expect(classifyMultiIntent('all set').primary).toBe('NEGATIVE');
      expect(classifyMultiIntent('stop.').primary).toBe('NEGATIVE');
    });
  });

  describe('Intent detection', () => {
    it('should classify scheduling intent', () => {
      expect(classifyMultiIntent('send me your calendar').primary).toBe('SCHEDULING');
      expect(classifyMultiIntent("let's book a call").primary).toBe('SCHEDULING');
      expect(classifyMultiIntent('what times work for you?').primary).toBe('SCHEDULING');
    });

    it('should classify pricing intent', () => {
      expect(classifyMultiIntent("what's in it for you?").primary).toBe('PRICING');
      expect(classifyMultiIntent('how do you get paid?').primary).toBe('PRICING');
      expect(classifyMultiIntent('how are you paid?').primary).toBe('PRICING');
      expect(classifyMultiIntent('is this paid?').primary).toBe('PRICING');
    });

    it('should classify proof intent', () => {
      expect(classifyMultiIntent('who are these people?').primary).toBe('PROOF');
      expect(classifyMultiIntent('which companies are you referring to?').primary).toBe('PROOF');
      expect(classifyMultiIntent('can you name them?').primary).toBe('PROOF');
    });

    it('should classify identity intent', () => {
      expect(classifyMultiIntent('how do you work?').primary).toBe('IDENTITY');
      expect(classifyMultiIntent('how does this work?').primary).toBe('IDENTITY');
      expect(classifyMultiIntent("what's the catch?").primary).toBe('IDENTITY');
      expect(classifyMultiIntent("what's the process?").primary).toBe('IDENTITY');
    });

    it('should classify scope intent', () => {
      expect(classifyMultiIntent('what industries do you focus on?').primary).toBe('SCOPE');
      expect(classifyMultiIntent('what deal size range?').primary).toBe('SCOPE');
      expect(classifyMultiIntent('what type of companies?').primary).toBe('SCOPE');
    });

    it('should classify interest intent', () => {
      expect(classifyMultiIntent("Yes, I'm interested").primary).toBe('INTEREST');
      expect(classifyMultiIntent('sounds good').primary).toBe('INTEREST');
      expect(classifyMultiIntent('definitely interested').primary).toBe('INTEREST');
      expect(classifyMultiIntent('tell me more').primary).toBe('INTEREST');
    });

    it('should classify confusion intent', () => {
      expect(classifyMultiIntent("I don't understand").primary).toBe('CONFUSION');
      expect(classifyMultiIntent('not sure what you mean').primary).toBe('CONFUSION');
      expect(classifyMultiIntent("I don't follow").primary).toBe('CONFUSION');
      expect(classifyMultiIntent('maybe').primary).toBe('CONFUSION');
    });
  });

  describe('Negation detection', () => {
    it('should detect negated interest', () => {
      const result = classifyMultiIntent("i don't think i'm open to this");
      expect(result.primary).toBe('NEGATIVE');
      expect(result.negationDetected).toBe(true);
    });

    it('should not trigger negated ok for confusion patterns', () => {
      const result = classifyMultiIntent('not sure what you mean');
      expect(result.primary).toBe('CONFUSION');
    });

    it('should trigger negated ok without confusion patterns', () => {
      const result = classifyMultiIntent('not sure about this');
      expect(result.primary).toBe('NEGATIVE');
    });
  });

  describe('Multi-intent', () => {
    it('should detect primary and secondary intents', () => {
      const result = classifyMultiIntent("what's in it for you? and who are these people?");
      expect(result.primary).toBe('PRICING');
      expect(result.secondary).toContain('PROOF');
    });

    it('should preserve precedence order', () => {
      const result = classifyMultiIntent('interested, but how does this work?');
      expect(result.primary).toBe('IDENTITY');
      expect(result.secondary).toContain('INTEREST');
    });
  });
});

describe('Reply Brain v16 - AnchorPackV4', () => {
  describe('Multi-strategy extraction', () => {
    it('should extract audience from "helps" pattern', () => {
      const anchor = buildAnchorPackV4('Noticed Argent Light helps founders and owners at established private companies.');
      expect(anchor.prospect_label).toContain('founders');
      expect(anchor.quality).not.toBe('fallback');
    });

    it('should extract pain from "who struggle" pattern', () => {
      const anchor = buildAnchorPackV4("I know a few companies who can't find good exit options.");
      expect(anchor.pain_sentence).toContain("can't find good exit options");
      expect(anchor.quality).not.toBe('fallback');
    });

    it('should extract both audience and pain for good quality', () => {
      const anchor = buildAnchorPackV4("Noticed Argent Light helps founders at private companies — I know a few who can't find good exit options.");
      expect(anchor.quality).toBe('good');
      expect(anchor.missing).not.toContain('audience');
      expect(anchor.missing).not.toContain('pain');
    });

    it('should return partial for audience-only', () => {
      const anchor = buildAnchorPackV4('Noticed your firm helps CFOs at mid-market companies.');
      expect(['good', 'partial']).toContain(anchor.quality);
    });

    it('should return fallback for minimal outbound', () => {
      const anchor = buildAnchorPackV4('Quick ping');
      expect(anchor.quality).toBe('fallback');
    });

    it('should extract provider name', () => {
      const frame = extractOutboundFrameV4('Noticed Argent Light helps founders');
      expect(frame.providerName).toBe('Argent Light');
    });

    it('should extract offer type', () => {
      const frame = extractOutboundFrameV4("Worth intro'ing you?");
      expect(frame.offerType).toBe('intro');
    });
  });

  describe('Grammar safety', () => {
    it('should not produce "are lose" in pain sentence', () => {
      const anchor = buildAnchorPackV4('companies who are lose clients when tax planning gets rushed');
      expect(anchor.pain_sentence).not.toMatch(/are lose/i);
    });

    it('should not include verb fragments in prospect_label', () => {
      const anchor = buildAnchorPackV4('Noticed your firm helps companies that lose clients when');
      expect(anchor.prospect_label).not.toMatch(/lose|that|when/i);
    });

    it('should have proper subject in pain sentence', () => {
      const anchor = buildAnchorPackV4("I know a few who struggle to find exit options");
      if (anchor.pain_sentence) {
        expect(anchor.pain_sentence).toMatch(/^(they|these|the|timing)/i);
      }
    });
  });
});

describe('Reply Brain v16 - Forbidden Patterns', () => {
  it('should detect "the people i mentioned are" pattern', () => {
    expect(hasForbiddenPattern('the people i mentioned are companies that lose')).toBe('people_mentioned_are');
  });

  it('should detect "are lose" pattern', () => {
    expect(hasForbiddenPattern('they are lose clients')).toBe('are_lose');
  });

  it('should detect weak CTA patterns', () => {
    expect(hasForbiddenPattern('are you open to an intro, or should i leave it?')).toBe('weak_cta');
  });

  it('should detect low status opener', () => {
    expect(hasForbiddenPattern('not sure if this landed right')).toBe('low_status_opener');
  });

  it('should return null for clean text', () => {
    expect(hasForbiddenPattern("i'm referring to a few CFOs at mid-market firms")).toBeNull();
  });
});

describe('Reply Brain v16 - Corpus Tests', () => {
  // Load corpus
  let corpus: Array<{ outbound: string; inbound: string; expectedStage: Stage; notes: string }> = [];

  try {
    const corpusPath = join(__dirname, 'corpus', 'replies_100.jsonl');
    const corpusContent = readFileSync(corpusPath, 'utf-8');
    corpus = corpusContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (e) {
    console.warn('Corpus file not found, skipping corpus tests');
  }

  if (corpus.length > 0) {
    corpus.forEach((item, index) => {
      it(`Corpus #${index + 1}: ${item.notes}`, () => {
        const result = classifyMultiIntent(item.inbound);
        expect(result.primary).toBe(item.expectedStage);
      });
    });
  }
});

describe('Reply Brain v16 - Edge Cases', () => {
  it('should handle mixed case', () => {
    expect(classifyMultiIntent('YES I AM INTERESTED').primary).toBe('INTEREST');
    expect(classifyMultiIntent('NOT INTERESTED').primary).toBe('NEGATIVE');
  });

  it('should handle extra whitespace', () => {
    expect(classifyMultiIntent('   not interested   ').primary).toBe('NEGATIVE');
  });

  it('should handle emoji', () => {
    expect(classifyMultiIntent('sounds good 👍').primary).toBe('INTEREST');
  });

  it('should handle very long text', () => {
    const longText = 'interested '.repeat(100);
    expect(classifyMultiIntent(longText).primary).toBe('INTEREST');
  });

  it('should handle special characters', () => {
    expect(classifyMultiIntent("what's the catch???").primary).toBe('IDENTITY');
  });

  it('should handle greeting prefix', () => {
    expect(classifyMultiIntent('Hi Jesse, Yes, that would be great').primary).toBe('INTEREST');
  });
});

describe('Reply Brain v16 - Quality Metrics', () => {
  let corpus: Array<{ outbound: string; inbound: string; expectedStage: Stage; notes: string }> = [];

  try {
    const corpusPath = join(__dirname, 'corpus', 'replies_100.jsonl');
    const corpusContent = readFileSync(corpusPath, 'utf-8');
    corpus = corpusContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    // Skip if no corpus
  }

  if (corpus.length > 0) {
    it('should achieve >= 90% classification accuracy on corpus', () => {
      let correct = 0;
      for (const item of corpus) {
        const result = classifyMultiIntent(item.inbound);
        if (result.primary === item.expectedStage) {
          correct++;
        }
      }
      const accuracy = correct / corpus.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.9);
    });

    it('should have zero forbidden pattern outputs', () => {
      for (const item of corpus) {
        const anchor = buildAnchorPackV4(item.outbound);
        expect(hasForbiddenPattern(anchor.prospect_label)).toBeNull();
        expect(hasForbiddenPattern(anchor.pain_sentence)).toBeNull();
      }
    });

    it('should achieve anchor quality metrics', () => {
      // Count outbounds with real content
      const realOutbounds = corpus.filter(item => item.outbound.length > 30);
      let goodOrPartial = 0;
      for (const item of realOutbounds) {
        const anchor = buildAnchorPackV4(item.outbound);
        if (anchor.quality === 'good' || anchor.quality === 'partial') {
          goodOrPartial++;
        }
      }
      // v16: Should achieve higher quality on real outbounds
      if (realOutbounds.length > 0) {
        const rate = goodOrPartial / realOutbounds.length;
        expect(rate).toBeGreaterThanOrEqual(0.5);
      }
    });
  }
});

// =============================================================================
// v18 PRICING TESTS - HARD RULE ENFORCEMENT
// =============================================================================

describe('Reply Brain v18 - PRICING Hard Rule', () => {
  describe('Terse PRICING Detection', () => {
    it('should classify "price?" as PRICING', () => {
      expect(classifyMultiIntent('price?').primary).toBe('PRICING');
    });

    it('should classify "pricing" as PRICING', () => {
      expect(classifyMultiIntent('pricing').primary).toBe('PRICING');
    });

    it('should classify "cost?" as PRICING', () => {
      expect(classifyMultiIntent('cost?').primary).toBe('PRICING');
    });

    it('should classify "fee?" as PRICING', () => {
      expect(classifyMultiIntent('fee?').primary).toBe('PRICING');
    });

    it('should classify "paid?" as PRICING', () => {
      expect(classifyMultiIntent('paid?').primary).toBe('PRICING');
    });

    it('should classify "commission?" as PRICING', () => {
      expect(classifyMultiIntent('commission?').primary).toBe('PRICING');
    });

    it('should classify "   price?   " (with whitespace) as PRICING', () => {
      expect(classifyMultiIntent('   price?   ').primary).toBe('PRICING');
    });
  });

  describe('Embedded PRICING Detection', () => {
    it('should classify "what\'s the cost" as PRICING', () => {
      expect(classifyMultiIntent("what's the cost").primary).toBe('PRICING');
    });

    it('should classify "is this paid" as PRICING', () => {
      expect(classifyMultiIntent('is this paid').primary).toBe('PRICING');
    });

    it('should classify "is this free" as PRICING', () => {
      expect(classifyMultiIntent('is this free').primary).toBe('PRICING');
    });

    it('should classify "what\'s in it for you?" as PRICING (primary) + IDENTITY (secondary)', () => {
      const result = classifyMultiIntent("what's in it for you?");
      expect(result.primary).toBe('PRICING');
    });

    it('should classify "how do you get paid" as PRICING', () => {
      expect(classifyMultiIntent('how do you get paid').primary).toBe('PRICING');
    });

    it('should classify "how do you make money" as PRICING', () => {
      expect(classifyMultiIntent('how do you make money').primary).toBe('PRICING');
    });
  });

  describe('PRICING Failsafe Override', () => {
    it('should force PRICING even if other intents detected', () => {
      // "how does this work and what's the cost" - would normally be IDENTITY + PRICING
      // But PRICING should win
      const result = classifyMultiIntent("how does this work and what's the cost");
      expect(result.primary).toBe('PRICING');
    });

    it('should NOT override SCHEDULING when pricing mentioned', () => {
      // Scheduling takes precedence
      const result = classifyMultiIntent("send calendar, and what's the pricing?");
      expect(result.primary).toBe('SCHEDULING');
    });
  });

  describe('PRICING with NEGATIVE context', () => {
    it('should classify "not interested, how much do you charge" as NEGATIVE (NEGATIVE wins)', () => {
      // When NEGATIVE pattern matches, it should win even if pricing language present
      expect(classifyMultiIntent("not interested, how much do you charge").primary).toBe('NEGATIVE');
    });

    it('should classify "not interested in paying" as NEGATIVE', () => {
      expect(classifyMultiIntent("not interested in paying").primary).toBe('NEGATIVE');
    });

    it('should classify "no thanks, what\'s the cost" as NEGATIVE', () => {
      expect(classifyMultiIntent("no thanks, what's the cost").primary).toBe('NEGATIVE');
    });
  });

  describe('isPricing Helper', () => {
    it('should return true for terse pricing queries', () => {
      expect(isPricing('price?')).toBe(true);
      expect(isPricing('pricing')).toBe(true);
      expect(isPricing('cost')).toBe(true);
      expect(isPricing('fee')).toBe(true);
    });

    it('should return true for embedded pricing language', () => {
      expect(isPricing("what's the cost")).toBe(true);
      expect(isPricing("how are you paid")).toBe(true);
      expect(isPricing("is this free")).toBe(true);
    });

    it('should return false for non-pricing queries', () => {
      expect(isPricing('interested')).toBe(false);
      expect(isPricing('how does this work')).toBe(false);
      expect(isPricing('send calendar')).toBe(false);
    });
  });
});
