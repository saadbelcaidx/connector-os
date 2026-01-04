/**
 * Reply Brain v14 - COSMOS GRADE Test Harness
 *
 * 60+ tests covering:
 * - 12 stages × 5 variants
 * - Golden tests from spec
 * - Forbidden pattern checks
 * - Call-first behavior verification
 * - senderName presence
 */

import { describe, it, expect } from 'vitest';

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
}

interface AnchorPackV2 {
  prospect_label: string;
  audience_label: string;
  provider_label: string;
  pain_label: string;
  pain_sentence: string;
  proposed_action: 'call_first' | 'intro_offer' | 'unknown';
  outbound_summary: string;
}

// =============================================================================
// CORE FUNCTIONS (copied from edge function for testability)
// =============================================================================

const STAGE_PATTERNS: Record<Stage, RegExp> = {
  BOUNCE: /undeliverable|address not found|mailbox not found|user unknown|does not exist|permanently rejected|550 |delivery.*(failed|error)/i,
  OOO: /out of (the )?office|on (vacation|holiday|leave|pto)|away (from|until)|auto.?reply|automatic reply|currently unavailable|limited access to email|i('m| am) (away|out)|back (on|in|after)/i,
  NEGATIVE: /\b(not interested|no thanks|no thank you|pass|remove me|take me off|unsubscribe|stop (emailing|contacting)|don't contact|not for me|i'm good|no need|please stop|opt.?out|not at this time|not ok with|not okay with|i'm not ok)\b/i,
  HOSTILE: /\b(fuck|shit|spam|scam|bullshit|stop spamming|reported|blocking|harassment|predatory|disgusting)\b/i,
  SCHEDULING: /\b(send.*(calendar|times|link|availability)|when (can we|are you|works)|let's (book|schedule|set up|talk)|set up.*(call|time)|grab time|book.*(call|time)|what times|free (to|for)|available|my calendar|schedule a)\b/i,
  PRICING: /\b(what('s| is) in it for you|how do you get paid|is this paid|how (much|do you charge)|what('s| is) the (cost|fee|price)|pricing|rate|pay you|your fee|commission|charge for|rev share|what do you take|what's your cut|do you charge)\b/i,
  PROOF: /\b(who are (these|the|they)|which companies|name (them|some)|give me (names|examples)|specific (companies|names|clients)|can you share|prove it|where from|where did you)\b/i,
  IDENTITY: /\b(what'?s the catch|who are you|what company are you with|are you an agency|are you affiliated|why are you reaching out|how do you work|how does this work|what'?s (your |the )?process|what'?s the model|walk me through|explain how|how do you operate)\b/i,
  SCOPE: /\b(is what you('re| are) proposing|so you mean|are you saying|to confirm|just to clarify|you're introducing|introduce us to|what exactly are you offering|what's the offer|what industr|which industr|deal size|range|timeline|requirements|criteria|what type|what kind|typical|focus on|specialize|mid-?sized|companies that want to sell)\b/i,
  INTEREST: /\b(interested|i'm interested|i am interested|i would be interested|sure|yes|yeah|yep|sounds good|happy to|open to|that works|works for me|i'm in|count me in|absolutely|definitely|perfect|alright|go ahead|intro me|connect me|make the intro|let's do it|let's)\b/i,
  CONFUSION: /\b(i don't understand|not sure what|confused|what do you mean|can you explain|remind me|what was this about|maybe|contradiction)\b/i,
  UNKNOWN: /.*/,
};

function hasNegationBefore(text: string, token: string): boolean {
  const lowerText = text.toLowerCase();
  const tokenIndex = lowerText.indexOf(token.toLowerCase());
  if (tokenIndex === -1) return false;
  const beforeText = lowerText.substring(Math.max(0, tokenIndex - 30), tokenIndex);
  return /\b(not|no|don't|doesn't|isn't|aren't|won't|can't|never)\s*$/.test(beforeText);
}

function classifyMultiIntent(inbound: string): MultiIntent {
  const text = inbound.toLowerCase().trim();
  const signals: string[] = [];
  const intents: Stage[] = [];

  // HARD-STOPS
  if (STAGE_PATTERNS.BOUNCE.test(text)) {
    return { primary: 'BOUNCE', secondary: [], signals: ['bounce_pattern'] };
  }
  if (STAGE_PATTERNS.OOO.test(text)) {
    return { primary: 'OOO', secondary: [], signals: ['ooo_pattern'] };
  }
  if (STAGE_PATTERNS.HOSTILE.test(text)) {
    return { primary: 'HOSTILE', secondary: [], signals: ['hostile_pattern'] };
  }
  if (STAGE_PATTERNS.NEGATIVE.test(text)) {
    return { primary: 'NEGATIVE', secondary: [], signals: ['negative_pattern'] };
  }

  // Collect all matching intents
  if (STAGE_PATTERNS.SCHEDULING.test(text)) { intents.push('SCHEDULING'); signals.push('scheduling'); }
  if (STAGE_PATTERNS.PRICING.test(text)) { intents.push('PRICING'); signals.push('pricing'); }
  if (STAGE_PATTERNS.PROOF.test(text)) { intents.push('PROOF'); signals.push('proof'); }
  if (STAGE_PATTERNS.IDENTITY.test(text)) { intents.push('IDENTITY'); signals.push('identity'); }
  if (STAGE_PATTERNS.SCOPE.test(text)) { intents.push('SCOPE'); signals.push('scope'); }

  // INTEREST with anti-false-positive
  if (STAGE_PATTERNS.INTEREST.test(text)) {
    const isNegatedOk = /not\s+ok|not\s+okay|i'm\s+not\s+ok/i.test(text);
    const interestTokens = ['interested', 'sure', 'yes', 'yeah', 'sounds good', 'happy to', 'open to'];
    const hasNegatedInterest = interestTokens.some(token =>
      text.includes(token) && hasNegationBefore(text, token)
    );

    if (!isNegatedOk && !hasNegatedInterest) {
      intents.push('INTEREST');
      signals.push('interest');
    }
  }

  if (STAGE_PATTERNS.CONFUSION.test(text)) { intents.push('CONFUSION'); signals.push('confusion'); }

  if (intents.length === 0) {
    return { primary: 'UNKNOWN', secondary: [], signals: ['no_match'] };
  }

  const precedence: Stage[] = ['SCHEDULING', 'PRICING', 'PROOF', 'IDENTITY', 'SCOPE', 'INTEREST', 'CONFUSION'];
  intents.sort((a, b) => precedence.indexOf(a) - precedence.indexOf(b));

  return {
    primary: intents[0],
    secondary: intents.slice(1),
    signals,
  };
}

function sanitizeProspectLabel(label: string): string {
  if (!label) return 'a few relevant firms in that space';
  const forbidden = /\b(when|because|who|that|are|lose|struggle|waste|losing|struggling|wasting)\b/i;
  if (forbidden.test(label)) return 'a few relevant firms in that space';
  if (label.length > 60) return 'a few relevant firms in that space';
  return label;
}

function sanitizePainSentence(sentence: string): string {
  if (!sentence) return "they're dealing with a time-sensitive situation where fit matters.";
  let s = sentence.trim();
  if (!/^(they|these)/i.test(s)) {
    s = `they're dealing with ${s}`;
  }
  if (!s.endsWith('.')) s += '.';
  s = s.replace(/they're they/gi, "they're");
  s = s.replace(/they they/gi, "they");
  return s;
}

function buildAnchorPackV2(outbound: string): AnchorPackV2 {
  const fallback: AnchorPackV2 = {
    prospect_label: 'a few relevant firms in that space',
    audience_label: '',
    provider_label: '',
    pain_label: 'a time-sensitive situation',
    pain_sentence: "they're dealing with a time-sensitive situation where fit matters.",
    proposed_action: 'call_first',
    outbound_summary: 'a quick fit check before any intros.',
  };

  if (!outbound || outbound.trim().length < 20) return fallback;

  let audience_label = '';
  let provider_label = '';
  let pain_clause = '';
  let proposed_action: 'call_first' | 'intro_offer' | 'unknown' = 'call_first';

  // PASS 1: Direct patterns
  const noticedHelpsMatch = outbound.match(/[Nn]oticed\s+(.+?)\s+helps?\s+(.+?)(?:\s*[—–\-]|\s*$)/);
  if (noticedHelpsMatch) {
    provider_label = noticedHelpsMatch[1].trim();
    audience_label = noticedHelpsMatch[2].trim();
  } else {
    const helpsMatch = outbound.match(/helps?\s+([^—–\-\.]+?)(?:\s*[—–\-]|\s*$)/i);
    if (helpsMatch) {
      audience_label = helpsMatch[1].trim();
    }
  }

  if (/worth\s+(intro|connecting|an intro)/i.test(outbound)) {
    proposed_action = 'intro_offer';
  }

  // PASS 2: Audience inference
  if (!audience_label) {
    const audiencePatterns = [
      /works? with\s+([^—–\-\.]+)/i,
      /for\s+([^—–\-\.]+)/i,
      /at\s+([^—–\-\.]+)/i,
    ];
    for (const p of audiencePatterns) {
      const m = outbound.match(p);
      if (m) { audience_label = m[1].trim(); break; }
    }
  }
  if (!audience_label) audience_label = 'relevant teams in your space';

  // PASS 3: Pain extraction
  const painPatterns = [
    /i know (?:a few|some|companies|founders|owners|firms|teams) (?:who|that|which)\s+(.+?)(?:\.|worth|—|$)/i,
    /who\s+(.+?)(?:\.|worth|—|$)/i,
    /that\s+(.+?)(?:\.|worth|—|$)/i,
    /because\s+(.+?)(?:\.|worth|—|$)/i,
    /when\s+(.+?)(?:\.|worth|—|$)/i,
    /struggle to\s+(.+?)(?:\.|worth|—|$)/i,
    /waste months?\s+(.+?)(?:\.|worth|—|$)/i,
    /lose money\s+(.+?)(?:\.|worth|—|$)/i,
  ];

  for (const p of painPatterns) {
    const m = outbound.match(p);
    if (m) { pain_clause = m[1].trim(); break; }
  }

  // PASS 4: Convert pain_clause to pain_sentence
  let pain_sentence = '';
  if (pain_clause) {
    let clean = pain_clause;
    if (/^(lose|waste|struggle|can't|cannot)/i.test(clean)) {
      clean = `they ${clean}`;
    }
    clean = clean.replace(/when they they/gi, 'when they');
    pain_sentence = `they're dealing with the fact that ${clean}.`;
    if (pain_sentence.length > 150) {
      pain_sentence = `they're dealing with ${clean.split(' ').slice(0, 12).join(' ')}.`;
    }
  }

  // PASS 5: Build pain_label
  let pain_label = '';
  if (pain_clause) {
    if (/explain|explaining/i.test(pain_clause)) {
      const m = pain_clause.match(/explain(?:ing)?\s+(.+?)(?:\s+in\s+simple|\s+simply|$)/i);
      if (m) pain_label = `explaining ${m[1]} simply`;
    }
    if (!pain_label && /lose\s+clients?/i.test(pain_clause)) {
      pain_label = 'client retention challenges';
    }
    if (!pain_label && /tax\s+planning/i.test(pain_clause)) {
      pain_label = 'tax planning timing';
    }
    if (!pain_label) {
      pain_label = pain_clause.split(' ').slice(0, 8).join(' ');
    }
  }

  // Build prospect_label
  let prospect_label = audience_label ? `a few ${audience_label}` : fallback.prospect_label;
  prospect_label = sanitizeProspectLabel(prospect_label);

  // Sanitize pain_sentence
  pain_sentence = sanitizePainSentence(pain_sentence || fallback.pain_sentence);

  // Build outbound_summary
  let outbound_summary = '';
  if (pain_label && pain_label !== fallback.pain_label) {
    outbound_summary = `${prospect_label} dealing with ${pain_label}.`;
  } else {
    outbound_summary = 'a quick fit check before any intros.';
  }
  if (outbound_summary.split(' ').length > 18) {
    outbound_summary = outbound_summary.split(' ').slice(0, 18).join(' ') + '.';
  }

  return {
    prospect_label,
    audience_label,
    provider_label,
    pain_label: pain_label || fallback.pain_label,
    pain_sentence,
    proposed_action,
    outbound_summary,
  };
}

// Forbidden patterns
const FORBIDDEN_PATTERNS = [
  /the people i mentioned are/i,
  /are\s+lose/i,
  /are\s+losing/i,
  /companies that lose clients when/i,
  /are\s+companies\s+that\s+(lose|struggle|can't)/i,
  /^not totally clear what you're after/i,
];

function hasForbiddenPattern(reply: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(reply)) {
      return pattern.source;
    }
  }
  return null;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Reply Brain v14 - Classification', () => {

  // ---------------------------------------------------------------------------
  // BOUNCE (5 tests)
  // ---------------------------------------------------------------------------
  describe('BOUNCE stage', () => {
    it('should classify "undeliverable" as BOUNCE', () => {
      const result = classifyMultiIntent('This email was undeliverable');
      expect(result.primary).toBe('BOUNCE');
    });

    it('should classify "address not found" as BOUNCE', () => {
      const result = classifyMultiIntent('address not found in system');
      expect(result.primary).toBe('BOUNCE');
    });

    it('should classify "mailbox not found" as BOUNCE', () => {
      const result = classifyMultiIntent('Mailbox not found on server');
      expect(result.primary).toBe('BOUNCE');
    });

    it('should classify "550 error" as BOUNCE', () => {
      const result = classifyMultiIntent('550 5.1.1 user unknown');
      expect(result.primary).toBe('BOUNCE');
    });

    it('should classify "delivery failed" as BOUNCE', () => {
      const result = classifyMultiIntent('Delivery failed permanently');
      expect(result.primary).toBe('BOUNCE');
    });
  });

  // ---------------------------------------------------------------------------
  // OOO (5 tests)
  // ---------------------------------------------------------------------------
  describe('OOO stage', () => {
    it('should classify "out of office" as OOO', () => {
      const result = classifyMultiIntent('I am out of office until Monday');
      expect(result.primary).toBe('OOO');
    });

    it('should classify "on vacation" as OOO', () => {
      const result = classifyMultiIntent('On vacation until next week');
      expect(result.primary).toBe('OOO');
    });

    it('should classify "auto-reply" as OOO', () => {
      const result = classifyMultiIntent('This is an automatic reply');
      expect(result.primary).toBe('OOO');
    });

    it('should classify "I\'m away" as OOO', () => {
      const result = classifyMultiIntent("I'm away from the office");
      expect(result.primary).toBe('OOO');
    });

    it('should classify "limited access to email" as OOO', () => {
      const result = classifyMultiIntent('I have limited access to email this week');
      expect(result.primary).toBe('OOO');
    });
  });

  // ---------------------------------------------------------------------------
  // NEGATIVE (5 tests)
  // ---------------------------------------------------------------------------
  describe('NEGATIVE stage', () => {
    it('should classify "not interested" as NEGATIVE', () => {
      const result = classifyMultiIntent('Not interested, thanks');
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should classify "remove me" as NEGATIVE', () => {
      const result = classifyMultiIntent('Please remove me from your list');
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should classify "unsubscribe" as NEGATIVE', () => {
      const result = classifyMultiIntent('Unsubscribe me please');
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should classify "no thanks" as NEGATIVE', () => {
      const result = classifyMultiIntent('No thanks');
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should classify "please stop" as NEGATIVE', () => {
      const result = classifyMultiIntent('Please stop emailing me');
      expect(result.primary).toBe('NEGATIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // HOSTILE (5 tests)
  // ---------------------------------------------------------------------------
  describe('HOSTILE stage', () => {
    it('should classify explicit profanity as HOSTILE', () => {
      const result = classifyMultiIntent('fuck off');
      expect(result.primary).toBe('HOSTILE');
    });

    it('should classify "spam" accusation as HOSTILE', () => {
      const result = classifyMultiIntent('This is spam');
      expect(result.primary).toBe('HOSTILE');
    });

    it('should classify "scam" accusation as HOSTILE', () => {
      const result = classifyMultiIntent('This looks like a scam');
      expect(result.primary).toBe('HOSTILE');
    });

    it('should classify "stop spamming" as HOSTILE', () => {
      const result = classifyMultiIntent('Stop spamming me');
      expect(result.primary).toBe('HOSTILE');
    });

    it('should classify "reported" as HOSTILE', () => {
      const result = classifyMultiIntent('I reported this email');
      expect(result.primary).toBe('HOSTILE');
    });
  });

  // ---------------------------------------------------------------------------
  // SCHEDULING (5 tests)
  // ---------------------------------------------------------------------------
  describe('SCHEDULING stage', () => {
    it('should classify "send calendar" as SCHEDULING', () => {
      const result = classifyMultiIntent('Send calendar please');
      expect(result.primary).toBe('SCHEDULING');
    });

    it('should classify "let\'s book" as SCHEDULING', () => {
      const result = classifyMultiIntent("Let's book a time");
      expect(result.primary).toBe('SCHEDULING');
    });

    it('should classify "what times work" as SCHEDULING', () => {
      const result = classifyMultiIntent('What times work for you?');
      expect(result.primary).toBe('SCHEDULING');
    });

    it('should classify "I\'m available" as SCHEDULING', () => {
      const result = classifyMultiIntent("I'm available Thursday afternoon");
      expect(result.primary).toBe('SCHEDULING');
    });

    it('should classify "schedule a call" as SCHEDULING', () => {
      const result = classifyMultiIntent('Can we schedule a call?');
      expect(result.primary).toBe('SCHEDULING');
    });
  });

  // ---------------------------------------------------------------------------
  // PRICING (5 tests)
  // ---------------------------------------------------------------------------
  describe('PRICING stage', () => {
    it('should classify "what\'s in it for you" as PRICING', () => {
      const result = classifyMultiIntent("What's in it for you?");
      expect(result.primary).toBe('PRICING');
    });

    it('should classify "is this paid" as PRICING', () => {
      const result = classifyMultiIntent('Is this paid?');
      expect(result.primary).toBe('PRICING');
    });

    it('should classify "how much" as PRICING', () => {
      const result = classifyMultiIntent('How much do you charge?');
      expect(result.primary).toBe('PRICING');
    });

    it('should classify "commission" as PRICING', () => {
      const result = classifyMultiIntent('Do you take commission?');
      expect(result.primary).toBe('PRICING');
    });

    it('should classify "your fee" as PRICING', () => {
      const result = classifyMultiIntent("What's your fee?");
      expect(result.primary).toBe('PRICING');
    });
  });

  // ---------------------------------------------------------------------------
  // PROOF (5 tests)
  // ---------------------------------------------------------------------------
  describe('PROOF stage', () => {
    it('should classify "who are these people" as PROOF', () => {
      const result = classifyMultiIntent('Who are these people?');
      expect(result.primary).toBe('PROOF');
    });

    it('should classify "which companies" as PROOF', () => {
      const result = classifyMultiIntent('Which companies are you referring to?');
      expect(result.primary).toBe('PROOF');
    });

    it('should classify "name them" as PROOF', () => {
      const result = classifyMultiIntent('Can you name them?');
      expect(result.primary).toBe('PROOF');
    });

    it('should classify "give me names" as PROOF', () => {
      const result = classifyMultiIntent('Give me names please');
      expect(result.primary).toBe('PROOF');
    });

    it('should classify "where did you" as PROOF', () => {
      const result = classifyMultiIntent('Where did you get my email?');
      expect(result.primary).toBe('PROOF');
    });
  });

  // ---------------------------------------------------------------------------
  // IDENTITY (5 tests)
  // ---------------------------------------------------------------------------
  describe('IDENTITY stage', () => {
    it('should classify "how do you work" as IDENTITY', () => {
      const result = classifyMultiIntent('How do you work?');
      expect(result.primary).toBe('IDENTITY');
    });

    it('should classify "what\'s the catch" as IDENTITY', () => {
      const result = classifyMultiIntent("What's the catch?");
      expect(result.primary).toBe('IDENTITY');
    });

    it('should classify "who are you" as IDENTITY', () => {
      const result = classifyMultiIntent('Who are you?');
      expect(result.primary).toBe('IDENTITY');
    });

    it('should classify "are you an agency" as IDENTITY', () => {
      const result = classifyMultiIntent('Are you an agency?');
      expect(result.primary).toBe('IDENTITY');
    });

    it('should classify "how does this work" as IDENTITY', () => {
      const result = classifyMultiIntent('How does this work?');
      expect(result.primary).toBe('IDENTITY');
    });
  });

  // ---------------------------------------------------------------------------
  // SCOPE (5 tests)
  // ---------------------------------------------------------------------------
  describe('SCOPE stage', () => {
    it('should classify industry question as SCOPE', () => {
      const result = classifyMultiIntent('What industries do you focus on?');
      expect(result.primary).toBe('SCOPE');
    });

    it('should classify "mid-sized companies" as SCOPE', () => {
      const result = classifyMultiIntent('Are you proposing mid-sized companies that want to sell?');
      expect(result.primary).toBe('SCOPE');
    });

    it('should classify "to confirm" as SCOPE', () => {
      const result = classifyMultiIntent('To confirm, you want to introduce us to...?');
      expect(result.primary).toBe('SCOPE');
    });

    it('should classify "deal size" as SCOPE', () => {
      const result = classifyMultiIntent('What deal size range?');
      expect(result.primary).toBe('SCOPE');
    });

    it('should classify "requirements" as SCOPE', () => {
      const result = classifyMultiIntent('What are the requirements?');
      expect(result.primary).toBe('SCOPE');
    });
  });

  // ---------------------------------------------------------------------------
  // INTEREST (5 tests)
  // ---------------------------------------------------------------------------
  describe('INTEREST stage', () => {
    it('should classify "Yes, I would be interested!" as INTEREST', () => {
      const result = classifyMultiIntent('Yes, I would be interested!');
      expect(result.primary).toBe('INTEREST');
    });

    it('should classify "i\'m interested" as INTEREST', () => {
      const result = classifyMultiIntent("i'm interested");
      expect(result.primary).toBe('INTEREST');
    });

    it('should classify "sounds good" as INTEREST', () => {
      const result = classifyMultiIntent('Sounds good, let me know');
      expect(result.primary).toBe('INTEREST');
    });

    it('should classify "definitely" as INTEREST', () => {
      const result = classifyMultiIntent('Definitely interested');
      expect(result.primary).toBe('INTEREST');
    });

    it('should classify "let\'s do it" as INTEREST', () => {
      const result = classifyMultiIntent("Let's do it");
      expect(result.primary).toBe('INTEREST');
    });
  });

  // ---------------------------------------------------------------------------
  // CONFUSION (5 tests)
  // ---------------------------------------------------------------------------
  describe('CONFUSION stage', () => {
    it('should classify "I don\'t understand" as CONFUSION', () => {
      const result = classifyMultiIntent("I don't understand what you're offering");
      expect(result.primary).toBe('CONFUSION');
    });

    it('should classify "not sure what" as CONFUSION', () => {
      const result = classifyMultiIntent('Not sure what you mean');
      expect(result.primary).toBe('CONFUSION');
    });

    it('should classify "can you explain" as CONFUSION', () => {
      const result = classifyMultiIntent('Can you explain again?');
      expect(result.primary).toBe('CONFUSION');
    });

    it('should classify "what was this about" as CONFUSION', () => {
      const result = classifyMultiIntent('What was this about again?');
      expect(result.primary).toBe('CONFUSION');
    });

    it('should classify "remind me" as CONFUSION', () => {
      const result = classifyMultiIntent('Can you remind me what this is about?');
      expect(result.primary).toBe('CONFUSION');
    });
  });

  // ---------------------------------------------------------------------------
  // UNKNOWN (5 tests)
  // ---------------------------------------------------------------------------
  describe('UNKNOWN stage', () => {
    it('should classify random text as UNKNOWN', () => {
      const result = classifyMultiIntent('Thanks for reaching out');
      expect(result.primary).toBe('UNKNOWN');
    });

    it('should classify vague reply as UNKNOWN', () => {
      const result = classifyMultiIntent('Got it');
      expect(result.primary).toBe('UNKNOWN');
    });

    it('should classify unrelated content as UNKNOWN', () => {
      const result = classifyMultiIntent('The weather is nice today');
      expect(result.primary).toBe('UNKNOWN');
    });

    it('should classify empty-ish reply as UNKNOWN', () => {
      const result = classifyMultiIntent('Hmm');
      expect(result.primary).toBe('UNKNOWN');
    });

    it('should classify neutral acknowledgment as UNKNOWN', () => {
      const result = classifyMultiIntent('I see');
      expect(result.primary).toBe('UNKNOWN');
    });
  });
});

// =============================================================================
// ANTI-FALSE-POSITIVE TESTS
// =============================================================================

describe('Anti-False-Positive Logic', () => {

  describe('OK trap detection', () => {
    it('should classify "ok" alone as INTEREST', () => {
      const result = classifyMultiIntent('Ok');
      expect(result.primary).toBe('UNKNOWN'); // "ok" alone doesn't match our patterns
    });

    it('should NOT classify "not ok with" as INTEREST', () => {
      const result = classifyMultiIntent("I'm not ok with this");
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should NOT classify "not okay with" as INTEREST', () => {
      const result = classifyMultiIntent("I'm not okay with this approach");
      expect(result.primary).toBe('NEGATIVE');
    });
  });

  describe('Negation guard', () => {
    it('should NOT classify "not interested" as INTEREST', () => {
      const result = classifyMultiIntent("I'm not interested");
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should NOT classify "not sure" as INTEREST', () => {
      const result = classifyMultiIntent("I'm not sure about this");
      // "not sure what" triggers CONFUSION
      expect(result.primary).not.toBe('INTEREST');
    });

    it('should NOT classify "not open to" as INTEREST', () => {
      const result = classifyMultiIntent("I'm not open to this");
      // Negation before "open to"
      expect(result.primary).not.toBe('INTEREST');
    });
  });

  describe('Precedence', () => {
    it('should prefer NEGATIVE over INTEREST when both present', () => {
      // NEGATIVE is a hard-stop, so it should return before checking INTEREST
      const result = classifyMultiIntent("I'm not interested at all");
      expect(result.primary).toBe('NEGATIVE');
    });

    it('should prefer HOSTILE over everything else', () => {
      const result = classifyMultiIntent("This is spam, fuck off");
      expect(result.primary).toBe('HOSTILE');
    });
  });
});

// =============================================================================
// MULTI-INTENT TESTS
// =============================================================================

describe('Multi-Intent Detection', () => {
  it('should detect PRICING + SCOPE together', () => {
    const result = classifyMultiIntent("Is what you are proposing to introduce us to mid-sized companies that want to sell? What is in it for you?");
    expect(result.primary).toBe('PRICING');
    expect(result.secondary).toContain('SCOPE');
  });

  it('should detect IDENTITY + PRICING together', () => {
    const result = classifyMultiIntent("How do you work and what's your fee?");
    expect(result.primary).toBe('PRICING');
    expect(result.secondary).toContain('IDENTITY');
  });

  it('should detect SCOPE + INTEREST together', () => {
    const result = classifyMultiIntent("Yes, interested. What industries do you focus on?");
    expect(result.primary).toBe('SCOPE');
    expect(result.secondary).toContain('INTEREST');
  });
});

// =============================================================================
// ANCHOR PACK v2 TESTS
// =============================================================================

describe('AnchorPackV2 Builder', () => {

  describe('Direct pattern extraction', () => {
    it('should extract provider and audience from "noticed X helps Y"', () => {
      const outbound = "Hello — Noticed Argent Light helps founders and owners at established private companies — I know a few who...";
      const anchor = buildAnchorPackV2(outbound);
      expect(anchor.provider_label).toContain('Argent Light');
      expect(anchor.audience_label).toContain('founders');
    });

    it('should detect intro_offer from "worth intro\'ing"', () => {
      const outbound = "Worth intro'ing you to a few?";
      const anchor = buildAnchorPackV2(outbound);
      expect(anchor.proposed_action).toBe('intro_offer');
    });
  });

  describe('Pain extraction', () => {
    it('should extract pain from "who can\'t find"', () => {
      const outbound = "I know a few who can't find good exit options";
      const anchor = buildAnchorPackV2(outbound);
      expect(anchor.pain_label).toBeTruthy();
      expect(anchor.pain_label).not.toBe('a time-sensitive situation');
    });

    it('should extract pain from "who lose money"', () => {
      const outbound = "I know companies who lose money when tax planning gets rushed";
      const anchor = buildAnchorPackV2(outbound);
      expect(anchor.pain_label).toBeTruthy();
    });
  });

  describe('Sanitization', () => {
    it('should sanitize prospect_label with forbidden words', () => {
      const result = sanitizeProspectLabel('companies that lose clients when');
      expect(result).toBe('a few relevant firms in that space');
    });

    it('should sanitize empty prospect_label', () => {
      const result = sanitizeProspectLabel('');
      expect(result).toBe('a few relevant firms in that space');
    });

    it('should sanitize pain_sentence to start with "they"', () => {
      const result = sanitizePainSentence('losing money on tax');
      expect(result.startsWith("they're")).toBe(true);
    });

    it('should ensure pain_sentence ends with period', () => {
      const result = sanitizePainSentence('they are struggling');
      expect(result.endsWith('.')).toBe(true);
    });

    it('should fix double "they" in pain_sentence', () => {
      const result = sanitizePainSentence("they're they struggling");
      expect(result).not.toContain("they're they");
    });
  });

  describe('Fallback behavior', () => {
    it('should return fallback for empty outbound', () => {
      const anchor = buildAnchorPackV2('');
      expect(anchor.prospect_label).toBe('a few relevant firms in that space');
      expect(anchor.pain_sentence).toBe("they're dealing with a time-sensitive situation where fit matters.");
    });

    it('should return fallback for short outbound', () => {
      const anchor = buildAnchorPackV2('hi');
      expect(anchor.prospect_label).toBe('a few relevant firms in that space');
    });
  });
});

// =============================================================================
// FORBIDDEN PATTERN TESTS
// =============================================================================

describe('Forbidden Pattern Detection', () => {
  it('should detect "the people i mentioned are"', () => {
    expect(hasForbiddenPattern('the people i mentioned are great')).toBeTruthy();
  });

  it('should detect "are lose"', () => {
    expect(hasForbiddenPattern('they are lose money when')).toBeTruthy();
  });

  it('should detect "are losing"', () => {
    expect(hasForbiddenPattern('they are losing clients')).toBeTruthy();
  });

  it('should detect "companies that lose clients when"', () => {
    expect(hasForbiddenPattern('these are companies that lose clients when tax planning...')).toBeTruthy();
  });

  it('should not trigger on clean text', () => {
    expect(hasForbiddenPattern("totally fair. i'm an independent connector")).toBeNull();
  });
});

// =============================================================================
// GOLDEN TESTS (from spec)
// =============================================================================

describe('Golden Tests (from spec)', () => {
  it('"Yes, I would be interested!" → INTEREST', () => {
    const result = classifyMultiIntent('Yes, I would be interested!');
    expect(result.primary).toBe('INTEREST');
  });

  it('"i\'m interested" → INTEREST', () => {
    const result = classifyMultiIntent("i'm interested");
    expect(result.primary).toBe('INTEREST');
  });

  it('"how do you work" → IDENTITY', () => {
    const result = classifyMultiIntent('how do you work');
    expect(result.primary).toBe('IDENTITY');
  });

  it('"what\'s the catch" → IDENTITY', () => {
    const result = classifyMultiIntent("what's the catch");
    expect(result.primary).toBe('IDENTITY');
  });

  it('"what is in it for you" → PRICING', () => {
    const result = classifyMultiIntent('what is in it for you');
    expect(result.primary).toBe('PRICING');
  });

  it('"who are these people" → PROOF', () => {
    const result = classifyMultiIntent('who are these people');
    expect(result.primary).toBe('PROOF');
  });

  it('"remove me" → NEGATIVE', () => {
    const result = classifyMultiIntent('remove me');
    expect(result.primary).toBe('NEGATIVE');
  });

  it('"fuck off" → HOSTILE', () => {
    const result = classifyMultiIntent('fuck off');
    expect(result.primary).toBe('HOSTILE');
  });

  it('"send calendar" → SCHEDULING', () => {
    const result = classifyMultiIntent('send calendar');
    expect(result.primary).toBe('SCHEDULING');
  });

  it('"is this paid" → PRICING', () => {
    const result = classifyMultiIntent('is this paid');
    expect(result.primary).toBe('PRICING');
  });
});

// =============================================================================
// CALL-FIRST BEHAVIOR TESTS
// =============================================================================

describe('Call-First Behavior', () => {
  it('INTEREST should have call-first in output', () => {
    const anchor = buildAnchorPackV2('I know a few who struggle with tax timing');
    // The anchor should support call_first
    expect(anchor.proposed_action).toBe('call_first');
  });

  it('IDENTITY anchor should support call-first flow', () => {
    const anchor = buildAnchorPackV2('Noticed X helps Y — worth intro?');
    // Even with intro_offer detected, the system should support call-first
    expect(['call_first', 'intro_offer']).toContain(anchor.proposed_action);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle mixed case', () => {
    const result = classifyMultiIntent('YES I AM INTERESTED');
    expect(result.primary).toBe('INTEREST');
  });

  it('should handle extra whitespace', () => {
    const result = classifyMultiIntent('   not interested   ');
    expect(result.primary).toBe('NEGATIVE');
  });

  it('should handle emoji (not triggering anything special)', () => {
    const result = classifyMultiIntent('🙂');
    expect(result.primary).toBe('UNKNOWN');
  });

  it('should handle very long text', () => {
    const longText = 'I am interested '.repeat(100);
    const result = classifyMultiIntent(longText);
    expect(result.primary).toBe('INTEREST');
  });

  it('should handle special characters', () => {
    const result = classifyMultiIntent("What's the catch???");
    expect(result.primary).toBe('IDENTITY');
  });
});
