/**
 * ConnectorAssistant.tsx — AI Assistant for Connector OS
 *
 * Stripe-level implementation. SSM-gated.
 *
 * Features:
 * - Floating button (bottom-right)
 * - Slide-in drawer from right
 * - Chat UI with message history
 * - Enhanced system prompt with connector doctrine
 * - localStorage conversation memory
 * - Uses existing AI config from Settings
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  feedback?: 'up' | 'down';
  dbId?: string; // DB row id for feedback persistence
}

interface AssistantState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

// =============================================================================
// SYSTEM PROMPT — THE CONNECTOR DOCTRINE
// =============================================================================

const SYSTEM_PROMPT = `You are the Connector OS Assistant — a tactical guide for operators building connector businesses.

## MODE DETECTION

You operate in TWO modes. Detect automatically based on user question:

**STRATEGY MODE** — Questions about:
- Finding signals, niches, industries
- Demand/supply identification
- Deal structure, pricing, objections
- Outreach tactics, positioning
→ Use THE CONNECTOR FRAMEWORK below

**PLATFORM MODE** — Questions about:
- How to run evaluations, select markets
- Settings, API keys, enrichment, Instantly
- Station pipeline, compose, send, fulfillment
- Errors, troubleshooting, "how do I..."
→ Use PLATFORM DOCUMENTATION below

If unclear, ask: "Are you asking about strategy (finding signals) or the platform (how to use the tool)?"

---

# STRATEGY MODE

YOUR ROLE:
- Help members find signals, identify supply/demand gaps, and execute connector plays
- Teach them to THINK like operators (resourceful, first-principles)
- Give SPECIFIC, ACTIONABLE answers with examples
- Never give vague advice — always include WHERE to look and WHAT to search for

THE CONNECTOR FRAMEWORK:
1. Signal = Event that creates urgency (hiring, funding, expansion, M&A, regulatory change)
2. Demand = Companies with a need (e.g., startups hiring sales reps)
3. Supply = Providers who fulfill that need (e.g., sales staffing agencies)
4. Two-way outreach = Contact BOTH sides simultaneously
5. Whoever replies first = Pitch them access fee + % commission

RESPONSE STRUCTURE:

When asked "How do I find signals for [INDUSTRY]?":

1. **Demand Side** (who needs help):
   - Describe the type of company
   - Example: "Series A-B SaaS companies (10-50 employees)"

2. **Supply Side** (who provides solution):
   - Describe the provider type
   - Example: "Sales development agencies, fractional sales leaders"

3. **Signals** (what triggers urgency):
   - List 3-5 specific events
   - Example: "Funding round announced, VP Sales hired, new product launch"

4. **Where to Find** (specific sources):
   - Job boards: "LinkedIn Jobs → filter '[INDUSTRY] + [ROLE]'"
   - Funding: "Crunchbase → filter '[INDUSTRY] + Series A-B + last 30 days'"
   - News: "Google News → '[INDUSTRY] + expansion OR hiring'"
   - Social: "LinkedIn search → '[INDUSTRY] + [signal keyword]'"

5. **Validation Checklist**:
   - Signal is recent (< 30 days)
   - Multiple indicators (not just one)
   - Budget confirmed (funding round, revenue growth)
   - Decision maker identifiable (LinkedIn, Apollo)

6. **Next Step**: One clear action they should take right now

TONE:
- Direct and tactical (no fluff)
- Operator-to-operator (not teacher-to-student)
- Assume they're resourceful (don't baby them)
- If question is lazy ("How do I start?"), redirect: "Start by defining your niche. Which industry are you targeting?"

CONSTRAINTS:
- Always give SPECIFIC sources (not "research the industry")
- Always include search queries/filters when relevant
- Keep responses under 300 words unless they ask for more
- If you don't know, say "I don't have data on this specific industry, but here's how you'd research it: [method]"

WHAT NOT TO DO:
- Don't give generic advice ("Just do research")
- Don't ramble about theory
- Don't answer questions they should research themselves (teach them the method instead)
- Don't make up specific company data

EXAMPLES OF GOOD RESPONSES:

User: "How do I find signals for biotech?"

Good:
"**Demand**: Series A-C biotech companies (5-50M funding)
**Supply**: Scientific recruiters, biopharma staffing agencies

**Signals**:
- FDA approval announcements (scale-up hiring follows)
- Funding rounds (Series A-C = aggressive hiring)
- Clinical trial phase advancement

**Where to find**:
- Crunchbase: Filter 'Biotechnology' + 'Series A-C' + 'Funding last 60 days'
- LinkedIn Jobs: 'biotech + scientist + [city]'
- BioSpace.com: Job listings by company
- FDA.gov: Recent drug approvals

**Validation**: Check LinkedIn for VP Talent or Head of R&D postings (signal they're scaling)

**Next step**: Pull 10 companies from Crunchbase, validate signals, build list in Connector OS."

---

User: "They want to see supply first before paying. How do I handle?"

Good:
"Classic 'prove it first' objection. Three options:

**Option 1: Soft commit**
'I have 3 providers who match. Before I intro — if one fits, what's your typical engagement look like?'
→ Gets them to reveal buying intent without showing your hand.

**Option 2: Teaser**
Give provider NAME (not contact): 'One example: [Agency X] works with 5 companies like yours.'
If interested: 'My fee is [X] access + [Y%] on close.'

**Option 3: Flip it**
'I work on exclusivity. Access fee + % gets you 3 pre-vetted intros this week.'

**Don't**: Give contacts for free. You'll get cut out.

Which approach fits your situation?"

---

# PLATFORM MODE

## Overview
Connector OS is a market evaluation engine. No CSV uploads. Data comes from Pre-Built Markets (curated market packs) or Apify datasets (scraped data). The system evaluates demand-supply pairs using AI, scores them, and lets you compose + send intros.

**The Station Flow:** SELECT SOURCES → ANALYZE → RUN → RESULTS → COMPOSE → SEND

## Station (/station)

This is the main workspace. Everything starts here.

**Source Selection:**
- **Pre-Built Markets**: Curated demand + supply packs organized by industry/signal. Click to select.
- **Apify Datasets**: Paste an Apify dataset URL. System fetches and normalizes the data automatically.
- No CSV upload. All data comes from markets or Apify.

**Running an Evaluation:**
1. Select your sources (demand + supply)
2. Click **Analyze** → modal shows diagnostics (pair count, data quality)
3. Click **Run** → AI evaluation pipeline starts
4. Navigates to /station/runs → see all runs with live status
5. Run completes → click it → /station/run/:jobId
6. See scored matches with classification, reasoning, and framing

**Match Results:**
- Each match shows: demand company, supply company, relevance score, classification (PASS/MARGINAL/QUARANTINE), and reasoning
- Matches are scored by AI on multiple dimensions (alignment, timing, capability fit)
- Export matches with reasoning via Export button (CSV)

## Fulfillment Mode

When you activate a **client lens** on a run, the view changes based on the client's economic side.

**Client Fulfillment** (client is supply side, economicSide = 'supply'):
- View flips to a flat **contact list** (demand-only, deduped by company)
- Your client IS the supply — so you only see potential demand contacts
- Compose generates demand-only intros (client name never appears in AI output)
- Send targets demand contacts only

**Client Overlay** (client is demand side):
- Filters matches to show only those relevant to your client
- Standard pair view with supply contacts

**Setting up clients:**
- Add fulfillment clients in Station with name, profile, and economic side
- Each client gets an overlay that filters runs to show relevant matches

## Settings Sections

| Section | Path | What to configure |
|---------|------|-------------------|
| Routing | Settings → Routing | Instantly API key + campaign IDs (demand + supply) |
| Enrichment | Settings → Enrichment | Apollo API key, Anymail API key |
| Reasoning | Settings → Reasoning | AI provider (Azure/OpenAI/Anthropic) + API key |
| Profile | Settings → Profile | Operator name, calendar link, target industries, reply style, answer pack |
| Account | Settings → Account | Password, sign out |

## Enrichment

Enrichment finds decision-maker emails for matched companies. Triggered per-match from the run detail page.

**How it works:**
1. Click a match → click Enrich
2. Check cache first (if contact already known → green toast, no API charge)
3. Apollo lookup (primary)
4. Anymail fallback if Apollo misses

**Troubleshooting:**
- No enrich button → Configure Apollo or Anymail key in Settings → Enrichment
- "NO_CONTACT" → Company not in Apollo database, try different match
- Green "Already known" toast → Contact was cached from a previous enrichment (free)

## Instantly Setup

**Required in Settings → Routing:**
1. Instantly API Key (from Instantly dashboard)
2. Demand Campaign ID (UUID format)
3. Supply Campaign ID (UUID format)

**Campaign ID format:** Must be UUID like \`a1b2c3d4-e5f6-7890-abcd-ef1234567890\`

**Errors:**
- "Campaign ID format is invalid" → Copy full UUID from Instantly
- "Check your Instantly API key" → Regenerate in Instantly dashboard
- "existing" status → Normal, lead already in campaign

## Compose + Send

After enrichment, compose intros for your matches:
1. From run detail → click "Send Intros" (or "Compose" in fulfillment mode)
2. AI generates personalized intro drafts per match
3. Review each draft, edit if needed
4. Send → routes to Instantly campaigns

**Fulfillment compose:** Only generates demand-side intros. Client name never appears in output.

## Leaderboard (/station/leaderboard)

Ranks all operators by total intros sent. See your position, tier, and send velocity (7d/30d). Updated in real-time from send data.

## Msg Simulator (/msg-sim)

Reply generation tool. Paste an inbound reply, system classifies the stage (INTEREST, SCHEDULING, PRICING, etc.) and generates a suggested response.

**Setup:** Add your outbound message as context for better replies. Configure AI key in Settings → Reasoning.

## Quick Checklist (Before Running Station)

1. Go to /station → select market sources
2. Apollo key configured (Settings → Enrichment) — for contact lookup
3. Instantly key + campaign IDs (Settings → Routing) — for sending
4. AI configured (Settings → Reasoning) — for intro generation
5. Operator name set (Settings → Profile) — personalizes intros

## Platform Response Style

When answering platform questions:
- Give exact UI paths: "Settings → Enrichment → Apollo API key"
- Be specific about formats: "Campaign ID must be UUID format"
- Link cause to fix: "Error X means Y, fix by doing Z"
- Keep answers under 150 words — users want quick fixes
- NEVER mention CSV uploads, the Flow page, or "Load → Match → Enrich → Send" — those are deprecated`;

// =============================================================================
// STORAGE
// =============================================================================

const STORAGE_KEY = 'connector_assistant_history';
const MAX_MESSAGES = 50;

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // Storage full or unavailable
  }
}

// =============================================================================
// AI CALL
// =============================================================================

async function callAI(
  messages: Message[],
  aiConfig: { provider: string; apiKey: string; model?: string; azureEndpoint?: string; azureDeployment?: string }
): Promise<string> {
  const { provider, apiKey, model, azureEndpoint, azureDeployment } = aiConfig;

  // Build conversation history for context
  const conversationHistory = messages.slice(-10).map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Build request body
  const requestBody: Record<string, unknown> = {
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ],
    max_tokens: 2000,
    temperature: 0.7,
  };

  // Handle provider-specific fields (must match ai-proxy expected field names)
  if (provider === 'azure') {
    requestBody.azureEndpoint = azureEndpoint;
    requestBody.azureApiKey = apiKey;
    requestBody.azureDeployment = azureDeployment;
  } else if (provider === 'openai') {
    requestBody.openaiApiKey = apiKey;
    requestBody.model = model || 'gpt-4o-mini';
  } else if (provider === 'anthropic') {
    requestBody.anthropicApiKey = apiKey;
    requestBody.model = model || 'claude-haiku-4-5-20251001';
  }

  // Route through edge function to avoid CORS
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn('[ConnectorAssistant] AI error:', response.status, errorBody.slice(0, 200));
    throw new Error('provider_error');
  }

  const data = await response.json();
  return data.content || data.message || 'No response generated.';
}

// =============================================================================
// MARKDOWN COMPONENTS (styled for dark theme)
// =============================================================================

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-white/90 font-medium">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-white/60 italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-3 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-3 space-y-1 pl-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-white/60">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="font-mono text-[12px] font-medium text-white/70 uppercase tracking-wider mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-mono text-[11px] font-medium text-white/50 mb-2">{children}</h3>
  ),
  hr: () => <hr className="border-white/[0.04] my-4" />,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[11px] font-mono text-white/60">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-white/[0.02] border border-white/[0.06] rounded p-3 mb-3 overflow-x-auto font-mono text-[11px]">{children}</pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l border-white/[0.08] pl-3 my-3 text-white/40 italic">{children}</blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white/70 underline underline-offset-2">{children}</a>
  ),
};

// =============================================================================
// COMPONENTS
// =============================================================================

function ChatMessage({
  message,
  onFeedback,
}: {
  message: Message;
  onFeedback?: (id: string, feedback: 'up' | 'down') => void;
}) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[88%] rounded px-4 py-3 ${
          isUser
            ? 'bg-white/[0.06] border border-white/[0.08]'
            : 'bg-white/[0.02] border border-white/[0.06]'
        }`}
      >
        <div className={`font-mono text-[12px] leading-relaxed ${isUser ? 'text-white/80' : 'text-white/60'}`}>
          {isUser ? message.content : (
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Feedback buttons for assistant messages */}
        {!isUser && onFeedback && (
          <div className="flex items-center gap-1 mt-3 pt-2 border-t border-white/[0.04]">
            <span className="font-mono text-[9px] text-white/20 mr-2">Helpful?</span>
            <button
              onClick={() => onFeedback(message.id, 'up')}
              className={`p-1.5 rounded transition-all ${
                message.feedback === 'up'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'hover:bg-white/[0.04] text-white/20 hover:text-white/40'
              }`}
            >
              <ThumbsUp size={10} />
            </button>
            <button
              onClick={() => onFeedback(message.id, 'down')}
              className={`p-1.5 rounded transition-all ${
                message.feedback === 'down'
                  ? 'bg-white/[0.06] text-white/40'
                  : 'hover:bg-white/[0.04] text-white/20 hover:text-white/40'
              }`}
            >
              <ThumbsDown size={10} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ConnectorAssistant() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSSM, setIsSSM] = useState(false);
  const [isCheckingSSM, setIsCheckingSSM] = useState(true);
  const [state, setState] = useState<AssistantState>({
    messages: [],
    isLoading: false,
    error: null,
  });
  const [input, setInput] = useState('');
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  const [aiConfig, setAiConfig] = useState<{
    provider: string;
    apiKey: string;
    model?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessageRef = useRef<(() => void) | null>(null);

  // Check SSM access (bypass in dev mode for testing)
  useEffect(() => {
    async function checkSSM() {
      // DEV MODE: Skip SSM check for testing
      if (import.meta.env.DEV) {
        console.log('[ConnectorAssistant] Dev mode — SSM check bypassed');
        setIsSSM(true);
        setIsCheckingSSM(false);
        return;
      }

      if (!user?.email) {
        setIsSSM(false);
        setIsCheckingSSM(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('ssm_access')
          .select('status')
          .eq('email', user.email)
          .eq('status', 'approved')
          .maybeSingle();

        setIsSSM(!!data);
      } catch {
        setIsSSM(false);
      }
      setIsCheckingSSM(false);
    }

    checkSSM();
  }, [user?.email]);

  // Load AI config from settings (matches Settings.tsx storage)
  // Re-check when drawer opens in case user just saved settings
  // FORGIVING: Check all providers, use whichever has valid credentials
  useEffect(() => {
    async function loadConfig() {
      const aiSettings = localStorage.getItem('ai_settings');
      if (aiSettings) {
        try {
          const parsed = JSON.parse(aiSettings);
          console.log('[ConnectorAssistant] Loaded AI settings:', {
            provider: parsed.aiProvider,
            hasOpenAIKey: !!parsed.openaiApiKey,
            hasAzureKey: !!parsed.azureApiKey,
            hasClaudeKey: !!parsed.claudeApiKey
          });

          // Respect user's aiProvider preference first, fall back to auto-detect
          const preferred = parsed.aiProvider;

          // Try user's preferred provider first
          if (preferred === 'anthropic' && parsed.claudeApiKey) {
            setAiConfig({
              provider: 'anthropic',
              apiKey: parsed.claudeApiKey,
              model: (parsed.aiModel === 'claude-3-haiku-20240307' ? 'claude-haiku-4-5-20251001' : parsed.aiModel) || 'claude-haiku-4-5-20251001',
            });
            console.log('[ConnectorAssistant] Anthropic config loaded (preferred)');
            return;
          }
          if (preferred === 'azure' && parsed.azureEndpoint && parsed.azureApiKey) {
            setAiConfig({
              provider: 'azure',
              apiKey: parsed.azureApiKey,
              model: parsed.azureDeployment || 'gpt-4o-mini',
              azureEndpoint: parsed.azureEndpoint,
              azureDeployment: parsed.azureDeployment,
            });
            console.log('[ConnectorAssistant] Azure config loaded (preferred)');
            return;
          }
          if (preferred === 'openai' && parsed.openaiApiKey) {
            setAiConfig({
              provider: 'openai',
              apiKey: parsed.openaiApiKey,
              model: parsed.aiModel || 'gpt-4o-mini',
            });
            console.log('[ConnectorAssistant] OpenAI config loaded (preferred)');
            return;
          }

          // Fall back to auto-detect if preferred provider missing credentials
          if (parsed.azureEndpoint && parsed.azureApiKey) {
            setAiConfig({
              provider: 'azure',
              apiKey: parsed.azureApiKey,
              model: parsed.azureDeployment || 'gpt-4o-mini',
              azureEndpoint: parsed.azureEndpoint,
              azureDeployment: parsed.azureDeployment,
            });
            console.log('[ConnectorAssistant] Azure config loaded (fallback)');
            return;
          }
          if (parsed.openaiApiKey) {
            setAiConfig({
              provider: 'openai',
              apiKey: parsed.openaiApiKey,
              model: parsed.aiModel || 'gpt-4o-mini',
            });
            console.log('[ConnectorAssistant] OpenAI config loaded (fallback)');
            return;
          }
          if (parsed.claudeApiKey) {
            setAiConfig({
              provider: 'anthropic',
              apiKey: parsed.claudeApiKey,
              model: (parsed.aiModel === 'claude-3-haiku-20240307' ? 'claude-haiku-4-5-20251001' : parsed.aiModel) || 'claude-haiku-4-5-20251001',
            });
            console.log('[ConnectorAssistant] Anthropic config loaded (fallback)');
            return;
          }
        } catch (e) {
          console.error('[ConnectorAssistant] Error parsing ai_settings:', e);
        }
      }

      console.log('[ConnectorAssistant] No AI config found in localStorage');
    }

    loadConfig();
  }, [isOpen]);

  // Load messages from localStorage
  useEffect(() => {
    const messages = loadMessages();
    setState(prev => ({ ...prev, messages }));
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Listen for external open requests (e.g. from CSV mapper "?" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.question) {
        setInput(detail.question);
        setIsOpen(true);
        // Auto-send after drawer opens and input is set
        setPendingAutoSend(true);
      } else {
        setIsOpen(true);
      }
    };
    window.addEventListener('connector-assistant:open', handler);
    return () => window.removeEventListener('connector-assistant:open', handler);
  }, []);

  // Auto-send when opened with a pre-filled question
  useEffect(() => {
    if (pendingAutoSend && input.trim() && isOpen && aiConfig && !state.isLoading) {
      setPendingAutoSend(false);
      // Delay one tick so drawer is rendered
      setTimeout(() => sendMessageRef.current?.(), 150);
    }
  }, [pendingAutoSend, input, isOpen, aiConfig, state.isLoading]);

  // Send message
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || state.isLoading || !aiConfig) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const newMessages = [...state.messages, userMessage];
    setState(prev => ({
      ...prev,
      messages: newMessages,
      isLoading: true,
      error: null,
    }));
    setInput('');
    saveMessages(newMessages);

    const startTime = Date.now();

    try {
      const response = await callAI(newMessages, aiConfig);
      const latencyMs = Date.now() - startTime;

      // Generate a UUID for the DB row so feedback can link back
      const dbId = crypto.randomUUID();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        dbId,
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setState(prev => ({
        ...prev,
        messages: updatedMessages,
        isLoading: false,
      }));
      saveMessages(updatedMessages);

      // Fire-and-forget: log question + answer to DB (never blocks chat)
      if (user?.id) {
        supabase.from('assistant_questions').insert({
          id: dbId,
          user_id: user.id,
          user_email: user.email,
          question: trimmed,
          answer: response,
          latency_ms: latencyMs,
        }).then(({ error }) => {
          if (error) console.warn('[ConnectorAssistant] Log failed:', error.message);
        });
      }
    } catch {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Check your billing with your AI provider.',
      }));
    }
  }, [input, state.messages, state.isLoading, aiConfig, user]);

  // Keep ref in sync for auto-send
  sendMessageRef.current = sendMessage;

  // Handle feedback
  const handleFeedback = useCallback((id: string, feedback: 'up' | 'down') => {
    setState(prev => {
      const updated = prev.messages.map(m =>
        m.id === id ? { ...m, feedback } : m
      );
      // Save to localStorage so feedback persists across reloads
      saveMessages(updated);
      return { ...prev, messages: updated };
    });

    // Persist feedback to DB (fire-and-forget)
    if (user?.id) {
      const msg = state.messages.find(m => m.id === id);
      if (msg?.dbId) {
        supabase.from('assistant_questions')
          .update({ feedback })
          .eq('id', msg.dbId)
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.warn('[ConnectorAssistant] Feedback persist failed:', error.message);
          });
      }
    }
  }, [user, state.messages]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }));
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render if checking SSM or not SSM
  if (isCheckingSSM) return null;
  if (!isSSM) return null;

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-20 right-6 z-50"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <MessageCircle size={16} style={{ color: 'rgba(255,255,255,0.40)' }} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-[#09090b] border-l border-white/[0.06] flex flex-col"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-mono text-[13px] font-medium text-white/80">
                      Ask Connector
                    </h2>
                    <p className="font-mono text-[10px] text-white/25 mt-0.5">
                      Strategy · Platform · Tactics
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={clearConversation}
                      className="p-2 rounded text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-all"
                      title="Clear conversation"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {state.messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <MessageCircle size={20} style={{ color: 'rgba(255,255,255,0.15)' }} className="mb-4" />
                    <p className="font-mono text-[12px] text-white/40 mb-1">
                      What can I help you find?
                    </p>
                    <p className="font-mono text-[10px] text-white/20 max-w-[240px]">
                      Signals, niches, demand/supply gaps, deal structure, or platform help
                    </p>

                    {/* Quick prompts */}
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                      {['Biotech signals', 'Run a market', 'How to pitch'].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setInput(prompt === 'Run a market' ? 'How do I run a market evaluation in Station?' : `How do I find ${prompt.toLowerCase()}?`)}
                          className="font-mono px-3 py-1.5 rounded bg-white/[0.02] border border-white/[0.06] text-[10px] text-white/30 hover:bg-white/[0.04] hover:text-white/50 transition-all"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {state.messages.map(message => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onFeedback={message.role === 'assistant' ? handleFeedback : undefined}
                  />
                ))}

                {state.isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <motion.div
                          animate={{ opacity: [0.2, 0.6, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/40"
                        />
                        <motion.div
                          animate={{ opacity: [0.2, 0.6, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/40"
                        />
                        <motion.div
                          animate={{ opacity: [0.2, 0.6, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/40"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {state.error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center font-mono text-[11px] text-white/30 py-2"
                  >
                    {state.error} Try again.
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-4 border-t border-white/[0.04]">
                {!aiConfig ? (
                  <div className="text-center py-3">
                    <p className="font-mono text-[11px] text-white/25">
                      Configure AI in Settings → Reasoning
                    </p>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything..."
                      rows={1}
                      className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded font-mono px-3 py-2.5 text-[12px] text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/[0.12] transition-all"
                      style={{ minHeight: '40px', maxHeight: '120px' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || state.isLoading}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '2px',
                        background: !input.trim() || state.isLoading ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                        border: `1px solid ${!input.trim() || state.isLoading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: !input.trim() || state.isLoading ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Send size={13} style={{ color: !input.trim() || state.isLoading ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.50)' }} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default ConnectorAssistant;
