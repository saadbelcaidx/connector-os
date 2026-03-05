/**
 * Intro Builder — Type Definitions
 *
 * All types for the {{placeholder}} template engine.
 * PairContext bridges Station V5 data (CanonicalInfo + MatchResult + EnrichmentResult).
 */

export interface TemplateVariable {
  key: string;           // "dreamICP" from {{dreamICP}}
  label: string;         // "Dream ICP"
  fallback: string;      // "companies in your space"
  instruction: string;   // AI instruction (empty for built-in)
  side: 'demand' | 'supply' | 'both';
  builtIn?: boolean;     // true = deterministic, no AI needed
}

export interface IntroTemplate {
  id: string;
  name: string;
  description: string;
  supplyBody: string;    // "Hey {{supply.firstName}}…"
  demandBody: string;    // "Hey {{demand.firstName}}…"
  variables: TemplateVariable[];
  builtIn?: boolean;
  category?: string;     // "signal-first" | "warm-connect" | "direct-ask" | "problem-first"
  createdAt: string;
  updatedAt: string;
}

export interface PairContext {
  demand: {
    company: string; wants: string; offers: string; who: string;
    whyNow: string; industry: string | null; title: string | null;
    domain: string | null; keywords: string[];
    entityType: 'person' | 'organization';
    firstName?: string; lastName?: string; email?: string;
  };
  supply: {
    company: string; wants: string; offers: string; who: string;
    whyNow: string; industry: string | null; title: string | null;
    domain: string | null; keywords: string[];
    entityType: 'person' | 'organization';
    firstName: string; lastName: string; email: string | null;
    contactTitle?: string; city?: string; state?: string; linkedinUrl?: string | null;
  };
  match: {
    combined: number; fit: number; timing: number;
    classification: string; framing: string; reasoning: string;
  };
  situation: {
    momentum: string;
    bridge: string;
    opportunity: string;
    urgency: 'hot' | 'warm' | 'ambient';
    fitLevel: 'exact' | 'adjacent' | 'stretch';
  };
}

export interface GeneratedIntro {
  evalId: string;
  supplyIntro: string;
  demandIntro: string;
  variables: Record<string, string>;
  error?: string;
}

export interface ComposedDraft {
  evalId: string;
  supplyIntro: string;
  demandIntro: string;
}
