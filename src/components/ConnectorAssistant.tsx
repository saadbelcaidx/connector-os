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
  Sparkles,
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
- How to upload CSV, what columns
- Settings, API keys, integrations
- Flow steps (Load, Match, Enrich, Send)
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
Connector OS is a CSV-only matching platform. Upload two CSVs (Demand + Supply), system matches them, enriches contacts, generates intros, sends to campaigns.

**The 4-Step Flow:** LOAD → MATCH → ENRICH → SEND

## CSV Upload

**Path:** Settings → Data → Upload CSV

**Required columns:** Company Name, Signal
**Optional:** Full Name, Email, Domain, Context, Title

**If user has Email in CSV:** System skips enrichment (saves API credits)

**Validation:**
- File must be .csv (not .xlsx)
- Max 10MB
- Download template from Settings if unsure

**Common errors:**
- "Add a demand CSV" → Upload in Settings → Data
- "CSV has errors" → Download errors.csv, fix, re-upload

## Settings Sections

| Section | What to configure |
|---------|-------------------|
| Data | CSV uploads (demand + supply) |
| Sending | Apollo key, Anymail key, Instantly key + campaign IDs |
| Personalization | OpenAI/Azure/Anthropic API key |
| Profile | Sender name, calendar link |

## Enrichment

**How it works:**
1. CSV has email → use it (no API call)
2. Check cache (90-day TTL)
3. Apollo lookup
4. Anymail fallback if Apollo misses

**Troubleshooting:**
- "NO_CONTACT" everywhere → Check Apollo API key in Settings → Sending
- Slow enrichment → Rate limited, system auto-retries

## Instantly Setup

**Required in Settings → Sending:**
1. Instantly API Key (from Instantly dashboard)
2. Demand Campaign ID (UUID format)
3. Supply Campaign ID (UUID format)

**Campaign ID format:** Must be UUID like \`a1b2c3d4-e5f6-7890-abcd-ef1234567890\`

**Errors:**
- "Campaign ID format is invalid" → Copy full UUID from Instantly
- "Check your Instantly API key" → Regenerate in Instantly dashboard
- "existing" status → Normal, lead already in campaign

## Flow Steps

**Step 1 - LOAD (Blue):** Reads CSVs, validates, dedupes
**Step 2 - MATCH (Purple):** Matches demand signals to supply capabilities
**Step 3 - ENRICH (Cyan):** Finds decision-maker emails via Apollo/Anymail
**Step 4 - SEND (Emerald):** Generates intros, routes to Instantly campaigns

**"Safe to leave" message:** You can navigate away, progress is saved.

## Quick Checklist (Before Running Flow)

1. Demand CSV uploaded (Settings → Data)
2. Supply CSV uploaded (Settings → Data)
3. Apollo API key (Settings → Sending)
4. Instantly API key (Settings → Sending)
5. Campaign IDs for both demand and supply
6. AI configured (Settings → Personalization) — optional

## Platform Response Style

When answering platform questions:
- Give exact UI paths: "Settings → Sending → Apollo API key"
- Be specific about formats: "Campaign ID must be UUID format"
- Link cause to fix: "Error X means Y, fix by doing Z"
- Keep answers under 150 words — users want quick fixes`;

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
    requestBody.model = model || 'claude-3-haiku-20240307';
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
    const error = await response.text();
    throw new Error(error || 'AI request failed');
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
    <strong className="text-white font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-white/80 italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-3 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-3 space-y-1 pl-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-white/80">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-[15px] font-semibold text-white mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-[14px] font-semibold text-white mb-2">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-[13px] font-semibold text-white mb-2">{children}</h3>
  ),
  hr: () => <hr className="border-white/[0.08] my-4" />,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-white/[0.08] px-1.5 py-0.5 rounded text-[12px] text-violet-300">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 mb-3 overflow-x-auto text-[12px]">{children}</pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-violet-500/40 pl-3 my-3 text-white/70 italic">{children}</blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">{children}</a>
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
        className={`max-w-[88%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_4px_12px_rgba(139,92,246,0.2)]'
            : 'bg-white/[0.04] border border-white/[0.08] text-white/90'
        }`}
      >
        <div className={`text-[13px] leading-relaxed ${isUser ? 'text-white' : 'text-white/80'}`}>
          {isUser ? message.content : (
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Feedback buttons for assistant messages */}
        {!isUser && onFeedback && (
          <div className="flex items-center gap-1 mt-3 pt-2 border-t border-white/[0.06]">
            <span className="text-[10px] text-white/25 mr-2">Helpful?</span>
            <button
              onClick={() => onFeedback(message.id, 'up')}
              className={`p-1.5 rounded-lg transition-all ${
                message.feedback === 'up'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'hover:bg-white/[0.06] text-white/25 hover:text-white/50'
              }`}
            >
              <ThumbsUp size={11} />
            </button>
            <button
              onClick={() => onFeedback(message.id, 'down')}
              className={`p-1.5 rounded-lg transition-all ${
                message.feedback === 'down'
                  ? 'bg-red-500/20 text-red-400'
                  : 'hover:bg-white/[0.06] text-white/25 hover:text-white/50'
              }`}
            >
              <ThumbsDown size={11} />
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
  const [aiConfig, setAiConfig] = useState<{
    provider: string;
    apiKey: string;
    model?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
              model: parsed.aiModel || 'claude-3-haiku-20240307',
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
              model: parsed.aiModel || 'claude-3-haiku-20240307',
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

    try {
      const response = await callAI(newMessages, aiConfig);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setState(prev => ({
        ...prev,
        messages: updatedMessages,
        isLoading: false,
      }));
      saveMessages(updatedMessages);
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to get response',
      }));
    }
  }, [input, state.messages, state.isLoading, aiConfig]);

  // Handle feedback
  const handleFeedback = useCallback((id: string, feedback: 'up' | 'down') => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === id ? { ...m, feedback } : m
      ),
    }));
  }, []);

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
      {/* Floating Button — Premium glow effect */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 group"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {/* Button */}
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-white to-white/90 text-black flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_40px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 transition-all duration-300">
              <Sparkles size={20} className="text-violet-600" />
            </div>
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
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col"
            >
              {/* Header — Premium gradient */}
              <div className="relative px-5 py-4 border-b border-white/[0.06]">
                {/* Subtle gradient glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.03] via-transparent to-fuchsia-500/[0.03]" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Gradient icon */}
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
                      <Sparkles size={16} className="text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-[14px] font-medium text-white/90 tracking-[-0.01em]">
                        Ask Connector
                      </h2>
                      <p className="text-[11px] text-white/40">
                        Strategy · Platform · Tactics
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={clearConversation}
                      className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                      title="Clear conversation"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {state.messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    {/* Gradient icon */}
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/10 flex items-center justify-center mb-5">
                      <MessageCircle size={24} className="text-violet-400/60" />
                    </div>
                    <p className="text-[14px] text-white/60 mb-2 font-medium">
                      What can I help you find?
                    </p>
                    <p className="text-[12px] text-white/30 max-w-[240px]">
                      Ask about signals, niches, demand/supply gaps, or how to structure deals
                    </p>

                    {/* Quick prompts */}
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                      {['Biotech signals', 'Upload CSV', 'How to pitch'].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setInput(prompt === 'Upload CSV' ? 'How do I upload a CSV?' : `How do I find ${prompt.toLowerCase()}?`)}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-all"
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
                    <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl px-5 py-4">
                      {/* Typing indicator — bouncing dots */}
                      <div className="flex items-center gap-1.5">
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                          className="w-2 h-2 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400"
                        />
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                          className="w-2 h-2 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400"
                        />
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                          className="w-2 h-2 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {state.error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-[12px] text-red-400/80 py-2"
                  >
                    {state.error}
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input — Premium styling */}
              <div className="relative px-4 py-4 border-t border-white/[0.06]">
                {/* Subtle top gradient */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

                {!aiConfig ? (
                  <div className="text-center py-3">
                    <p className="text-[12px] text-white/40">
                      Configure AI in Settings to use the assistant
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
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-[13px] text-white/90 placeholder:text-white/30 resize-none focus:outline-none focus:border-violet-500/30 focus:bg-white/[0.06] transition-all"
                      style={{ minHeight: '44px', maxHeight: '120px' }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={sendMessage}
                      disabled={!input.trim() || state.isLoading}
                      className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.4)] transition-shadow"
                    >
                      <Send size={16} />
                    </motion.button>
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
