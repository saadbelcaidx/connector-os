import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Reply Brain Edge Function - v19
 *
 * Stage classification via pattern matching (Layer 0)
 * Updated NEGATIVE pattern to catch skepticism/dismissive messages
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// =============================================================================
// TYPES
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

interface RequestBody {
  outbound: string;
  inbound: string;
  aiConfig?: {
    provider: string;
    openaiApiKey?: string;
    azureEndpoint?: string;
    azureApiKey?: string;
    azureDeployment?: string;
    anthropicApiKey?: string;
    model?: string;
  };
  operatorContext?: {
    targetIndustries?: string[];
    targetGeo?: string;
    calendarLink?: string;
    operatorName?: string;
  };
}

// =============================================================================
// STAGE PATTERNS (Layer 0 - Pattern Matching)
// =============================================================================

const STAGE_PATTERNS: Record<Stage, RegExp> = {
  BOUNCE: /undeliverable|address not found|mailbox not found|user unknown|does not exist|permanently rejected|550 |delivery.*(failed|error)/i,
  OOO: /out of (the )?office|on (vacation|holiday|leave|pto)|away (from|until)|auto.?reply|automatic reply|currently unavailable|limited access to email|i('m| am) (away|out)|back (on|in|after)/i,
  // v19: Added skepticism patterns (Tee A. bug fix)
  NEGATIVE: /\b(not interested|no thanks|no thank you|pass|remove me|take me off|unsubscribe|stop (emailing|contacting)|don't contact|not for me|i'm good|no need|please stop|opt.?out|not at this time|not ok with|not okay with|i'm not ok|not for us|we're not|we are not|not looking|not a fit|all set|didn't ask|did not ask|don't have time|waste.*(my |of )?time|people like you|heard.*(all )?(the )?pitch(es)?|nothing new|heard it (all )?before|same old|been down this road)\b|^stop\.?\s*$/i,
  HOSTILE: /\b(fuck|shit|spam|scam|bullshit|stop spamming|reported|blocking|harassment|predatory|disgusting)\b/i,
  SCHEDULING: /\b(send.*(calendar|times|link|availability)|when (can we|are you|works)|let's (book|schedule|set up|talk)|set up.*(call|time)|grab time|book.*(call|time)|what times|free (to|for)|available|my calendar|schedule a)\b/i,
  PRICING: /^\s*(price|pricing|cost|fee|fees|charge|charges|paid|pay|payment|commission|comp)\s*\??\s*$|what('s| is) in it for you|how do you (get paid|make money)|how are you paid|is this (paid|free)|how (much|do you charge)|what('s| is) the (cost|fee|price)|pricing|rate|pay you|your fee|commission|charge for|rev\s?share|revenue\s?share|access\s?fee|retainer|success\s?fee|what do you take|what's your cut|do you charge|how are you compensated|your cut|your take/i,
  PROOF: /\b(who are (these|the|they)|which companies|name (them|some)|give me (names|examples)|specific (companies|names|clients)|can you share|prove it|where from|where did you|who exactly|examples of)\b/i,
  IDENTITY: /\b(what'?s the catch|who are you|what company are you with|are you an agency|are you affiliated|why are you reaching out|how do you work|how does this work|how exactly does this work|what'?s (your |the )?process|what'?s the model|walk me through|explain how|how do you operate|what do you do|what is this|what are you offering|is there a cost)\b/i,
  SCOPE: /\b(is what you('re| are) proposing|so you mean|are you saying|to confirm|just to clarify|you're introducing|introduce us to|what exactly are you offering|what's the offer|what industr|which industr|deal size|timeline|requirements|criteria|what type|what kind|typical|focus on|specialize|mid-?sized|companies that want to sell|what size|what stage|what geography)/i,
  INTEREST: /\b(interested|i'm interested|i am interested|i would be interested|sure|yes|yeah|yep|sounds good|happy to|open to|that works|works for me|i'm in|count me in|absolutely|definitely|perfect|alright|go ahead|intro me|connect me|make the intro|let's do it|let's|sounds interesting|tell me more|i'd like to learn|curious)\b/i,
  CONFUSION: /\b(i don't understand|not sure what|not sure i understand|confused|what do you mean|can you explain|remind me|what was this about|is this about|thought you meant|i don't follow|lost me|not following|unclear|maybe)\b/i,
  UNKNOWN: /.*/,
};

// =============================================================================
// NEGATION DETECTION
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

// =============================================================================
// PRICING HELPER
// =============================================================================

function isPricing(text: string): boolean {
  const tersePattern = /^\s*(price|pricing|cost|fee|fees|charge|charges|paid|pay|payment|commission|comp)\s*\??\s*$/i;
  const embeddedPattern = /what('s| is) in it for you|how do you (get paid|make money)|how are you paid|is this (paid|free)|how (much|do you charge)|what('s| is) the (cost|fee|price)|\bpricing\b|\brate\b|pay you|your fee|\bcommission\b|charge for|rev\s?share|revenue\s?share|access\s?fee|retainer|success\s?fee|what do you take|what's your cut|do you charge|how are you compensated|your cut|your take/i;
  return tersePattern.test(text) || embeddedPattern.test(text);
}

// =============================================================================
// CONTRADICTION GUARD
// =============================================================================

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

// =============================================================================
// COMPOUND QUESTIONS
// =============================================================================

const COMPOUND_QUESTIONS: Array<{ pattern: RegExp; primary: Stage; secondary: Stage }> = [
  { pattern: /^what('s| is) in it for you\??$/i, primary: 'PRICING', secondary: 'IDENTITY' },
  { pattern: /^what are you proposing\??$/i, primary: 'SCOPE', secondary: 'IDENTITY' },
];

// =============================================================================
// MULTI-INTENT CLASSIFIER (Layer 0)
// =============================================================================

function classifyMultiIntent(inbound: string): MultiIntent {
  const text = inbound.toLowerCase().trim();
  const signals: string[] = [];
  const intents: Stage[] = [];
  let negationDetected = false;

  // Hard stops first (in order of precedence)
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

  // CONTRADICTION GUARD - but not if it's confusion
  if (!isConfusion && hasContradiction(text, 12)) {
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
    const isNegatedOk = /not\s+ok|not\s+okay|i'm\s+not\s+ok|not\s+sure(?!\s+(what|i\s+understand))/i.test(text);
    if (isNegatedOk) {
      return { primary: 'NEGATIVE', secondary: [], signals: ['negated_ok'], negationDetected: true };
    }
  }

  // COMPOUND QUESTION ROUTING
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

  // Check remaining patterns
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

  // PRICING FAILSAFE
  if (intents.length === 0) {
    if (isPricing(text)) {
      return { primary: 'PRICING', secondary: [], signals: ['pricing_failsafe'], negationDetected };
    }
    return { primary: 'UNKNOWN', secondary: [], signals: ['no_match'], negationDetected };
  }

  // Sort by precedence
  const precedence: Stage[] = ['SCHEDULING', 'PRICING', 'PROOF', 'IDENTITY', 'SCOPE', 'INTEREST', 'CONFUSION'];
  intents.sort((a, b) => precedence.indexOf(a) - precedence.indexOf(b));

  const result = {
    primary: intents[0],
    secondary: intents.slice(1),
    signals,
    negationDetected,
  };

  // PRICING FAILSAFE OVERRIDE
  if (isPricing(text) && !['SCHEDULING', 'PRICING'].includes(result.primary)) {
    result.secondary = result.primary !== 'UNKNOWN' ? [result.primary, ...result.secondary] : result.secondary;
    result.primary = 'PRICING';
    result.signals.push('pricing_override');
  }

  return result;
}

// =============================================================================
// STAGE INTERPRETATIONS (2nd grade reading level)
// =============================================================================

const STAGE_INTERPRETATIONS: Record<Stage, string> = {
  BOUNCE: 'Email bounced.',
  OOO: 'They are away.',
  NEGATIVE: 'They said no.',
  HOSTILE: 'They are upset.',
  SCHEDULING: 'They want to talk.',
  PRICING: 'They asked about price.',
  PROOF: 'They want proof.',
  IDENTITY: 'They asked who you are.',
  SCOPE: 'They asked what you cover.',
  INTEREST: 'They are interested.',
  CONFUSION: 'They are confused.',
  UNKNOWN: 'Unclear intent.',
};

const STAGE_NEXT_MOVES: Record<Stage, string> = {
  BOUNCE: 'Find new email.',
  OOO: 'Wait for return.',
  NEGATIVE: 'Move on. Next.',
  HOSTILE: 'Walk away clean.',
  SCHEDULING: 'Lock the call.',
  PRICING: 'Get them on a call first.',
  PROOF: 'Build trust on a call.',
  IDENTITY: 'Let them ask more.',
  SCOPE: 'Confirm fit on a call.',
  INTEREST: 'Send calendar link.',
  CONFUSION: 'Clarify in next reply.',
  UNKNOWN: 'Probe gently.',
};

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { outbound, inbound, aiConfig, operatorContext } = body;

    if (!inbound) {
      return new Response(
        JSON.stringify({ error: 'inbound is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[reply-brain] Classifying inbound:', inbound.substring(0, 100));

    // Layer 0: Pattern matching (deterministic)
    const classification = classifyMultiIntent(inbound);

    console.log('[reply-brain] Classification:', classification.primary, classification.signals);

    // For NEGATIVE/HOSTILE/BOUNCE/OOO, no reply needed - just return classification
    if (['NEGATIVE', 'HOSTILE', 'BOUNCE', 'OOO'].includes(classification.primary)) {
      return new Response(
        JSON.stringify({
          stage: classification.primary,
          interpretation: STAGE_INTERPRETATIONS[classification.primary],
          nextMove: STAGE_NEXT_MOVES[classification.primary],
          reply: null, // No reply for these stages
          signals: classification.signals,
          negationDetected: classification.negationDetected,
          telemetry: {
            compositeScore: 10,
            usedSelfCorrection: false,
            selfCorrectionRounds: 0,
            leverageScore: 10,
            deleteProbability: 1,
            contextScore: 10,
            momentumScore: 10,
            latencyMs: 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For other stages, we need AI to generate a reply
    // For now, return classification with placeholder
    // The full 7-layer system would be invoked here

    return new Response(
      JSON.stringify({
        stage: classification.primary,
        secondary: classification.secondary,
        interpretation: STAGE_INTERPRETATIONS[classification.primary],
        nextMove: STAGE_NEXT_MOVES[classification.primary],
        reply: null, // AI reply would go here
        signals: classification.signals,
        negationDetected: classification.negationDetected,
        needsAI: true, // Indicate that AI is needed for reply generation
        telemetry: {
          compositeScore: 0,
          usedSelfCorrection: false,
          selfCorrectionRounds: 0,
          leverageScore: 0,
          deleteProbability: 0,
          contextScore: 0,
          momentumScore: 0,
          latencyMs: 0,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[reply-brain] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
