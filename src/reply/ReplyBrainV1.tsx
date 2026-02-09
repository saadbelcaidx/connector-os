import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, Loader2, AlertCircle, Plus, Trash2, MessageSquare, Mail,
  Bug, X, ChevronDown, Send, Calendar, Zap, Sparkles, ChevronRight,
  Brain, Target, Activity, Clock, Shield, TrendingUp, BarChart3, Lock, ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackConversion, hashContent } from '../services/ConversionTracker';
import { useAuth } from '../AuthContext';
import { captureReplyBrainBreadcrumb, safeHash } from '../sentry';
import Dock from '../Dock';

// =============================================================================
// TYPES
// =============================================================================

type FailureReason = 'wrong_answer' | 'sounds_off' | 'missing_info' | 'other';

const FAILURE_REASONS: { value: FailureReason; label: string; description: string }[] = [
  { value: 'wrong_answer', label: 'Wrong answer', description: 'The reply doesn\'t match what they asked' },
  { value: 'sounds_off', label: 'Sounds off', description: 'Tone is weird or unnatural' },
  { value: 'missing_info', label: 'Missing info', description: 'Should have said something that\'s missing' },
  { value: 'other', label: 'Other', description: 'Something else is wrong' },
];

// Stage colors for badges
const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  INTEREST: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  SCHEDULING: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  PRICING: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  IDENTITY: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  SCOPE: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  PROOF: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  CONFUSION: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  NEGATIVE: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  HOSTILE: { bg: 'bg-red-600/10', text: 'text-red-500', border: 'border-red-600/20' },
  OOO: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
  BOUNCE: { bg: 'bg-gray-600/10', text: 'text-gray-500', border: 'border-gray-600/20' },
  UNKNOWN: { bg: 'bg-white/5', text: 'text-white/50', border: 'border-white/10' },
};

type ReplyType = 'demand' | 'supply' | 'not_sure';

interface ThreadMessage {
  role: 'me' | 'them';
  content: string;
}

interface ReplyAnalysis {
  meaning: string;
  response: string;
  next_move: string;
  stage?: string;
  signals?: string[];
  negationDetected?: boolean;
  telemetry?: {
    version?: string;
    stagePrimary?: string;
    stageSecondary?: string[];
    aiGenerated?: boolean;
    latencyMs?: number;
  };
}

interface AIConfig {
  provider: string;
  apiKey: string;
  model?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
}

interface ReplyConfig {
  senderName: string;
  nextStepCta: string;
  calendarLink?: string;
  replyStyle?: 'sms_2line' | 'email_short';
}

interface TargetingConfig {
  industries: string[];
  personas: string[];
  geo: string;
}

// v21: AnswerPack config for IDENTITY/SCOPE/PRICING composition
interface AnswerPackConfig {
  primaryIndustries: string[];
  companySize: string;
  compShape: 'success_only' | 'retainer_plus_success' | 'custom';
  identityLine: string;
}

// =============================================================================
// API
// =============================================================================

async function analyzeReply(
  latestReply: string,
  replyType: ReplyType,
  thread: ThreadMessage[],
  userId?: string,
  aiConfig?: AIConfig,
  replyConfig?: ReplyConfig,
  targeting?: TargetingConfig,
  answerPack?: AnswerPackConfig
): Promise<{ success: true; data: ReplyAnalysis } | { success: false; error: string; raw?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('reply-brain', {
      body: {
        inbound: latestReply,
        outbound: thread.find(m => m.role === 'me')?.content || '',
        side: replyType,
        thread: thread,
        userId: userId,
        aiConfig: aiConfig,
        replyConfig: replyConfig,
        targeting: targeting,
        answerPack: answerPack,
      },
    });

    if (error) {
      console.error('[ReplyBrain] Edge function error:', error);
      const ctx = (error as any).context;
      if (ctx) {
        try {
          const body = await ctx.json();
          if (body?.error) return { success: false, error: body.error };
        } catch { /* ignore */ }
      }
      return { success: false, error: error.message || 'Failed to analyze reply' };
    }

    if (data?.error) return { success: false, error: data.error, raw: data.raw };
    if (!data?.meaning || !data?.response || !data?.next_move) {
      return { success: false, error: 'Invalid response format', raw: JSON.stringify(data) };
    }

    return { success: true, data: data as ReplyAnalysis };
  } catch (error) {
    console.error('[ReplyBrain] Error:', error);
    return { success: false, error: 'Failed to analyze reply. Check your connection.' };
  }
}

const DEFAULT_NEXT_STEP_CTA = "What does your week look like? I'd love to set up a time to talk for a quick 10-15. Let me know";

// =============================================================================
// COMPONENTS
// =============================================================================

function StageBadge({ stage, secondary }: { stage: string; secondary?: string[] }) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.UNKNOWN;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text} border ${colors.border}`}>
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
        {stage}
      </span>
      {secondary && secondary.length > 0 && (
        <span className="text-[10px] text-white/30">
          + {secondary.join(', ')}
        </span>
      )}
    </div>
  );
}

function TelemetryPanel({ telemetry, signals }: { telemetry?: ReplyAnalysis['telemetry']; signals?: string[] }) {
  if (!telemetry) return null;

  return (
    <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* AI Generated Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            telemetry.aiGenerated
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-amber-500/10 border border-amber-500/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              telemetry.aiGenerated ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <span className={`text-[11px] font-medium ${
              telemetry.aiGenerated ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {telemetry.aiGenerated ? 'AI reply generated' : 'Fallback reply'}
            </span>
          </div>

          {/* Version */}
          <span className="text-[10px] text-white/30 font-mono">{telemetry.version || 'v21'}</span>

          {/* Latency */}
          {telemetry.latencyMs !== undefined && (
            <span className="text-[10px] text-white/30 font-mono">{telemetry.latencyMs}ms</span>
          )}
        </div>
      </div>

      {/* Signals (classification telemetry) */}
      {signals && signals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="text-[10px] text-white/30 mb-2">Classification signals</div>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((signal, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/[0.04] text-[10px] text-white/50 font-mono">
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  title,
  icon: Icon,
  content,
  isLoading,
  placeholder,
  showCopy,
  onCopy,
  copied,
  variant = 'default',
  children,
}: {
  title: string;
  icon: React.ElementType;
  content?: string;
  isLoading: boolean;
  placeholder: string;
  showCopy?: boolean;
  onCopy?: (text: string) => void;
  copied?: boolean;
  variant?: 'default' | 'primary' | 'action';
  children?: React.ReactNode;
}) {
  const variants = {
    default: {
      iconBg: 'bg-white/[0.04]',
      iconColor: 'text-white/40',
    },
    primary: {
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
    action: {
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
    },
  };

  const style = variants[variant];

  return (
    <div className="group relative rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] p-5 transition-all duration-300 hover:border-white/[0.10] hover:bg-white/[0.02]">
      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center`}>
              <Icon size={14} className={style.iconColor} />
            </div>
            <h3 className="text-[13px] font-semibold text-white/80">{title}</h3>
          </div>

          {showCopy && content && (
            <button
              onClick={() => onCopy?.(content)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                copied
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        <div className={`text-[14px] leading-relaxed ${content ? 'text-white/80' : 'text-white/25 italic'}`}>
          {isLoading ? (
            <div className="flex items-center gap-2.5 text-white/40">
              <div className="relative">
                <Loader2 size={14} className="animate-spin" />
                <div className="absolute inset-0 animate-ping">
                  <Loader2 size={14} className="text-white/20" />
                </div>
              </div>
              <span className="text-[13px]">Analyzing...</span>
            </div>
          ) : content ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            placeholder
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ReplyBrainV1() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Thread builder state
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [latestReply, setLatestReply] = useState('');
  const [replyType, setReplyType] = useState<ReplyType>('not_sure');

  // Quick add state
  const [quickAddRole, setQuickAddRole] = useState<'me' | 'them'>('me');
  const [quickAddContent, setQuickAddContent] = useState('');

  // Results state
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReplyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Debug state
  const [lastRequest, setLastRequest] = useState<{
    outbound: string;
    inbound: string;
    thread: ThreadMessage[];
    replyType: ReplyType;
  } | null>(null);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<FailureReason>('wrong_answer');
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // State tracking
  const [currentInboundHash, setCurrentInboundHash] = useState<string | null>(null);

  // Settings
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig | undefined>();
  const [replyConfig, setReplyConfig] = useState<ReplyConfig>({
    senderName: 'Operator',
    nextStepCta: DEFAULT_NEXT_STEP_CTA,
    replyStyle: 'sms_2line',
  });
  const [targeting, setTargeting] = useState<TargetingConfig>({
    industries: [],
    personas: [],
    geo: '',
  });
  // v21: AnswerPack for IDENTITY/SCOPE/PRICING composition
  const [answerPack, setAnswerPack] = useState<AnswerPackConfig>({
    primaryIndustries: [],
    companySize: '',
    compShape: 'success_only',
    identityLine: '',
  });

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      // Try localStorage first (for guest users)
      const guestSettings = localStorage.getItem('guest_settings');
      if (guestSettings) {
        try {
          const parsed = JSON.parse(guestSettings);
          // Settings.tsx saves as { settings, profile, filters } - extract settings object
          const s = parsed.settings || parsed;

          // Build AI config
          if (s.aiProvider && s.aiProvider !== 'none') {
            const config: AIConfig = { provider: s.aiProvider, apiKey: '' };
            if (s.aiProvider === 'openai' && s.openaiApiKey) {
              config.apiKey = s.openaiApiKey;
              config.model = s.aiModel || 'gpt-4o-mini';
            } else if (s.aiProvider === 'anthropic' && s.anthropicApiKey) {
              config.apiKey = s.anthropicApiKey;
              config.model = s.aiModel || 'claude-3-haiku-20240307';
            } else if (s.aiProvider === 'azure' && s.azureApiKey) {
              config.apiKey = s.azureApiKey;
              config.azureEndpoint = s.azureEndpoint;
              config.azureDeployment = s.azureDeployment || 'gpt-4o';
            }
            if (config.apiKey) setAiConfig(config);
          }

          // Build reply config
          const safeSenderName = s.senderName || 'Operator';
          if (safeSenderName || s.nextStepCta) {
            setReplyConfig({
              senderName: safeSenderName,
              nextStepCta: s.nextStepCta || DEFAULT_NEXT_STEP_CTA,
              calendarLink: s.calendarLink || '',
              replyStyle: s.replyStyle || 'sms_2line',
            });
          }

          // Load targeting
          if (s.targetIndustries || s.targetPersonas || s.targetGeo) {
            setTargeting({
              industries: s.targetIndustries || [],
              personas: s.targetPersonas || [],
              geo: s.targetGeo || '',
            });
          }

          // v21: Load answerPack
          if (s.answerPrimaryIndustries || s.answerCompanySize || s.answerCompShape || s.answerIdentityLine) {
            setAnswerPack({
              primaryIndustries: s.answerPrimaryIndustries || [],
              companySize: s.answerCompanySize || '',
              compShape: s.answerCompShape || 'success_only',
              identityLine: s.answerIdentityLine || '',
            });
          }
        } catch (e) {
          console.error('[MsgSim] Failed to parse guest settings:', e);
        }
      }

      // If auth user, load from DB
      if (user?.id) {
        console.log('[MsgSim] Loading settings from DB for user:', user.id);
        try {
          const { data, error } = await supabase
            .from('operator_settings')
            .select('ai_provider, ai_openai_api_key, ai_azure_api_key, ai_azure_endpoint, ai_azure_deployment, ai_anthropic_api_key, sender_name, next_step_cta, calendar_link, reply_style, target_industries, target_personas, target_geo, answer_primary_industries, answer_company_size, answer_comp_shape, answer_identity_line')
            .eq('user_id', user.id)
            .single();

          console.log('[MsgSim] DB query result:', { data, error, sender_name: data?.sender_name });

          if (data) {
            // DB is primary source for AI config (Settings.tsx now persists here)
            // Fallback: localStorage.ai_settings for users who saved before DB persistence was added
            let aiProvider = data.ai_provider;
            let aiOpenaiKey = data.ai_openai_api_key;
            let aiAnthropicKey = data.ai_anthropic_api_key;
            let aiAzureKey = data.ai_azure_api_key;
            let aiAzureEndpoint = data.ai_azure_endpoint;
            let aiAzureDeployment = data.ai_azure_deployment;
            let savedModel = data.ai_model;

            if (!aiProvider) {
              try {
                const aiSettings = localStorage.getItem('ai_settings');
                if (aiSettings) {
                  const parsed = JSON.parse(aiSettings);
                  aiProvider = parsed.aiProvider;
                  aiOpenaiKey = aiOpenaiKey || parsed.openaiApiKey;
                  aiAnthropicKey = aiAnthropicKey || parsed.claudeApiKey;
                  aiAzureKey = aiAzureKey || parsed.azureApiKey;
                  aiAzureEndpoint = aiAzureEndpoint || parsed.azureEndpoint;
                  aiAzureDeployment = aiAzureDeployment || parsed.azureDeployment;
                  savedModel = savedModel || parsed.aiModel;
                }
              } catch {}
            }

            if (aiProvider && aiProvider !== 'none') {
              const config: AIConfig = { provider: aiProvider, apiKey: '' };
              if (aiProvider === 'openai' && aiOpenaiKey) {
                config.apiKey = aiOpenaiKey;
                config.model = savedModel || 'gpt-4o-mini';
              } else if (aiProvider === 'anthropic' && aiAnthropicKey) {
                config.apiKey = aiAnthropicKey;
                config.model = savedModel || 'claude-3-haiku-20240307';
              } else if (aiProvider === 'azure' && aiAzureKey) {
                config.apiKey = aiAzureKey;
                config.azureEndpoint = aiAzureEndpoint;
                config.azureDeployment = aiAzureDeployment || 'gpt-4o';
              }
              if (config.apiKey) setAiConfig(config);
            }

            const dbSenderName = data.sender_name || 'Operator';
            console.log('[MsgSim] Setting senderName from DB:', { raw: data.sender_name, resolved: dbSenderName });
            if (dbSenderName || data.next_step_cta) {
              setReplyConfig({
                senderName: dbSenderName,
                nextStepCta: data.next_step_cta || DEFAULT_NEXT_STEP_CTA,
                calendarLink: data.calendar_link || '',
                replyStyle: (data.reply_style as 'sms_2line' | 'email_short') || 'sms_2line',
              });
            }

            if (data.target_industries || data.target_personas || data.target_geo) {
              setTargeting({
                industries: data.target_industries || [],
                personas: data.target_personas || [],
                geo: data.target_geo || '',
              });
            }

            // v21: Load answerPack from DB
            if (data.answer_primary_industries || data.answer_company_size || data.answer_comp_shape || data.answer_identity_line) {
              setAnswerPack({
                primaryIndustries: data.answer_primary_industries || [],
                companySize: data.answer_company_size || '',
                compShape: (data.answer_comp_shape as 'success_only' | 'retainer_plus_success' | 'custom') || 'success_only',
                identityLine: data.answer_identity_line || '',
              });
            }
          }
        } catch (e) {
          console.error('[MsgSim] Failed to load settings from DB:', e);
        }
      }
      setSettingsLoaded(true);
    };

    loadSettings();
  }, [user?.id]);

  // Thread management
  const addToThread = () => {
    if (!quickAddContent.trim()) return;
    setThread([...thread, { role: quickAddRole, content: quickAddContent.trim() }]);
    setQuickAddContent('');
  };

  const removeFromThread = (index: number) => {
    setThread(thread.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!latestReply.trim()) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    const outbound = thread.find(m => m.role === 'me')?.content || '';
    setLastRequest({ outbound, inbound: latestReply.trim(), thread: [...thread], replyType });

    console.log('[MsgSim] Sending request with senderName:', replyConfig.senderName);

    const { data, error: invokeError } = await supabase.functions.invoke('reply-brain', {
      body: {
        inbound: latestReply.trim(),
        outbound: outbound,
        side: replyType,
        thread: thread,
        userId: user?.id,
        aiConfig: aiConfig,
        replyConfig: replyConfig,
        targeting: targeting,
        answerPack: answerPack,
      },
    });

    if (invokeError) {
      setError(invokeError.message || 'Failed to analyze reply');
      setIsLoading(false);
      return;
    }

    if (data?.meaning && data?.response && data?.next_move) {
      setResult(data as ReplyAnalysis);
      const inboundHash = hashContent(latestReply.trim());
      setCurrentInboundHash(inboundHash);

      captureReplyBrainBreadcrumb({
        stagePrimary: data.telemetry?.stagePrimary || 'UNKNOWN',
        stageSecondary: data.telemetry?.stageSecondary,
        runtimeMode: user?.id ? 'auth' : 'guest',
        version: data.telemetry?.version || 'v21',
        inputHash: safeHash(latestReply.trim()),
        replyHash: safeHash(data.response || ''),
        aiGenerated: data.telemetry?.aiGenerated,
      });
    } else {
      setError('Invalid response format');
    }

    setIsLoading(false);
  };

  const handleReportBadOutput = () => {
    if (!lastRequest || !result) return;
    setReportReason('wrong_answer');
    setReportNotes('');
    setReportSuccess(false);
    setShowReportModal(true);
  };

  const submitFailureReport = async () => {
    if (!lastRequest || !result) return;
    setIsSubmittingReport(true);

    try {
      const { error } = await supabase.functions.invoke('report-failure', {
        body: {
          requestId: crypto.randomUUID(),
          userId: user?.id,
          reason: reportReason,
          notes: reportNotes || undefined,
          stageActual: result.telemetry?.stagePrimary,
          replyActual: result.response,
          inboundText: lastRequest.inbound,
          outboundText: lastRequest.outbound,
        },
      });

      if (error) {
        setError('Failed to submit report. Please try again.');
      } else {
        setReportSuccess(true);
        setTimeout(() => {
          setShowReportModal(false);
          setReportSuccess(false);
        }, 1500);
      }
    } catch {
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);

    if (field === 'response' && user?.id && currentInboundHash) {
      trackConversion('reply_copied', user.id, {
        stage: result?.telemetry?.stagePrimary,
        version: result?.telemetry?.version,
        inbound_hash: currentInboundHash,
        reply_hash: result?.response ? hashContent(result.response) : undefined,
      });
    }
  };

  const clearAll = () => {
    setThread([]);
    setLatestReply('');
    setResult(null);
    setError(null);
    setCurrentInboundHash(null);
  };

  const typeOptions: { value: ReplyType; label: string; desc: string }[] = [
    { value: 'demand', label: 'Demand', desc: 'Company with a need' },
    { value: 'supply', label: 'Supply', desc: 'Service provider' },
    { value: 'not_sure', label: 'Auto', desc: 'Let system decide' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Premium Header */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/launcher')}
                className="p-2 -ml-2 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <ArrowLeft size={18} className="text-white/40" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
                  <Mail size={18} className="text-violet-400" />
                </div>
                <div>
                  <h1 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em]">Msg Simulator</h1>
                  <p className="text-[11px] text-white/40">Reply generation</p>
                </div>
              </div>
            </div>

            {/* Mode indicator */}
            <div className="flex items-center gap-3">
              {(() => {
                const hasOutbound = thread.some(m => m.role === 'me');
                const mode = hasOutbound ? 'full' : 'limited';
                return (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                    mode === 'full'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${mode === 'full' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {mode === 'full' ? 'Full context' : 'Limited context'}
                  </div>
                );
              })()}

              <div className="h-4 w-px bg-white/[0.08]" />

              <span className="text-[10px] text-white/30 font-mono">v21</span>
            </div>
          </div>
        </div>
      </div>

      {/* Setup Hint - Subtle, not scary (only show after settings loaded) */}
      {settingsLoaded && (replyConfig.senderName === 'Operator' || !targeting.industries?.length || !replyConfig.calendarLink) && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 text-[12px] text-white/40">
              {/* Mode context - read from existing state */}
              {!thread.some(m => m.role === 'me') && (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400/80 border border-amber-500/20">Limited context</span>
              )}
              <span className="text-white/30">·</span>
              <span>Missing:</span>
              {replyConfig.senderName === 'Operator' && (
                <span className="px-2 py-0.5 rounded bg-white/[0.04] text-white/50">name</span>
              )}
              {!targeting.industries?.length && (
                <span className="px-2 py-0.5 rounded bg-white/[0.04] text-white/50">industries</span>
              )}
              {!replyConfig.calendarLink && (
                <span className="px-2 py-0.5 rounded bg-white/[0.04] text-white/50">calendar</span>
              )}
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="ml-auto text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              Settings →
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 pb-32">
          <div className="grid lg:grid-cols-2 gap-8">

            {/* Left: Input Panel */}
            <div className="space-y-6">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-white/30" />
                  <span className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Conversation</span>
                </div>
                {thread.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

            {/* Reply Type Selector */}
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setReplyType(option.value)}
                  className={`relative p-3 rounded-xl border text-left transition-all duration-200 ${
                    replyType === option.value
                      ? 'bg-white/[0.06] border-white/[0.12]'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.08]'
                  }`}
                >
                  {replyType === option.value && (
                    <div className="absolute top-2 right-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                  )}
                  <div className={`text-[13px] font-medium ${replyType === option.value ? 'text-white/90' : 'text-white/60'}`}>
                    {option.label}
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5">{option.desc}</div>
                </button>
              ))}
            </div>

            {/* Thread History */}
            {thread.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {thread.map((msg, index) => (
                  <div
                    key={index}
                    className={`group flex items-start gap-3 p-3 rounded-xl transition-all ${
                      msg.role === 'me'
                        ? 'bg-blue-500/[0.06] border border-blue-500/10'
                        : 'bg-white/[0.02] border border-white/[0.04]'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      msg.role === 'me'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-white/[0.08] text-white/50'
                    }`}>
                      {msg.role === 'me' ? 'ME' : 'TH'}
                    </div>
                    <p className="flex-1 text-[12px] text-white/70 leading-relaxed line-clamp-2">
                      {msg.content}
                    </p>
                    <button
                      onClick={() => removeFromThread(index)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Add */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <Plus size={12} className="text-white/30" />
                <span className="text-[11px] font-medium text-white/40">Add context</span>
                {/* Context hint - read from existing state */}
                {!thread.some(m => m.role === 'me') ? (
                  <span className="text-[9px] text-amber-400/60 ml-auto">Add your outbound for personalized replies</span>
                ) : (
                  <span className="text-[9px] text-white/20 ml-auto">Optional</span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
                  <button
                    onClick={() => setQuickAddRole('me')}
                    className={`px-3 py-2 text-[10px] font-semibold transition-all ${
                      quickAddRole === 'me'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-white/[0.02] text-white/40 hover:text-white/60'
                    }`}
                  >
                    Me
                  </button>
                  <button
                    onClick={() => setQuickAddRole('them')}
                    className={`px-3 py-2 text-[10px] font-semibold transition-all ${
                      quickAddRole === 'them'
                        ? 'bg-white/[0.08] text-white/80'
                        : 'bg-white/[0.02] text-white/40 hover:text-white/60'
                    }`}
                  >
                    Them
                  </button>
                </div>
                <input
                  type="text"
                  value={quickAddContent}
                  onChange={(e) => setQuickAddContent(e.target.value)}
                  placeholder="Prior message..."
                  className="flex-1 bg-white/[0.02] text-white/90 text-[12px] px-3 py-2 rounded-lg border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition-colors placeholder:text-white/20"
                  onKeyDown={(e) => e.key === 'Enter' && addToThread()}
                />
                <button
                  onClick={addToThread}
                  disabled={!quickAddContent.trim()}
                  className={`p-2 rounded-lg transition-all ${
                    quickAddContent.trim()
                      ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.10]'
                      : 'bg-white/[0.02] text-white/20 cursor-not-allowed'
                  }`}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Latest Reply Input */}
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={12} className="text-amber-400" />
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Their reply</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 ml-1">Required</span>
              </div>
              <textarea
                value={latestReply}
                onChange={(e) => setLatestReply(e.target.value)}
                placeholder={thread.some(m => m.role === 'me')
                  ? "Paste their latest message here..."
                  : "Paste their reply. Add your outbound above for personalized responses."
                }
                className="w-full h-32 bg-white/[0.02] text-white/90 text-[13px] leading-relaxed px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/[0.10] focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/5 transition-all resize-none placeholder:text-white/20"
              />
              <div className="absolute bottom-3 right-3 text-[10px] text-white/20">
                {latestReply.length} chars
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!latestReply.trim() || isLoading}
              className={`w-full py-4 rounded-xl text-[14px] font-semibold transition-all duration-300 flex items-center justify-center gap-2.5 ${
                !latestReply.trim() || isLoading
                  ? 'bg-white/[0.03] text-white/25 cursor-not-allowed'
                  : 'bg-gradient-to-r from-white to-white/90 text-[#0A0A0A] hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Reply
                </>
              )}
            </button>
          </div>

          {/* Right: Output Panel */}
          <div className="space-y-5">
            {/* Stage Badge (classification telemetry) */}
            {result?.stage && (
              <div className="flex items-center gap-3">
                <StageBadge
                  stage={result.stage}
                  secondary={result.telemetry?.stageSecondary}
                />
              </div>
            )}

            {/* Telemetry Panel - truthful UI */}
            {result && (
              <TelemetryPanel telemetry={result.telemetry} signals={result.signals} />
            )}

            {/* Interpretation */}
            <ResultCard
              title="What They Mean"
              icon={Brain}
              content={result?.meaning}
              isLoading={isLoading}
              placeholder="Plain English translation"
              variant="default"
            />

            {/* Suggested Reply */}
            <ResultCard
              title="Suggested Reply"
              icon={MessageSquare}
              content={result?.response}
              isLoading={isLoading}
              placeholder="Your reply will appear here"
              showCopy
              onCopy={(text) => handleCopy(text, 'response')}
              copied={copiedField === 'response'}
              variant="primary"
            >
              {/* Annotations - truthful notes only */}
              {result && !result.telemetry?.aiGenerated && (
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-[11px] text-amber-400/60">
                    Fallback reply — configure AI in Settings for generated responses.
                  </p>
                </div>
              )}
            </ResultCard>

            {/* Next Move */}
            <ResultCard
              title="Your Move"
              icon={TrendingUp}
              content={result?.next_move}
              isLoading={isLoading}
              placeholder="The play from here"
              variant="action"
            />

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-400/80">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dock />
    </div>
  );
}
