/**
 * DOCTRINE: See PIPELINE_CONTRACT.md
 *
 * - Gate: entity needs domain OR companyName
 * - Modes: MATCHING_ONLY (has domain) or ACTION (needs enrichment)
 * - Single source of truth: PipelineRunSnapshot
 * - No garbage polishing: skip bad data, don't fake it
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrendingUp, Loader2, Radio, Settings as SettingsIcon, RefreshCw, Briefcase, Clock, CheckCircle, Minus, ArrowRight, ArrowUpRight, AlertCircle, Info, Sparkles, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';
import { PredictionService, SignalTrend } from './PredictionService';
import { JobTrendChart } from './JobTrendChart';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';
import AppHeader from './AppHeader';
import {
  loadSignalsConfig,
  fetchJobSignals,
  fetchFundingSignals,
  fetchLayoffSignals,
  fetchHiringVelocitySignals,
  fetchToolAdoptionSignals,
  JobSignalInsight,
  normalizeToItems,
  extractJobLikeFields,
  safeLower,
  safeText,
  FETCH_LIMITS,
} from './services/SignalsClient';
import { generateJobInsights, JobInsights } from './services/JobInsightsEngine';
import { rewriteIntro, isAIConfigured, rewriteInsight, cleanApiResponse, generateWhyNow, generateWhyYou, generateDemandIntro, generateSupplyIntro, getDisabledProvider, detectDatasetNiche, detectNicheHeuristic, DetectedNiche, generateMatchNarration, stackSignals, scoreDeal, MatchNarration, StackedSignal, DealScore, aiMatchSuppliers, generateIntrosAntifragile, detectMatchContext, generateDemandIntroAntifragile, generateSupplyIntroAntifragile, generateAggregatedSupplyIntro, humanGreeting } from './services/AIService';
import { AIHealthBanner } from './components/AIHealthBanner';
import { createRichFundingSignal, createRichJobsSignal, createRichLayoffsSignal, RichSignal } from './services/SignalFormatters';
import {
  buildCleanJobsSummary,
  buildCleanFundingSummary,
  buildCleanLayoffsSummary,
  buildCleanHiringSummary,
  buildCleanTechSummary
} from './services/CleanViewHelpers';
import { detectWhoHasPressure, detectTargetTitles } from './services/WhoClassificationService';
import { enrichPerson, PersonData, EnrichmentConfig, calculateEnrichmentStatus, isEnrichmentStale, isContactEnrichmentConfigured, isCompanyIntelConfigured, calculateOutboundReadiness, roleCategoryFromJobTitle } from './services/PersonEnrichmentService';
import { findWorkOwnerByDomain, WorkOwnerSettings, WorkOwnerHireCategory } from './services/ApolloWorkOwnerService';
import { getContextualPressureProfile } from './services/PersonPressureService';
import { PersonContactCard } from './PersonContactCard';
import { createInstantlyLead, sendToInstantly, DualSendParams } from './services/InstantlyService';
import { fetchSupplySignals, findScoredMatches, SupplyCompany, getSupplyEnrichmentTitles, DemandContext, ScoredSupplyMatch } from './services/SupplySignalsClient';
import { HireCategory, extractHireCategory } from './services/CompanyRoleClassifier';
import { findSupplyContact, SupplyContact } from './services/ApolloSupplyEnrichmentService';
import { findEmailWithFallback, mapHireCategoryToAnymail } from './services/AnymailFinderService';
import { cleanCompanyName } from './services/IntroBuilder';
import { humanizeRoleType, getRolePlural } from './services/PressureWiringService';
import { detectHiringPressure, PressureDetectionResult } from './pressure/PressureDetector';
import { rankSupplyProviders } from './services/SupplyQualityRanker';
import {
  TrustedSupplyPools,
  updatePoolForRole,
  getPoolEntry,
  createEmptyPools,
  getNextRotatedProvider,
  markProviderUsed
} from './services/TrustedSupplyPools';
import {
  TrustedDemandPools,
  addDemandToPool,
  createEmptyDemandPools,
  markDemandUsed,
  getNextRotatedDemand,
  getDomainsForRole
} from './services/TrustedDemandPools';
import {
  BatchSendExecutor,
  createDemandBatchItem,
  createSupplyBatchItem,
  estimateBatchDuration,
  groupSupplyByEmail,
  detectCommonCategory,
  shouldUseAggregatedIntro,
  SupplyMatchGroup
} from './services/BatchSendService';
import {
  PreEnrichedContactsPools,
  PreEnrichedContact,
  createEmptyPreEnrichedPools,
  createPreEnrichedContact,
  addToPreEnrichedPool,
  bulkAddToPreEnrichedPool,
  getReadyContacts,
  getReadyCount,
  getUniqueSendCount,
  getTotalReadyCount,
  markContactConsumed
} from './services/PreEnrichedContactsPool';
import {
  aiQueue,
  QueueStatus,
  getQueueStatusMessage,
  getQueueTooltip
} from './services/AIRequestQueue';
import {
  startBackgroundEnrichment,
  onPressureDetected,
  isWorkerRunning,
  getWorkerProgress,
  startBackgroundSupplyEnrichment,
  isSupplyWorkerRunning,
  getSupplyWorkerProgress,
  SupplyEnrichmentProgress
} from './services/BackgroundEnrichmentWorker';
import type { ConnectorProfile } from './types';
import { scoreSignalQuality, SignalQualityScore, CompanySignalData, SignalItem } from './services/SignalQualityScorer';
import { enrichDomain, CompanyEnrichment, getPrimaryPain } from './services/CompanyEnrichmentService';
import { quickCleanIntel, deepCleanIntel, getCleanedIntel } from './services/IntelCleanerService';
// PHASE 4 COMPLETE: matchingResolvers no longer needed - using getDemandState/getSupplyContactState
import { getCachedContact, saveToCache, updateVerificationStatus, isVerificationStale } from './services/EnrichedContactsCache';
// Pipeline Integration (Stage 5: pipeline is the system)
import {
  runShadowPipeline,
  type PipelineIntegrationConfig,
} from './pipeline/integration';
import {
  snapshotToUIState,
} from './pipeline/uiAdapter';
import {
  getCurrentSnapshot,
  type PipelineRunSnapshot,
} from './pipeline/snapshot';

const WINDOW_STATUS_LABELS = {
  EARLY: 'Early',
  BUILDING: 'Building',
  WATCH: 'Watch',
  OPEN: 'Open'
};

// NICHE-AGNOSTIC: No hardcoded "hiring" language
const WINDOW_STATUS_DESCRIPTIONS = {
  EARLY: 'Early signal across multiple companies — exploratory outreach viable',
  BUILDING: 'Pressure forming across several firms — test outreach',
  WATCH: 'Clear activity — good timing',
  OPEN: 'Strong multi-company window — act fast'
};

// Signal quality tier explanations
const TIER_EXPLANATIONS: Record<'A' | 'B' | 'C', { label: string; description: string }> = {
  A: { label: 'Strong', description: 'Multiple indicators, timing is now' },
  B: { label: 'Good', description: 'Solid indicators, momentum forming' },
  C: { label: 'Medium', description: 'Early signs, worth exploring' },
};

/**
 * RUNTIME SAFEGUARD: Truncate verbose niche labels to MAX 5 words
 * Prevents AI from returning essay-length demandType/supplyType
 */
function truncateNicheLabel(label: string | undefined, maxWords: number = 5): string {
  if (!label) return '';
  const words = label.split(/\s+/);
  if (words.length <= maxWords) return label;
  return words.slice(0, maxWords).join(' ');
}

/**
 * Get SHORT niche display string (max 10 words total)
 * Uses oneLiner if available, otherwise truncates demandType → supplyType
 */
function getNicheDisplayLabel(niche: DetectedNiche | null, fallback: string = ''): string {
  if (!niche) return fallback;
  // Prefer oneLiner if available and short
  if (niche.oneLiner && niche.oneLiner.split(/\s+/).length <= 10) {
    return niche.oneLiner;
  }
  // Otherwise truncate and format
  const demand = truncateNicheLabel(niche.demandType, 4);
  const supply = truncateNicheLabel(niche.supplyType, 4);
  return `${demand} → ${supply}`;
}

/**
 * Convert hire category to readable text for narration
 */
function readableCategory(cat: HireCategory | undefined): string {
  switch (cat) {
    case 'engineering': return 'Software Engineering';
    case 'sales': return 'Sales';
    case 'marketing': return 'Marketing';
    case 'operations': return 'Operations';
    case 'finance': return 'Finance';
    default: return 'talent';
  }
}

interface ProviderInputs {
  servicesDelivered: string[];
  idealClient: string;
  averageDealSize: number;
  geographyServed: string;
  capacity: number;
  nicheExpertise: string[];
  apiKey: string;
}

interface SignalData {
  value: string;
  isLive: boolean;
  lastUpdated?: string;
  metadata?: JobSignalInsight;
  rawPayload?: any;
}

interface SignalsState {
  jobs: SignalData;
  funding: SignalData;
  layoffs: SignalData;
  hiringVelocity: SignalData;
  toolAdoption: SignalData;
  loading: boolean;
  error: string | null;
  lastSyncTime?: string;
}

interface NormalizedSignal {
  company: string;
  person: string;
  pressure: string;
  oneSentence: string;
  oneAction: string;
}

function normalizeSignal(signalData: SignalData, signalType: string): NormalizedSignal {
  return {
    company: '',
    person: '',
    pressure: signalType,
    oneSentence: signalData.value || '',
    oneAction: ''
  };
}

interface SignalHistory {
  signalStrength: number;
  timestamp: string;
}

interface MatchingResult {
  id: string;
  companyName: string;
  domain: string;
  signalSummary: string;
  isCuratedList?: boolean;  // true = contacts dataset (no signals), false = jobs dataset (has signals)
  windowStatus: string;
  dealValueEstimate: number;
  probabilityOfClose: number;
  exactAngle: string;
  whoHasPressure: string;
  whoHasPressureRoles: string[];  // WHO we contact (person titles)
  targetTitles: string[];
  jobTitlesBeingHired: string[];  // WHAT is being hired (job titles from signal)
  pressureProfile: string;
  whoCanSolve: string;
  suggestedTimeline: string;
  jobCount?: number;
  signalStrength: number;
  operatorFitScore: number;  // Demand→Operator fit (0-100): how well this demand matches operator's profile
  matchReasons: string[];
  companySize: number;
  signalType: string;
  // Signal quality scoring
  qualityScore: SignalQualityScore;
}

const serviceOptions = [
  'SaaS Implementation',
  'Sales Ops',
  'RevOps',
  'Cybersecurity',
  'Cloud Migration',
  'AI/ML Integration',
  'DevOps',
  'Data Engineering',
];

const nicheOptions = [
  'FinTech',
  'HealthTech',
  'Climate Tech',
  'B2B SaaS',
  'Enterprise',
  'SMB',
  'E-commerce',
  'MarTech',
];

function parseCompanySizeRange(range: string): [number, number] | null {
  switch (range) {
    case '1-50':
      return [1, 50];
    case '50-200':
      return [50, 200];
    case '200-1000':
      return [200, 1000];
    case '1000+':
      return [1000, Number.MAX_SAFE_INTEGER];
    default:
      return null;
  }
}

function isCompanySizeInRange(actualSize: number | null | undefined, idealRange: string): boolean {
  if (!actualSize) return false;
  const parsed = parseCompanySizeRange(idealRange);
  if (!parsed) return false;
  const [min, max] = parsed;
  return actualSize >= min && actualSize <= max;
}

// safeLower and safeText are imported from SignalsClient

function normalize(str: unknown): string {
  return safeLower(str).trim();
}

function mapSignalTypeToPainPoints(signalType?: string | null): string[] {
  const mapping: Record<string, string[]> = {
    jobs: [
      'hiring bottlenecks',
      'team velocity',
      'ops scaling',
      'delivery pressure'
    ],
    funding: [
      'ops scaling',
      'team velocity',
      'board pressure'
    ],
    layoffs: [
      'cost pressure',
      'ops scaling',
      'efficiency'
    ],
    tech: [
      'tech migration',
      'system integration',
      'ops scaling'
    ]
  };

  return mapping[signalType || ''] || [];
}

function estimateDealValue(companySize: number, operatorFitScore: number, signalStrength: number) {
  let base = 5000;

  if (companySize < 50) base = 5000;
  else if (companySize < 200) base = 15000;
  else if (companySize < 1000) base = 50000;
  else base = 100000;

  const multiplier = Math.max(0.3, (operatorFitScore + signalStrength) / 200);

  return Math.round(base * multiplier);
}

function calculateProbability(operatorFitScore: number, signalStrength: number, windowStatus: string) {
  let base = (operatorFitScore + signalStrength) / 2;

  const windowBoost = {
    EARLY: 0.6,
    BUILDING: 0.75,
    WATCH: 0.85,
    OPEN: 1
  }[windowStatus] || 0.5;

  return Math.round(base * windowBoost);
}

function getConnectorAngle(buyerTitle: string) {
  return `${buyerTitle}s usually deal with this before anyone else.`;
}

type MatchScoreBreakdown = {
  rolePoints: number;
  industryPoints: number;
  sizePoints: number;
  painPoints: number;
  geographyBonus: number;
};

function calculateMatchScoreForCompany(
  signal: {
    whoRoles: string[];
    industry?: string | null;
    companySize?: number | null;
    pressureType?: string | null;
    geography?: string | null;
  },
  profile: ConnectorProfile | null | undefined
): { score: number; reasons: string[]; breakdown: MatchScoreBreakdown } {
  const breakdown: MatchScoreBreakdown = {
    rolePoints: 0,
    industryPoints: 0,
    sizePoints: 0,
    painPoints: 0,
    geographyBonus: 0,
  };

  if (!profile) return { score: 0, reasons: [], breakdown };

  let score = 0;
  const reasons: string[] = [];

  const rolesLower = signal.whoRoles.map(normalize);
  const solvesRolesLower = (profile.solves_for_roles || []).map(normalize);
  const hasRoleMatch = rolesLower.some((r) => solvesRolesLower.includes(r));
  if (hasRoleMatch) {
    breakdown.rolePoints = 40;
    score += 40;
    reasons.push('You already help people in these roles.');
  }

  const industriesLower = (profile.industries_served || []).map(normalize);
  if (signal.industry && industriesLower.includes(normalize(signal.industry))) {
    breakdown.industryPoints = 20;
    score += 20;
    reasons.push('You work in this industry already.');
  }

  if (isCompanySizeInRange(signal.companySize ?? null, profile.ideal_company_size)) {
    breakdown.sizePoints = 20;
    score += 20;
    reasons.push('Company size fits your ideal range.');
  }

  const signalPainPoints = mapSignalTypeToPainPoints(signal.pressureType);

  const painMatch =
    Array.isArray(signalPainPoints) &&
    Array.isArray(profile.pain_points_solved) &&
    signalPainPoints.some(signalPain =>
      profile.pain_points_solved.some(profilePain =>
        safeLower(profilePain).includes(safeLower(signalPain))
      )
    );

  if (painMatch) {
    breakdown.painPoints = 20;
    score += 20;
    reasons.push('This pressure looks like problems you already solve.');
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('[MatchScore:pain]', {
      company: signal,
      signalType: signal.pressureType,
      signalPainPoints,
      profilePainPoints: profile.pain_points_solved,
      painMatch
    });
  }

  const geoLower = (profile.geography || []).map(normalize);
  if (signal.geography && geoLower.includes(normalize(signal.geography))) {
    breakdown.geographyBonus = 5;
    score += 5;
    reasons.push('Geography matches where you operate.');
  }

  return { score: Math.min(score, 100), reasons, breakdown };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SignalBlock({
  icon: Icon,
  label,
  value,
  isLive,
  loading,
  subtitle
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  isLive: boolean;
  loading?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-2xl mb-2 relative transition-all duration-200"
      style={{
        background: 'rgba(14, 165, 233, 0.04)',
        border: '1px solid rgba(14, 165, 233, 0.15)',
      }}
    >
      <div
        className="p-1.5 rounded"
        style={{
          background: 'rgba(14, 165, 233, 0.12)',
        }}
      >
        {loading ? (
          <Loader2 size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} className="animate-spin" />
        ) : (
          <Icon size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide">{label}</div>
          {isLive ? (
            <div className="flex items-center gap-1">
              <Radio size={8} style={{ color: '#26F7C7' }} />
              <span className="text-[9px] text-[#26F7C7] uppercase tracking-wider font-semibold">Live</span>
            </div>
          ) : (
            <span className="text-[9px] text-white text-opacity-30 uppercase tracking-wider">Mock</span>
          )}
        </div>
        <div className="text-[13px] text-white text-opacity-85">{value}</div>
        {subtitle && (
          <div className="text-[11px] text-white text-opacity-50 mt-1">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function RichSignalBlock({
  icon: Icon,
  label,
  richSignal,
  isLive,
  loading
}: {
  icon: typeof TrendingUp;
  label: string;
  richSignal: RichSignal | null;
  isLive: boolean;
  loading?: boolean;
}) {
  if (!richSignal || richSignal.examples.length === 0) {
    return null;
  }

  return (
    <div
      className="p-4 rounded-2xl mb-3 transition-all duration-200"
      style={{
        background: 'rgba(14, 165, 233, 0.04)',
        border: '1px solid rgba(14, 165, 233, 0.15)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded"
            style={{
              background: 'rgba(14, 165, 233, 0.12)',
            }}
          >
            {loading ? (
              <Loader2 size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} className="animate-spin" />
            ) : (
              <Icon size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} />
            )}
          </div>
          <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide">{label}</div>
        </div>
        {isLive && (
          <div className="flex items-center gap-1">
            <Radio size={8} style={{ color: '#26F7C7' }} />
            <span className="text-[9px] text-[#26F7C7] uppercase tracking-wider font-semibold">Live</span>
          </div>
        )}
      </div>

      <div className="space-y-2 mb-3">
        {richSignal.examples.map((example, idx) => (
          <div key={idx} className="text-[11px] text-white text-opacity-85">
            <span className="text-white text-opacity-50">•</span> <span className="font-medium">{example.companyName}</span> — {example.summaryLine}
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white border-opacity-10 space-y-2">
        <div>
          <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider mb-0.5">Why it matters</div>
          <div className="text-[11px] text-white text-opacity-70">{richSignal.whyThisMatters}</div>
        </div>
      </div>
    </div>
  );
}

function OutputRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1C1C1C] last:border-0">
      <span className="text-[13px] text-white text-opacity-60">{label}</span>
      <span className={`text-[14px] font-medium ${highlight ? 'text-[#26F7C7]' : 'text-white text-opacity-90'}`}>
        {value}
      </span>
    </div>
  );
}

function sendPressureAlert(email: string, forecast: string) {
  console.log(`[Pressure Alert] Sending alert to ${email}: Pressure ${forecast}`);
}

function MatchingEngineV3() {
  const navigate = useNavigate();
  const { user, runtimeMode } = useAuth();

  // RUNTIME MODE: Explicit guest vs auth mode (single source of truth)
  // - 'guest': No DB writes, no AI calls, localStorage only, zero side effects
  // - 'auth': Full persistence, AI enabled (if configured), realtime subscriptions
  const isGuest = runtimeMode === 'guest';

  const [provider, setProvider] = useState<ProviderInputs>({
    servicesDelivered: ['SaaS Implementation', 'Sales Ops'],
    idealClient: 'Series A/B SaaS companies scaling GTM',
    averageDealSize: 75000,
    geographyServed: 'North America',
    capacity: 3,
    nicheExpertise: ['B2B SaaS', 'FinTech'],
    apiKey: '',
  });

  const [signals, setSignals] = useState<SignalsState>({
    jobs: {
      value: '241 developer roles open in North America in the last 7 days',
      isLive: false,
    },
    funding: {
      value: '17 Series A/B raises in past 10 days',
      isLive: false,
    },
    layoffs: {
      value: '3,200 layoffs across tech/security',
      isLive: false,
    },
    hiringVelocity: {
      value: '↑ 22% in climate tech this month',
      isLive: false,
    },
    toolAdoption: {
      value: 'HubSpot → Salesforce migrations up 11%',
      isLive: false,
    },
    loading: false,
    error: null,
  });

  const [richJobsSignal, setRichJobsSignal] = useState<RichSignal | null>(null);
  const [richFundingSignal, setRichFundingSignal] = useState<RichSignal | null>(null);
  const [richLayoffsSignal, setRichLayoffsSignal] = useState<RichSignal | null>(null);

  const [signalHistory, setSignalHistory] = useState<SignalHistory[]>([]);
  const [signalStrength, setSignalStrength] = useState(0);
  const [predictionResult, setPredictionResult] = useState({
    pressureForecast: 'stable' as 'rising' | 'stable' | 'falling',
    momentumScore: 0,
    explanation: 'Collecting data for trend analysis...',
    confidence: 50,
  });
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [lastAlertForecast, setLastAlertForecast] = useState<string | null>(null);

  const [showCleanJobs, setShowCleanJobs] = useState(false);
  const [showCleanFunding, setShowCleanFunding] = useState(false);
  const [showCleanLayoffs, setShowCleanLayoffs] = useState(false);
  const [showCleanHiring, setShowCleanHiring] = useState(false);

  const [showCleanTech, setShowCleanTech] = useState(false);

  const [cleanJobsSummary, setCleanJobsSummary] = useState<string | null>(null);
  const [cleanFundingSummary, setCleanFundingSummary] = useState<string | null>(null);
  const [cleanLayoffsSummary, setCleanLayoffsSummary] = useState<string | null>(null);
  const [cleanHiringSummary, setCleanHiringSummary] = useState<string | null>(null);
  const [cleanTechSummary, setCleanTechSummary] = useState<string | null>(null);

  const [isCleaningJobs, setIsCleaningJobs] = useState(false);
  const [isCleaningFunding, setIsCleaningFunding] = useState(false);
  const [isCleaningLayoffs, setIsCleaningLayoffs] = useState(false);
  const [isCleaningHiring, setIsCleaningHiring] = useState(false);
  const [isCleaningTech, setIsCleaningTech] = useState(false);

  const [insightMode, setInsightMode] = useState<'template' | 'template_plus_ai' | 'ai_only'>('template');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isRewritingInsight, setIsRewritingInsight] = useState(false);
  const [trendDirection, setTrendDirection] = useState<'up' | 'down' | 'flat'>('flat');
  const [jobInsights, setJobInsights] = useState<JobInsights | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [industryFilter, setIndustryFilter] = useState<string>('');
  const [sourcesCount, setSourcesCount] = useState<number>(1);
  const [isRewritingIntro, setIsRewritingIntro] = useState(false);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [campaignMode, setCampaignMode] = useState<'pure_connector' | 'solution_provider' | 'network_orchestrator'>('pure_connector');
  const [operatorName, setOperatorName] = useState<string>('');
  const [operatorCompany, setOperatorCompany] = useState<string>('');

  // PHASE 4 COMPLETE: personDataByDomain migrated to demandStates[domain].contact
  const [isEnrichingDomain, setIsEnrichingDomain] = useState<string | null>(null);
  const [noContactsFoundByDomain, setNoContactsFoundByDomain] = useState<Record<string, boolean>>({});
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error' | 'warning' | 'cache' | 'info'; message: string } | null>(null);
  const [personPressureProfileByDomain, setPersonPressureProfileByDomain] = useState<Record<string, string>>({});
  const [enrichmentConfig, setEnrichmentConfig] = useState<EnrichmentConfig>({ provider: 'none' });
  const [conversationStartedByDomain, setConversationStartedByDomain] = useState<Record<string, boolean>>({});
  const [lastContactDateByDomain, setLastContactDateByDomain] = useState<Record<string, string | null>>({});
  const [introUnlockedByDomain, setIntroUnlockedByDomain] = useState<Record<string, boolean>>({});
  const [rewriteCache, setRewriteCache] = useState<Map<string, string>>(new Map());
  const [aiRewrittenIntroByDomain, setAiRewrittenIntroByDomain] = useState<Record<string, string>>({});
  const [finalIntroByDomain, setFinalIntroByDomain] = useState<Record<string, string>>({});
  // PHASE 4 COMPLETE: demandIntro/supplyIntro migrated to demandStates[domain].demandIntro/supplyIntro
  const [isGeneratingDemandIntro, setIsGeneratingDemandIntro] = useState(false);
  const [isGeneratingSupplyIntro, setIsGeneratingSupplyIntro] = useState(false);

  // Track domains where intro generation has been ATTEMPTED (prevents infinite loops)
  const introGenerationAttemptedRef = useRef<Set<string>>(new Set());
  const [aiWhyNowByDomain, setAiWhyNowByDomain] = useState<Record<string, string>>({});
  const [aiWhyYouByDomain, setAiWhyYouByDomain] = useState<Record<string, string>>({});
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  // Stage 5: Legacy state kept for fallback until snapshot is ready
  // Primary source of truth is now pipelineSnapshot
  const [matchingResults, setMatchingResults] = useState<MatchingResult[]>([]);
  const [instantlyConfig, setInstantlyConfig] = useState<{apiKey: string; campaignId: string; campaignDemand: string; campaignSupply: string} | null>(null);
  const [isSendingInstantlyByDomain, setIsSendingInstantlyByDomain] = useState<Record<string, boolean>>({});
  const [connectorProfile, setConnectorProfile] = useState<ConnectorProfile | null>(null);
  const [demandStatusByDomain, setDemandStatusByDomain] = useState<Record<string, string>>({});
  const [supplyStatusByDomain, setSupplyStatusByDomain] = useState<Record<string, string>>({});

  // Pressure detection from PressureInversionEngine (loaded from settings)
  const [pressureDetection, setPressureDetection] = useState<PressureDetectionResult | null>(null);

  // Trusted supply pools - grows to 50-200 providers per roleType
  const [trustedSupplyPools, setTrustedSupplyPools] = useState<TrustedSupplyPools>(createEmptyPools());

  // Trusted demand pools - grows to 100-300 companies per roleType
  const [trustedDemandPools, setTrustedDemandPools] = useState<TrustedDemandPools>(createEmptyDemandPools());

  // Pre-enriched contacts pool - ready contacts for batch send (capped at 500 per roleType)
  const [preEnrichedPools, setPreEnrichedPools] = useState<PreEnrichedContactsPools>(createEmptyPreEnrichedPools());

  // Background enrichment worker progress
  const [enrichmentWorkerProgress, setEnrichmentWorkerProgress] = useState<{
    roleType: string;
    total: number;
    completed: number;
    succeeded: number;
  } | null>(null);

  // Optimistic UI for pool filling
  const [isPreparingPool, setIsPreparingPool] = useState(false);
  const [optimisticProgress, setOptimisticProgress] = useState(0);
  const [prevReadyCount, setPrevReadyCount] = useState(0);
  const [showFirstContactPulse, setShowFirstContactPulse] = useState(false);
  const [newlyReadyDomains, setNewlyReadyDomains] = useState<Set<string>>(new Set());
  const [showLongWaitReassurance, setShowLongWaitReassurance] = useState(false);
  const [isDiscoveringMatch, setIsDiscoveringMatch] = useState(false);
  const prevMatchCount = useRef(0);

  // AI Niche Detection - what industry/niche this dataset represents
  const [detectedNiche, setDetectedNiche] = useState<DetectedNiche | null>(null);
  const [isDetectingNiche, setIsDetectingNiche] = useState(false);
  const longWaitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI Match Narrations - Rich stories about each company
  const [matchNarrations, setMatchNarrations] = useState<Record<string, MatchNarration>>({});
  const [stackedSignals, setStackedSignals] = useState<Record<string, StackedSignal>>({});
  const [dealScores, setDealScores] = useState<Record<string, DealScore>>({});

  // Stage 5: Legacy fallback - primary source is pipelineSnapshot.dataHealth
  interface DataHealth {
    demand: { total: number; withName: number; withDomain: number; quality: 'good' | 'partial' | 'poor' };
    supply: { total: number; withName: number; withEmail: number; quality: 'good' | 'partial' | 'poor' };
  }
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null);
  const [isGeneratingNarrations, setIsGeneratingNarrations] = useState(false);
  const optimisticIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-trigger tracking (once per session per roleType)
  const autoTriggeredRolesRef = useRef<Set<string>>(new Set());

  // Live feed of recently found contacts (for enrichment UI)
  interface FoundContact {
    name: string;
    title: string;
    company: string;
    domain: string;
    email: string;
    foundAt: number;
  }
  const [recentlyFoundContacts, setRecentlyFoundContacts] = useState<FoundContact[]>([]);
  const maxRecentContacts = 5; // Show last 5 in live feed

  // Batch send mode
  const [batchSize, setBatchSize] = useState<number>(300);
  const batchExecutorRef = useRef<BatchSendExecutor | null>(null);
  const [routingProgress, setRoutingProgress] = useState<{
    total: number;
    completed: number;
    startTime: number;
  } | null>(null);
  const [batchSummaryModal, setBatchSummaryModal] = useState<{
    show: boolean;
    succeeded: number;
    demandCount: number;
    supplyCount: number;
    dailyTotal: number;
    durationMs: number;
    cancelled?: boolean;
    skipped?: number;
  } | null>(null);

  // V2 Batch Preflight - sample preview + cancel window
  const [showBatchPreflight, setShowBatchPreflight] = useState<boolean>(false);
  const [preflightCountdown, setPreflightCountdown] = useState<number>(0);
  const [preflightSendCount, setPreflightSendCount] = useState<number>(0);
  const preflightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const executeBatchSendRef = useRef<(() => Promise<void>) | null>(null);

  // AI Queue Status - for rate limit protection UX
  const [aiQueueStatus, setAiQueueStatus] = useState<QueueStatus | null>(null);

  // First-run overlay - Apple-style 3-step intro
  const [showFirstRunOverlay, setShowFirstRunOverlay] = useState<boolean>(false);
  const [firstRunStep, setFirstRunStep] = useState<number>(1);

  // Subscribe to AI queue status for rate-limit protection UX
  useEffect(() => {
    const unsubscribe = aiQueue.subscribe((status) => {
      // Only update if there's activity or we need to show status
      if (status.pending > 0 || status.active > 0 || status.mode !== 'normal') {
        setAiQueueStatus(status);
      } else {
        setAiQueueStatus(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Check localStorage on mount to show first-run overlay
  useEffect(() => {
    const hasSeenFirstRun = localStorage.getItem('connector_first_run_seen');
    if (!hasSeenFirstRun) {
      // Small delay to let UI settle before showing overlay
      const timer = setTimeout(() => {
        setShowFirstRunOverlay(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // "Finding the match" animation when results first appear
  useEffect(() => {
    const currentCount = matchingResults.length;
    if (prevMatchCount.current === 0 && currentCount > 0) {
      // First time we got results - show discovery animation
      setIsDiscoveringMatch(true);
      const timer = setTimeout(() => {
        setIsDiscoveringMatch(false);
      }, 1800); // Show for 1.8 seconds
      return () => clearTimeout(timer);
    }
    prevMatchCount.current = currentCount;
  }, [matchingResults.length]);

  const dismissFirstRunOverlay = () => {
    localStorage.setItem('connector_first_run_seen', 'true');
    localStorage.setItem('matching_engine_onboarded', 'true');
    setShowFirstRunOverlay(false);
    setFirstRunStep(1);
  };

  const advanceFirstRunStep = () => {
    if (firstRunStep < 3) {
      setFirstRunStep(firstRunStep + 1);
    } else {
      dismissFirstRunOverlay();
    }
  };

  // ==========================================================================
  // OPERATOR DAILY DASHBOARD - $10k/mo SOP
  // ==========================================================================
  // Daily target: 300-500 sends = ~$10k/mo revenue potential
  const [dailyTarget, setDailyTarget] = useState<number>(300);
  const [dailySentToday, setDailySentToday] = useState<number>(0);
  const [dailyRepliedToday, setDailyRepliedToday] = useState<number>(0);
  const [lastResetDate, setLastResetDate] = useState<string>(new Date().toDateString());
  const [sessionCreditsUsed, setSessionCreditsUsed] = useState<number>(0);
  const [paginationOffset, setPaginationOffset] = useState<number>(0);
  const [hasMoreRecords, setHasMoreRecords] = useState<boolean>(true);
  const [totalRecordsAvailable, setTotalRecordsAvailable] = useState<number>(0);

  // UI states for operator dashboard
  const [isEditingTarget, setIsEditingTarget] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Enrichment progress for reptile-brain feedback
  const [enrichmentQueue, setEnrichmentQueue] = useState<number>(0);
  const [enrichmentCompleted, setEnrichmentCompleted] = useState<number>(0);
  const [currentEnrichingDomain, setCurrentEnrichingDomain] = useState<string | null>(null);

  // Reset daily counts at midnight
  useEffect(() => {
    const today = new Date().toDateString();
    if (lastResetDate !== today) {
      setDailySentToday(0);
      setDailyRepliedToday(0);
      setLastResetDate(today);
      localStorage.setItem('operator_last_reset', today);
      localStorage.setItem('operator_sent_today', '0');
    }
  }, [lastResetDate]);

  // Persist daily stats to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('operator_sent_today');
    const savedTarget = localStorage.getItem('operator_daily_target');
    const savedDate = localStorage.getItem('operator_last_reset');
    const today = new Date().toDateString();

    if (savedDate === today && saved) {
      setDailySentToday(parseInt(saved) || 0);
    }
    if (savedTarget) {
      setDailyTarget(parseInt(savedTarget) || 300);
    }
  }, []);

  // ==========================================================================
  // REPLY COUNT FROM SUPABASE (Real-time)
  // ==========================================================================

  // Fetch today's reply count from Supabase (AUTHED ONLY)
  const fetchTodayReplyCount = async () => {
    // GUEST GUARD: Skip DB call for guests
    if (isGuest) {
      console.log('[Replies] Skipping fetch for guest');
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const { data, error } = await supabase
        .from('replies')
        .select('thread_id', { count: 'exact', head: true })
        .gte('replied_at', todayISO)
        .eq('direction', 'inbound');

      if (error) {
        console.warn('[Replies] Failed to fetch count:', error);
        return;
      }

      // Use count from response
      const count = (data as any)?.length || 0;

      // Also try to get distinct count
      const { count: distinctCount } = await supabase
        .from('replies')
        .select('*', { count: 'exact', head: true })
        .gte('replied_at', todayISO)
        .eq('direction', 'inbound');

      const replyCount = distinctCount || count || 0;
      setDailyRepliedToday(replyCount);
      localStorage.setItem('operator_replied_today', String(replyCount));
      console.log(`[Replies] Today's count: ${replyCount}`);
    } catch (err) {
      console.error('[Replies] Error fetching count:', err);
    }
  };

  // Fetch reply count on mount and set up realtime subscription (AUTHED ONLY)
  useEffect(() => {
    // Load from localStorage for instant UI (both guest and authed)
    const savedReplied = localStorage.getItem('operator_replied_today');
    const savedDate = localStorage.getItem('operator_last_reset');
    const today = new Date().toDateString();
    if (savedDate === today && savedReplied) {
      setDailyRepliedToday(parseInt(savedReplied) || 0);
    }

    // GUEST GUARD: Skip DB fetch + realtime for guests
    if (isGuest) {
      console.log('[Replies] Skipping realtime subscription for guest');
      return;
    }

    // Initial fetch (authed only)
    fetchTodayReplyCount();

    // Set up Supabase Realtime subscription for replies table (authed only)
    const channel = supabase
      .channel('replies-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'replies',
          filter: 'direction=eq.inbound',
        },
        (payload) => {
          console.log('[Replies] New reply received:', payload);
          // Increment count
          setDailyRepliedToday(prev => {
            const newCount = prev + 1;
            localStorage.setItem('operator_replied_today', String(newCount));
            return newCount;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGuest]);

  // Persist daily target changes
  const updateDailyTarget = (newTarget: number) => {
    const clamped = Math.max(50, Math.min(1000, newTarget));
    setDailyTarget(clamped);
    localStorage.setItem('operator_daily_target', String(clamped));
    setIsEditingTarget(false);
  };

  // Track API credit usage - ONLY for verified emails
  // Cache of verified emails to prevent double-charging (30-day window)
  const verifiedEmailsCacheRef = useRef<Map<string, string>>(new Map()); // email -> verifiedAt ISO

  const shouldChargeCredit = (email: string, verificationStatus?: string): boolean => {
    if (!email) return false;
    if (verificationStatus && verificationStatus !== 'verified') return false;

    // Check 30-day cache to prevent double-charging
    const cachedAt = verifiedEmailsCacheRef.current.get(email);
    if (cachedAt) {
      const daysSince = (Date.now() - new Date(cachedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        console.log(`[Credits] Skipping charge for ${email} - verified ${Math.round(daysSince)}d ago`);
        return false;
      }
    }

    return true;
  };

  const trackCreditUsage = (email: string, verificationStatus?: string) => {
    if (!shouldChargeCredit(email, verificationStatus)) return;

    // Add to cache
    verifiedEmailsCacheRef.current.set(email, new Date().toISOString());
    setSessionCreditsUsed(prev => prev + 1);
    console.log(`[Credits] +1 for verified email: ${email}`);
  };

  // Two-contact architecture: separate demand (hiring company) and supply (provider) contacts
  // PHASE 4 COMPLETE: supplyContactBySupplyDomain migrated to supplyContacts[supplyDomain].contact
  // KEYING INVARIANT:
  // - supplyContacts[supplyDomain].contact - "who do we email at this provider?"
  // - selectedSupplyByDemandDomain[demandDomain] - "for this demand, which supply did we pick?"
  const [selectedSupplyByDemandDomain, setSelectedSupplyByDemandDomain] = useState<Record<string, SupplyCompany | null>>({});
  const [alternativeSupplyByDomain, setAlternativeSupplyByDomain] = useState<Record<string, SupplyCompany[]>>({});
  const [isEnrichingSupplyByDomain, setIsEnrichingSupplyByDomain] = useState<Record<string, boolean>>({});
  const [rotationAppliedByDomain, setRotationAppliedByDomain] = useState<Record<string, boolean>>({});
  const [expandedSupplyDomain, setExpandedSupplyDomain] = useState<string | null>(null);
  const [matchReasoningByDemandDomain, setMatchReasoningByDemandDomain] = useState<Record<string, string>>({});
  const [supplyMatchScoreByDomain, setSupplyMatchScoreByDomain] = useState<Record<string, number>>({});
  // Store ALL scored matches per demand domain (for provider switching)
  const [allScoredMatchesByDomain, setAllScoredMatchesByDomain] = useState<Record<string, ScoredSupplyMatch[]>>({});

  // Company enrichment (Instantly AI) - pain points, competitors, customer profiles
  const [companyEnrichmentByDomain, setCompanyEnrichmentByDomain] = useState<Record<string, CompanyEnrichment | null>>({});
  const [isEnrichingCompanyByDomain, setIsEnrichingCompanyByDomain] = useState<Record<string, boolean>>({});
  const [intelExpandedByDomain, setIntelExpandedByDomain] = useState<Record<string, boolean>>({});

  // Dynamic supply discovery - companies fetched from Apify supply dataset
  const [discoveredSupplyCompanies, setDiscoveredSupplyCompanies] = useState<SupplyCompany[]>([]);
  const [supplyDiscoveryStatus, setSupplyDiscoveryStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [rawSupplyCount, setRawSupplyCount] = useState<number>(0); // Original contact count before filtering

  // Supply confirmation flow - for Option B (user-confirmed supply creation)
  const [pendingSupplyConfirmation, setPendingSupplyConfirmation] = useState<{
    domain: string;
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactTitle: string;
    hireCategory: HireCategory;
  } | null>(null);

  // Global refresh state - true while fetching signals + processing results
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initial load state - true until settings loaded from database
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Signal API configuration state
  const [signalSettings, setSignalSettings] = useState<{
    jobsApiKey: string;
    jobsQueryUrl: string;
    supplyQueryUrl: string;  // Supply discovery URL
    fundingApiKey: string;
    fundingQueryUrl: string;
    layoffsApiKey: string;
    layoffsQueryUrl: string;
    hiringApiKey: string;
    hiringQueryUrl: string;
    techApiKey: string;
    techQueryUrl: string;
  }>({
    jobsApiKey: '',
    jobsQueryUrl: '',
    supplyQueryUrl: '',
    fundingApiKey: '',
    fundingQueryUrl: '',
    layoffsApiKey: '',
    layoffsQueryUrl: '',
    hiringApiKey: '',
    hiringQueryUrl: '',
    techApiKey: '',
    techQueryUrl: '',
  });

  // Work Owner Search settings
  const [workOwnerSettings, setWorkOwnerSettings] = useState<{
    departments: string[];
    keywords: string[];
  }>({
    departments: [],
    keywords: [],
  });

  // Derived signal status checks - check both configuration AND if live data was returned
  const hasJobs = !!signalSettings.jobsQueryUrl && signals.jobs.isLive;  // Apify only needs URL
  const hasFunding = !!(signalSettings.fundingApiKey && signalSettings.fundingQueryUrl) && signals.funding.isLive;
  const hasLayoffs = !!(signalSettings.layoffsApiKey && signalSettings.layoffsQueryUrl) && signals.layoffs.isLive;
  const hasHiring = !!(signalSettings.hiringApiKey && signalSettings.hiringQueryUrl) && signals.hiringVelocity.isLive;
  const hasTech = !!(signalSettings.techApiKey && signalSettings.techQueryUrl) && signals.toolAdoption.isLive;
  const hasAnyLiveSignals = hasJobs || hasFunding || hasLayoffs || hasHiring || hasTech;

  const activeResult = matchingResults[activeResultIndex] || null;

  // ============================================================================
  // NEW STATE ARCHITECTURE - Single Source of Truth (Phase 1: Introduction)
  // ============================================================================
  //
  // MIGRATION STATUS: Phase 1 - Introduction (no legacy removal yet)
  //
  // This replaces the 28+ domain-keyed maps with TWO authoritative sources:
  // 1. demandStates: Record<demandDomain, DemandState> - all demand-side state
  // 2. supplyContacts: Record<supplyDomain, SupplyContactState> - supply contacts only
  //
  // Key rule: demandStates is ALWAYS keyed by DEMAND domain
  //           supplyContacts is ALWAYS keyed by SUPPLY domain
  //           Supply is REFERENCED in DemandState by domain, never embedded

  interface DemandState {
    domain: string; // DEMAND domain - canonical key

    // DEMAND CONTACT (person at the demand company)
    contact: PersonData | null;
    contactStatus: 'pending' | 'enriching' | 'enriched' | 'failed' | 'not_found';

    // COMPANY INTEL
    companyIntel: CompanyEnrichment | null;
    companyIntelStatus: 'pending' | 'enriching' | 'ready' | 'failed';

    // SUPPLY MATCHING (reference by domain, don't embed)
    selectedSupplyDomain: string | null;
    matchScore: number | null;
    matchReasoning: string | null;

    // INTROS
    demandIntro: string | null;
    supplyIntro: string | null;
    introsStatus: 'pending' | 'generating' | 'ready' | 'failed';

    // SEND STATUS
    demandSendStatus: 'idle' | 'sending' | 'sent' | 'replied' | 'failed';
    supplySendStatus: 'idle' | 'sending' | 'sent' | 'replied' | 'failed';

    // META
    lastUpdatedAt: number;
  }

  interface SupplyContactState {
    domain: string; // SUPPLY domain - canonical key
    contact: SupplyContact | null;
    contactStatus: 'pending' | 'enriching' | 'enriched' | 'failed' | 'not_found';
    lastUpdatedAt: number;
  }

  // DEFAULT FACTORIES
  const createDefaultDemandState = (domain: string): DemandState => ({
    domain,
    contact: null,
    contactStatus: 'pending',
    companyIntel: null,
    companyIntelStatus: 'pending',
    selectedSupplyDomain: null,
    matchScore: null,
    matchReasoning: null,
    demandIntro: null,
    supplyIntro: null,
    introsStatus: 'pending',
    demandSendStatus: 'idle',
    supplySendStatus: 'idle',
    lastUpdatedAt: Date.now(),
  });

  const createDefaultSupplyContactState = (domain: string): SupplyContactState => ({
    domain,
    contact: null,
    contactStatus: 'pending',
    lastUpdatedAt: Date.now(),
  });

  // Stage 5: Legacy fallback state - primary source is pipelineSnapshot
  // PHASE 4 COMPLETE: Single source of truth for all domain state
  // - demandStates[demandDomain] = all demand-side state (contact, intros, send status, etc.)
  // - supplyContacts[supplyDomain] = supply contact state only
  const [demandStates, setDemandStates] = useState<Record<string, DemandState>>({});
  const [supplyContacts, setSupplyContacts] = useState<Record<string, SupplyContactState>>({});

  // REFS to avoid stale closures in async callbacks
  const demandStatesRef = useRef<Record<string, DemandState>>({});
  const supplyContactsRef = useRef<Record<string, SupplyContactState>>({});

  // Keep refs in sync with state
  useEffect(() => {
    demandStatesRef.current = demandStates;
  }, [demandStates]);

  useEffect(() => {
    supplyContactsRef.current = supplyContacts;
  }, [supplyContacts]);

  // HELPERS - these never return undefined, always return a valid state object
  const getDemandState = (domain: string): DemandState => {
    return demandStatesRef.current[domain] || createDefaultDemandState(domain);
  };

  const getSupplyContactState = (domain: string): SupplyContactState => {
    return supplyContactsRef.current[domain] || createDefaultSupplyContactState(domain);
  };

  // UPDATE HELPERS - immutable updates with automatic timestamp
  const updateDemandState = (domain: string, updates: Partial<DemandState>): void => {
    setDemandStates(prev => ({
      ...prev,
      [domain]: {
        ...(prev[domain] || createDefaultDemandState(domain)),
        ...updates,
        lastUpdatedAt: Date.now(),
      }
    }));
  };

  const updateSupplyContactState = (domain: string, updates: Partial<SupplyContactState>): void => {
    setSupplyContacts(prev => ({
      ...prev,
      [domain]: {
        ...(prev[domain] || createDefaultSupplyContactState(domain)),
        ...updates,
        lastUpdatedAt: Date.now(),
      }
    }));
  };

  // BATCH UPDATE - for initializing multiple domains at once
  const batchUpdateDemandStates = (updates: Record<string, Partial<DemandState>>): void => {
    setDemandStates(prev => {
      const next = { ...prev };
      for (const [domain, domainUpdates] of Object.entries(updates)) {
        next[domain] = {
          ...(prev[domain] || createDefaultDemandState(domain)),
          ...domainUpdates,
          lastUpdatedAt: Date.now(),
        };
      }
      return next;
    });
  };

  // ============================================================================
  // PHASE 4: STATE WRITE HELPERS (single source of truth)
  // ============================================================================
  // These helpers write ONLY to new state. Legacy state has been removed.

  const setDemandIntro = (domain: string, intro: string | null) => {
    updateDemandState(domain, { demandIntro: intro, introsStatus: intro ? 'ready' : 'pending' });
  };

  const setSupplyIntro = (domain: string, intro: string | null) => {
    updateDemandState(domain, { supplyIntro: intro });
  };

  const setDemandContact = (domain: string, contact: PersonData | null) => {
    updateDemandState(domain, {
      contact,
      contactStatus: contact?.email ? 'enriched' : contact ? 'enriched' : 'pending'
    });
  };

  const setSupplyContactForDomain = (supplyDomain: string, contact: SupplyContact | null) => {
    updateSupplyContactState(supplyDomain, {
      contact,
      contactStatus: contact?.email ? 'enriched' : 'pending'
    });
  };

  // ============================================================================
  // END NEW STATE ARCHITECTURE
  // ============================================================================

  // ============================================================================
  // LOCAL STORAGE PERSISTENCE - Prevents data loss on navigation
  // ============================================================================
  const CACHE_KEY = 'matching_engine_state_v2';
  const LEGACY_CACHE_KEY = 'matching_engine_state_v1';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  // Restore state from localStorage on mount - deferred to avoid blocking first paint
  useEffect(() => {
    const restoreCache = () => {
      try {
        // MIGRATION: Clear legacy v1 cache (ambiguous key semantics)
        if (localStorage.getItem(LEGACY_CACHE_KEY)) {
          localStorage.removeItem(LEGACY_CACHE_KEY);
          console.log('[Cache] Legacy cache cleared (v1 → v2)');
        }

        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return;

        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;

        if (age > CACHE_TTL) {
          localStorage.removeItem(CACHE_KEY);
          return;
        }

        // Batch state updates to minimize re-renders
        if (data.matchingResults?.length > 0) setMatchingResults(data.matchingResults);
        if (data.signals) setSignals(data.signals);

        // Phase 4: Restore directly to new state (single source of truth)
        if (data.demandStates) {
          setDemandStates(data.demandStates);
          demandStatesRef.current = data.demandStates;
        }
        if (data.supplyContacts) {
          setSupplyContacts(data.supplyContacts);
          supplyContactsRef.current = data.supplyContacts;
        }

        // Keep other state that wasn't migrated
        if (data.demandStatusByDomain) setDemandStatusByDomain(data.demandStatusByDomain);
        if (data.supplyStatusByDomain) setSupplyStatusByDomain(data.supplyStatusByDomain);
        if (data.introUnlockedByDomain) setIntroUnlockedByDomain(data.introUnlockedByDomain);
        if (data.selectedSupplyByDemandDomain) setSelectedSupplyByDemandDomain(data.selectedSupplyByDemandDomain);
        if (data.pressureDetection) setPressureDetection(data.pressureDetection);
        if (data.discoveredSupplyCompanies?.length > 0) {
          setDiscoveredSupplyCompanies(data.discoveredSupplyCompanies);
          setSupplyDiscoveryStatus('loaded');
        }

        // Reassurance: Show user their progress was restored
        const readyCount = Object.values(data.demandStates || {}).filter((s: any) => s?.contact?.email).length;
        if (readyCount > 0 || data.matchingResults?.length > 0) {
          console.log('[Cache] Restored session:', readyCount, 'contacts ready,', data.matchingResults?.length || 0, 'matches');
          showToast('success', `Welcome back — ${readyCount > 0 ? `${readyCount} contacts ready` : 'resuming where you left off'}`);
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    };

    // Defer restore to after first paint for smooth load
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(restoreCache, { timeout: 100 });
    } else {
      setTimeout(restoreCache, 0);
    }
  }, []);

  // Save state to localStorage when key data changes
  useEffect(() => {
    // Only save if we have meaningful data
    if (matchingResults.length === 0 && !signals.jobs.isLive) return;

    // Limit cached results to reduce storage size
    const limitedResults = matchingResults.slice(0, 50).map(r => ({
      ...r,
      rawPayload: undefined, // Strip large raw data
    }));

    // Strip raw payloads from signals too
    const lightSignals = {
      ...signals,
      jobs: { ...signals.jobs, rawPayload: undefined },
      funding: { ...signals.funding, rawPayload: undefined },
      layoffs: { ...signals.layoffs, rawPayload: undefined },
      hiringVelocity: { ...signals.hiringVelocity, rawPayload: undefined },
      toolAdoption: { ...signals.toolAdoption, rawPayload: undefined },
    };

    // Limit domain-keyed objects
    const limitDomainObject = <T,>(obj: Record<string, T>, limit = 30): Record<string, T> => {
      const keys = Object.keys(obj).slice(0, limit);
      return keys.reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});
    };

    // Phase 4: Cache new state (single source of truth)
    const stateToCache = {
      matchingResults: limitedResults,
      signals: lightSignals,
      demandStates: limitDomainObject(demandStates),
      supplyContacts: limitDomainObject(supplyContacts),
      demandStatusByDomain: limitDomainObject(demandStatusByDomain),
      supplyStatusByDomain: limitDomainObject(supplyStatusByDomain),
      introUnlockedByDomain: limitDomainObject(introUnlockedByDomain),
      selectedSupplyByDemandDomain: limitDomainObject(selectedSupplyByDemandDomain),
      pressureDetection,
      discoveredSupplyCompanies: discoveredSupplyCompanies.slice(0, 20),
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: stateToCache,
        timestamp: Date.now(),
      }));
      console.log('[MatchingEngine] State cached');
    } catch (error) {
      // Quota exceeded - clear cache and try again
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[MatchingEngine] Cache quota exceeded, clearing old cache');
        localStorage.removeItem(CACHE_KEY);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: stateToCache,
            timestamp: Date.now(),
          }));
        } catch {
          console.error('[MatchingEngine] Still cannot cache after clearing');
        }
      } else {
        console.error('[MatchingEngine] Failed to cache state:', error);
      }
    }
  }, [
    matchingResults,
    signals,
    demandStates,
    supplyContacts,
    demandStatusByDomain,
    supplyStatusByDomain,
    introUnlockedByDomain,
    selectedSupplyByDemandDomain,
    pressureDetection,
    discoveredSupplyCompanies,
  ]);

  // Clear cache function (for manual refresh)
  const clearStateCache = () => {
    localStorage.removeItem(CACHE_KEY);
    console.log('[MatchingEngine] Cache cleared');
  };

  const showToast = (type: 'success' | 'error' | 'warning' | 'cache' | 'info', message: string) => {
    setToastNotification({ type, message });
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Load More Companies - pagination for datasets > 100
  const loadMoreCompanies = async () => {
    if (isLoadingMore || !hasMoreRecords) return;

    setIsLoadingMore(true);
    console.log(`[Pagination] Loading more from offset ${paginationOffset}...`);

    try {
      const config = await loadSignalsConfig();
      // Check both new field (demandDatasetId) and deprecated field (jobsApiUrl)
      if (!config.demandDatasetId && !config.jobsApiUrl) {
        showToast('error', 'No dataset URL configured');
        setIsLoadingMore(false);
        return;
      }

      // Fetch next batch with offset
      const result = await fetchJobSignals(config, '', {
        limit: FETCH_LIMITS.JOBS_BATCH,
        offset: paginationOffset,
      });

      if (result.rawPayload?.data && Array.isArray(result.rawPayload.data)) {
        const newItems = result.rawPayload.data;
        const newCount = newItems.length;

        if (newCount === 0) {
          setHasMoreRecords(false);
          showToast('info', 'All companies loaded');
        } else {
          // Append to existing signals
          setSignals(prev => {
            const existingData = prev.jobs?.rawPayload?.data || [];
            return {
              ...prev,
              jobs: {
                ...prev.jobs,
                rawPayload: {
                  ...prev.jobs?.rawPayload,
                  data: [...existingData, ...newItems],
                },
              },
            };
          });

          // Update pagination state
          const newOffset = paginationOffset + newCount;
          setPaginationOffset(newOffset);
          setTotalRecordsAvailable(prev => prev + newCount);
          setHasMoreRecords(newCount >= FETCH_LIMITS.JOBS_BATCH);

          showToast('success', `Loaded ${newCount} more companies`);
          console.log(`[Pagination] Loaded ${newCount} more, total offset now ${newOffset}`);
        }
      } else {
        setHasMoreRecords(false);
        showToast('info', 'No more companies');
      }
    } catch (error) {
      console.error('[Pagination] Load more failed:', error);
      showToast('error', 'Failed to load more');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const previousState = useRef<{
    forecast: string;
    signalStrength: number;
    fundingCount: number;
    layoffsCount: number;
    trendDirection?: 'up' | 'down' | 'flat';
  }>({
    forecast: 'stable',
    signalStrength: 0,
    fundingCount: 0,
    layoffsCount: 0,
    trendDirection: 'flat',
  });

  useEffect(() => {
    // Guest mode: load settings read-only (enrichment works), skip DB writes
    // Auth mode: full flow with row creation + signal history
    if (!user?.id) {
      // Guest: just load settings (enrichment config etc), skip history
      loadSettingsFromDatabase();
      setSettingsLoaded(true);
      return;
    }

    ensureOperatorSettingsRow().then(() => {
      loadSettingsFromDatabase();
      loadSignalHistory();
    });
  }, [user?.id]);

  /**
   * Ensure operator_settings row exists before any reads/writes.
   * Prevents 400 errors from missing rows.
   * AUTHED ONLY - never called for guests.
   */
  const ensureOperatorSettingsRow = async () => {
    // GUEST GUARD: This should never be called for guests
    if (isGuest) {
      console.warn('[Settings] ensureOperatorSettingsRow called for guest - skipping');
      return;
    }

    try {
      const { error } = await supabase
        .from('operator_settings')
        .upsert(
          { user_id: user!.id },
          { onConflict: 'user_id', ignoreDuplicates: true }
        );
      if (error) {
        console.warn('[Settings] Failed to ensure row exists:', error.message);
      }
    } catch (err) {
      console.warn('[Settings] Error ensuring row:', err);
    }
  };

  const loadSettingsFromDatabase = async () => {
    try {
      // Guest mode: read from localStorage instead of DB
      if (!user?.id) {
        const cached = localStorage.getItem('guest_settings');
        if (cached) {
          const { settings, profile } = JSON.parse(cached);
          setEnrichmentConfig({
            provider: 'apollo',
            apiKey: settings?.enrichmentApiKey || undefined,
            anymailFinderApiKey: settings?.anymailFinderApiKey || undefined,
            ssmApiKey: settings?.ssmApiKey || undefined,
          });
          setInstantlyConfig({
            apiKey: settings?.instantlyApiKey || '',
            campaignId: '',
            campaignDemand: settings?.instantlyCampaignDemand || '',
            campaignSupply: settings?.instantlyCampaignSupply || ''
          });
          // Load AI config for intro generation
          const provider = settings?.aiProvider || 'openai';
          setAiConfig({
            openaiKey: provider === 'openai' ? (settings?.aiOpenaiApiKey || '') : '',
            azureKey: provider === 'azure' ? (settings?.aiAzureApiKey || '') : '',
            azureEndpoint: provider === 'azure' ? (settings?.aiAzureEndpoint || '') : '',
            azureDeployment: provider === 'azure' ? (settings?.aiAzureDeployment || 'gpt-4o') : '',
            claudeKey: provider === 'anthropic' ? (settings?.aiAnthropicApiKey || '') : '',
            model: 'gpt-4o',
            enableRewrite: true,
            enableCleaning: true,
            enableEnrichment: true,
            enableForecasting: false,
          });
          if (profile) setConnectorProfile(profile);
          console.log('[Settings] Loaded from localStorage (guest mode), AI provider:', provider);
        }
        setSettingsLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from('operator_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProvider({
          servicesDelivered: data.services_delivered || [],
          idealClient: data.ideal_client || '',
          averageDealSize: data.average_deal_size || 0,
          geographyServed: data.geography_served || '',
          capacity: data.capacity || 0,
          nicheExpertise: data.niche_expertise || [],
          apiKey: data.signals_api_key || '',
        });

        // Build AI config based on selected provider
        const selectedProvider = data.ai_provider || 'openai';
        const loadedAiConfig = {
          // Map keys based on selected provider
          openaiKey: selectedProvider === 'openai' ? (data.ai_openai_api_key || '') : '',
          azureKey: selectedProvider === 'azure' ? (data.ai_azure_api_key || '') : '',
          azureEndpoint: selectedProvider === 'azure' ? (data.ai_azure_endpoint || '') : '',
          azureDeployment: selectedProvider === 'azure' ? (data.ai_azure_deployment || 'gpt-4o') : '',
          claudeKey: selectedProvider === 'anthropic' ? (data.ai_anthropic_api_key || '') : '',
          model: data.ai_model || 'gpt-4o',
          enableRewrite: data.ai_enable_rewrite ?? true,
          enableCleaning: data.ai_enable_signal_cleaning ?? true,
          enableEnrichment: data.ai_enable_enrichment ?? true,
          enableForecasting: data.ai_enable_forecasting ?? false,
        };
        setAiConfig(loadedAiConfig);
        console.log('[Settings] AI provider:', selectedProvider, 'Config loaded:', !!loadedAiConfig.openaiKey || !!loadedAiConfig.azureKey || !!loadedAiConfig.claudeKey);

        const loadedInsightMode = data.ai_insight_mode || 'template';
        setInsightMode(loadedInsightMode);

        const aiCleanViewDefault = data.ai_clean_view_default ?? false;
        const shouldEnableCleanView = aiCleanViewDefault &&
          isAIConfigured(loadedAiConfig) &&
          loadedAiConfig.enableCleaning;

        if (shouldEnableCleanView) {
          setShowCleanJobs(true);
          setShowCleanFunding(true);
          setShowCleanLayoffs(true);
          setShowCleanHiring(true);
          setShowCleanTech(true);
        }

        setEmailAlertsEnabled(data.email_alerts_enabled || false);
        setAlertEmail(data.alert_email || '');

        setEnrichmentConfig({
          provider: (data.enrichment_provider as any) || 'none',
          apiKey: data.enrichment_api_key || undefined,
          endpointUrl: data.enrichment_endpoint_url || undefined,
          anymailFinderApiKey: data.anymail_finder_api_key || undefined,
          ssmApiKey: data.ssm_api_key || undefined,
        });

        setInstantlyConfig({
          apiKey: data.instantly_api_key || '',
          campaignId: data.instantly_campaign_id || '',
          campaignDemand: data.instantly_campaign_demand || '',
          campaignSupply: data.instantly_campaign_supply || ''
        });

        setCampaignMode(data.operator_campaign_mode || 'pure_connector');
        setOperatorName(data.operator_name || '');
        setOperatorCompany(data.operator_company || '');

        const rawProfile = (data.connector_profile ?? null) as ConnectorProfile | null;
        setConnectorProfile(rawProfile);

        // Load signal API settings
        setSignalSettings({
          jobsApiKey: data.jobs_api_key || '',
          jobsQueryUrl: data.jobs_api_url || '',
          supplyQueryUrl: data.supply_api_url || '',
          fundingApiKey: data.funding_api_key || '',
          fundingQueryUrl: data.funding_api_url || '',
          layoffsApiKey: data.layoffs_api_key || '',
          layoffsQueryUrl: data.layoffs_api_url || '',
          hiringApiKey: data.hiring_api_key || '',
          hiringQueryUrl: data.hiring_api_url || '',
          techApiKey: data.tech_api_key || '',
          techQueryUrl: data.tech_api_url || '',
        });

        // Load work owner search settings
        const deptString = data.work_owner_departments || '';
        const keywordsString = data.work_owner_keywords || '';
        setWorkOwnerSettings({
          departments: deptString ? deptString.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          keywords: keywordsString ? keywordsString.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        });

        // Load pressure detection from PressureInversionEngine
        if (data.pressure_detection) {
          setPressureDetection(data.pressure_detection as PressureDetectionResult);
        }

        // Load trusted supply pools
        if (data.trusted_supply_pools) {
          setTrustedSupplyPools(data.trusted_supply_pools as TrustedSupplyPools);
        }

        // Load trusted demand pools
        if (data.trusted_demand_pools) {
          setTrustedDemandPools(data.trusted_demand_pools as TrustedDemandPools);
        }

        // Load pre-enriched contacts pools
        if (data.pre_enriched_pools) {
          setPreEnrichedPools(data.pre_enriched_pools as PreEnrichedContactsPools);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  };

  const loadSignalHistory = async () => {
    // GUEST: Load from localStorage
    if (isGuest) {
      try {
        const cached = localStorage.getItem('guest_signal_history');
        if (cached) {
          const history = JSON.parse(cached);
          setSignalHistory(history);
        }
      } catch (err) {
        console.warn('[SignalHistory] Failed to load from localStorage:', err);
      }
      return;
    }

    // AUTHED: Load from DB with actual user.id
    try {
      const { data, error } = await supabase
        .from('signal_history')
        .select('signal_strength, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data) {
        const history = data.map(item => ({
          signalStrength: Number(item.signal_strength),
          timestamp: item.created_at,
        })).reverse();
        setSignalHistory(history);
      }
    } catch (error) {
      console.error('Error loading signal history:', error);
    }
  };

  const extractCompanyCount = (metadata?: JobSignalInsight): number => {
    if (!metadata?.companySummary) return 0;
    const match = metadata.companySummary.match(/(\d+)\+?\s+compan/i);
    if (match) return parseInt(match[1]);
    if (metadata.companySummary.includes('all roles at')) return 1;
    return 0;
  };

  const calculateSignalStrength = (currentSignals: SignalsState): number => {
    const roleCount = parseInt(currentSignals.jobs.value.match(/\d+/)?.[0] || '0');
    const companyCount = extractCompanyCount(currentSignals.jobs.metadata);
    const fundingAmount = parseInt(currentSignals.funding.value.match(/\d+/)?.[0] || '0');
    const layoffsCount = parseInt(currentSignals.layoffs.value.match(/\d+/)?.[0] || '0');
    const hiringVelocityScore = parseInt(currentSignals.hiringVelocity.value.match(/\d+/)?.[0] || '0');
    const toolAdoptionDelta = parseInt(currentSignals.toolAdoption.value.match(/\d+/)?.[0] || '0');

    const industryMatch = currentSignals.jobs.metadata?.industryMatch || 'medium';
    const industryMultiplier = industryMatch === 'high' ? 1.2 : industryMatch === 'medium' ? 1.0 : 0.7;

    const companyWeightedScore = Math.min(100, companyCount * 8 + roleCount * 2) * industryMultiplier;

    const rawScore =
      companyWeightedScore * 0.5 +
      fundingAmount * 0.2 +
      layoffsCount * 0.1 +
      hiringVelocityScore * 0.15 +
      toolAdoptionDelta * 0.05;

    const normalizedScore = Math.min(100, Math.max(0, (rawScore / 10)));

    return Math.round(normalizedScore);
  };

  const saveSignalToHistory = async (strength: number, trend: SignalTrend, forecast: string) => {
    const historyEntry = {
      signalStrength: strength,
      timestamp: new Date().toISOString(),
    };

    // GUEST: Save to localStorage
    if (isGuest) {
      try {
        const cached = localStorage.getItem('guest_signal_history');
        const history: SignalHistory[] = cached ? JSON.parse(cached) : [];
        history.push(historyEntry);
        // Keep only last 10 entries
        const trimmed = history.slice(-10);
        localStorage.setItem('guest_signal_history', JSON.stringify(trimmed));
        setSignalHistory(trimmed);
      } catch (err) {
        console.warn('[SignalHistory] Failed to save to localStorage:', err);
      }
      return;
    }

    // AUTHED: Save to DB with actual user.id
    try {
      const whoRoles = activeResult?.whoHasPressureRoles || [];
      const titles = activeResult?.targetTitles || [];
      // Phase 2: Read from new state
      const personData = activeResult ? getDemandState(activeResult.domain).contact : null;
      const personPressureProfile = activeResult ? personPressureProfileByDomain[activeResult.domain] : null;

      const { error } = await supabase
        .from('signal_history')
        .insert({
          user_id: user!.id,
          signal_strength: strength,
          jobs_count: trend.jobsCount,
          funding_amount: trend.fundingAmount,
          layoffs_count: trend.layoffsCount,
          hiring_velocity: trend.hiringVelocity,
          tool_adoption: trend.toolAdoption,
          momentum_score: predictionResult.momentumScore,
          pressure_forecast: forecast,
          who_has_pressure_roles: whoRoles,
          target_titles: titles,
          person_name: personData?.name || null,
          person_email: personData?.email || null,
          person_title: personData?.title || null,
          person_linkedin: personData?.linkedin || null,
          person_pressure_profile: personPressureProfile || null,
          company_domain: activeResult?.domain || null,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;

      await loadSignalHistory();
    } catch (error) {
      console.error('Error saving signal to history:', error);
    }
  };

  const logUsage = async (introGenerated: boolean = false) => {
    if (!user) return;

    // Check if user.id is a valid UUID (SAAS mode) or a placeholder (non-SAAS mode)
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);

    try {
      await supabase.from('usage_logs').insert({
        user_id: isValidUuid ? user.id : null,
        tool_name: 'Matching Engine V3',
        signal_strength: signalStrength,
        pressure_forecast: predictionResult.pressureForecast,
        momentum_score: predictionResult.momentumScore,
        intro_generated: introGenerated,
        metadata: {
          provider: {
            services: provider.servicesDelivered,
            tier: user.tier,
          },
          username: user.username,
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Silently fail - usage_logs table may not exist or RLS issue
    }
  };

  useEffect(() => {
    try {
      const strength = calculateSignalStrength(signals);
      setSignalStrength(strength);

      const currentTrend = PredictionService.extractSignalTrend(signals);
      const historicalTrends: SignalTrend[] = [];

      const prediction = PredictionService.predictPressure(historicalTrends, signals);
      setPredictionResult(prediction);

      if (prediction.pressureForecast === 'rising' && emailAlertsEnabled && alertEmail && lastAlertForecast !== 'rising') {
        sendPressureAlert(alertEmail, prediction.pressureForecast);
        setLastAlertForecast('rising');
      }

      if (prediction.pressureForecast !== 'rising') {
        setLastAlertForecast(prediction.pressureForecast);
      }

      if (strength > 0 && signals.jobs.value && user) {
        saveSignalToHistory(strength, currentTrend, prediction.pressureForecast);
        logUsage(true);
      }
    } catch (error) {
      console.error('[MatchingEngine] Error processing signals:', error);
    }
  }, [signals, emailAlertsEnabled, alertEmail, user]);

  const fetchSignals = async () => {
    console.log('[MatchingEngine] fetchSignals called - starting refresh');
    clearStateCache(); // Clear cached state on manual refresh
    setIsRefreshing(true);
    console.log('[MatchingEngine] isRefreshing set to true');
    setSignals(prev => ({ ...prev, loading: true, error: null }));

    // Phase 4: Clear new state (single source of truth)
    setDemandStates({});
    demandStatesRef.current = {};
    setSupplyContacts({});
    supplyContactsRef.current = {};

    // Clear other state that wasn't fully migrated
    setSelectedSupplyByDemandDomain({});
    setAlternativeSupplyByDomain({});
    setIsEnrichingSupplyByDomain({});
    batchIntroGenerationRef.current = false; // Allow batch intros to regenerate

    // Clear demand pools on refresh to prevent stale accumulation (243 vs 96 bug)
    setTrustedDemandPools(createEmptyDemandPools());
    setPreEnrichedPools(createEmptyPreEnrichedPools());

    console.log('[MatchingEngine] Cleared cached provider data + pools + intros for fresh reload');

    try {
      const config = await loadSignalsConfig();

      const providerNiche = [...provider.nicheExpertise, provider.idealClient, ...provider.servicesDelivered].join(' ');

      // Fetch demand signals (jobs, funding, etc.)
      const [jobsRes, fundingRes, layoffsRes, hiringRes, toolRes] = await Promise.allSettled([
        fetchJobSignals(config, providerNiche),
        fetchFundingSignals(config),
        fetchLayoffSignals(config),
        fetchHiringVelocitySignals(config),
        fetchToolAdoptionSignals(config),
      ]);

      // Fetch supply signals (dynamic provider discovery)
      const supplyUrl = config.supplyDatasetId || config.supplyApiUrl;
      if (supplyUrl) {
        setSupplyDiscoveryStatus('loading');
        try {
          const supplyResult = await fetchSupplySignals(supplyUrl, undefined, undefined, config.apifyToken);
          if (supplyResult.isLive) {
            setDiscoveredSupplyCompanies(supplyResult.companies);
            setRawSupplyCount(supplyResult.totalDiscovered || supplyResult.companies.length);
            setSupplyDiscoveryStatus('loaded');
            console.log(`[Supply] Discovered ${supplyResult.companies.length} supply companies from ${supplyResult.totalDiscovered} total`);
            // Debug: Log first 5 supply companies to trace where they come from
            console.log('[Supply] First 5 companies:', supplyResult.companies.slice(0, 5).map(c => `${c.name} (${c.domain})`));

            // ================================================================
            // AUTO-POPULATE SUPPLY CONTACTS FROM APIFY DATA
            // If dataset already has email/name, verify then USE IT
            // ================================================================
            const anymailKey = config.anymailFinderApiKey;
            let withEmail = 0;
            let withNameOnly = 0;
            let needsEnrichment = 0;
            let verified = 0;
            let discarded = 0;

            // Collect supplies with emails for verification
            const suppliesToVerify: Array<{ supply: typeof supplyResult.companies[0]; email: string }> = [];

            for (const supply of supplyResult.companies) {
              const existing = supply.existingContact;

              if (existing?.email && supply.domain) {
                suppliesToVerify.push({ supply, email: existing.email });
                withEmail++;
              } else if (existing?.name && supply.domain) {
                withNameOnly++;
              } else {
                needsEnrichment++;
              }
            }

            console.log(`[Supply] Found ${withEmail} emails from dataset, ${withNameOnly} have names only, ${needsEnrichment} need enrichment`);

            // DO NOT auto-verify on load - saves Anymail credits
            // User can manually enrich/verify when they select a contact
            const autoPopulatedContacts: Record<string, SupplyContact> = {};

            if (suppliesToVerify.length > 0) {
              console.log(`[Supply] Using ${suppliesToVerify.length} emails from dataset (no auto-verification)`);
              for (const { supply, email } of suppliesToVerify) {
                const existing = supply.existingContact;
                autoPopulatedContacts[supply.domain] = {
                  email: email,
                  name: existing?.name || 'there',
                  title: existing?.title || '',
                  company: supply.name,
                  domain: supply.domain,
                  linkedin: existing?.linkedin,
                  confidence: 70, // Unverified - will verify on manual enrich
                };
                verified++;
              }
            }

            // Merge with existing contacts (don't overwrite manual enrichments)
            // Phase 3: Use dual-write helper for each auto-populated supply contact
            if (Object.keys(autoPopulatedContacts).length > 0) {
              for (const [supplyDomain, contact] of Object.entries(autoPopulatedContacts)) {
                // Only set if not already enriched (existing manual enrichments take priority)
                if (!supplyContactsRef.current[supplyDomain]?.contact?.email) {
                  setSupplyContactForDomain(supplyDomain, contact);
                }
              }
            }

            console.log(`[Supply] Auto-populated: ${verified} verified, ${discarded} discarded, ${withNameOnly} need Anymail, ${needsEnrichment} need Apollo`);

            // ================================================================
            // TRIGGER BACKGROUND SUPPLY ENRICHMENT
            // Enriches supply companies without emails (in parallel with demand)
            // ================================================================
            const apolloKey = config.apolloApiKey;
            // anymailKey already declared above for verification
            if (apolloKey && (withNameOnly > 0 || needsEnrichment > 0)) {
              const alreadyEnrichedDomains = new Set(Object.keys(autoPopulatedContacts));

              // Create enrichment function using findSupplyContact
              const supplyEnrichFn = async (domain: string, companyName: string) => {
                try {
                  const contact = await findSupplyContact(
                    apolloKey,
                    domain,
                    companyName,
                    undefined, // existingContact
                    getSupplyEnrichmentTitles('sales', detectedNiche) // Niche-aware titles
                  );
                  if (contact?.email) {
                    return {
                      email: contact.email,
                      name: contact.name,
                      title: contact.title,
                      company: contact.company,
                      domain: contact.domain,
                      linkedin: contact.linkedin,
                      confidence: contact.confidence
                    };
                  }
                  return null;
                } catch (err) {
                  console.error(`[SupplyEnrich] Error for ${companyName}:`, err);
                  return null;
                }
              };

              // Start background enrichment (fire-and-forget)
              startBackgroundSupplyEnrichment(
                supplyResult.companies.map(c => ({ domain: c.domain, name: c.name })),
                alreadyEnrichedDomains,
                supplyEnrichFn,
                (domain, contact) => {
                  // Phase 3: Use dual-write helper
                  setSupplyContactForDomain(domain, {
                    email: contact.email,
                    name: contact.name,
                    title: contact.title,
                    company: contact.company,
                    domain: contact.domain,
                    linkedin: contact.linkedin,
                    confidence: contact.confidence
                  });
                },
                (progress) => {
                  console.log(`[SupplyEnrich] Progress: ${progress.succeeded}/${progress.enriched} of ${progress.total}`);
                }
              );
              console.log(`[Supply] Started background enrichment for ${withNameOnly + needsEnrichment} supply companies`);
            }
          } else {
            setSupplyDiscoveryStatus('error');
          }
        } catch (error) {
          console.error('[Supply] Discovery failed:', error);
          setSupplyDiscoveryStatus('error');
        }
      } else {
        console.log('[Supply] No supply URL configured - two-sided matching disabled');
        setDiscoveredSupplyCompanies([]);
        setSupplyDiscoveryStatus('idle');
      }

      const newSignals: Partial<SignalsState> = {};
      const now = new Date().toISOString();

      if (jobsRes.status === 'fulfilled') {
        newSignals.jobs = jobsRes.value;
      }

      if (fundingRes.status === 'fulfilled') {
        newSignals.funding = fundingRes.value;
      }

      if (layoffsRes.status === 'fulfilled') {
        newSignals.layoffs = layoffsRes.value;
      }

      if (hiringRes.status === 'fulfilled') {
        newSignals.hiringVelocity = hiringRes.value;
      }

      if (toolRes.status === 'fulfilled') {
        newSignals.toolAdoption = toolRes.value;
      }

      setSignals(prev => ({
        ...prev,
        ...newSignals,
        loading: false,
        lastSyncTime: now,
      }));

      if (jobsRes.status === 'fulfilled' && jobsRes.value.rawPayload?.data) {
        const rawItems = jobsRes.value.rawPayload.data;
        const richJobs = createRichJobsSignal(rawItems);
        setRichJobsSignal(richJobs);

        // ================================================================
        // PRE-POPULATE personDataByDomain FROM DATASET CONTACTS
        // Uses existingContact from extractJobLikeFields (single source of truth)
        // ================================================================
        const prePopulatedContacts: Record<string, PersonData> = {};
        let prePopulatedCount = 0;

        for (const item of rawItems) {
          // Use existingContact from normalized data (already extracted by SignalsClient)
          // Falls back to raw item extraction for backwards compatibility
          const existing = item.existingContact || extractJobLikeFields(item.raw || item).existingContact;
          if (!existing?.email || !existing.email.includes('@')) continue;

          // Extract domain from normalized data or raw
          let domain = item.company?.url || item.company_url;
          if (!domain) {
            const extracted = extractJobLikeFields(item.raw || item);
            domain = extracted.companyUrl || safeLower(extracted.companyName).replace(/[^a-z0-9]/g, '') + '.com';
          }
          domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          if (!domain) continue;

          // Only add if we don't already have this domain
          if (!prePopulatedContacts[domain]) {
            prePopulatedContacts[domain] = {
              email: existing.email,
              name: existing.name || '',
              title: existing.title || '',
              linkedin: existing.linkedin || '',
              confidence: 95, // High confidence - direct from dataset
            };
            prePopulatedCount++;
          }
        }

        if (prePopulatedCount > 0) {
          console.log(`[Dataset] Pre-populated ${prePopulatedCount} contacts from dataset (will skip enrichment)`);
          // Phase 4: Use new state ref for check, existing enrichments take priority
          for (const [domain, contact] of Object.entries(prePopulatedContacts)) {
            if (!demandStatesRef.current[domain]?.contact) {
              setDemandContact(domain, contact);
            }
          }
        }

        // Run pressure detection on fetched data
        const detectedPressure = detectHiringPressure({ source: 'jobs', rawItems });
        if (detectedPressure.pressureDetected) {
          console.log('[MatchingEngine] Pressure detected:', detectedPressure.roleType, 'confidence:', detectedPressure.confidence);
          setPressureDetection(detectedPressure);
        }

        // NOTE: Dataset contacts are stored in demandStates via setDemandContact above.
        // They get added to preEnrichedPools when user initiates routing (not auto on load).
        // This ensures STATE 3 (results) shows before STATE 5 (ready to route).

        // Run AI niche detection (fire and forget - doesn't block UI)
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          setIsDetectingNiche(true);
          // First, get heuristic immediately (fast)
          const heuristicNiche = detectNicheHeuristic(rawItems);
          setDetectedNiche(heuristicNiche);

          // Then, try AI detection (async, will override heuristic if successful)
          console.log('[NicheDetection] AI config check:', { hasConfig: !!aiConfig, isConfigured: aiConfig ? isAIConfigured(aiConfig) : false });
          if (aiConfig && isAIConfigured(aiConfig)) {
            console.log('[NicheDetection] Calling AI niche detection...');
            detectDatasetNiche(rawItems, aiConfig).then((aiNiche) => {
              console.log('[NicheDetection] AI returned:', aiNiche?.niche, 'confidence:', aiNiche?.confidence);
              if (aiNiche && aiNiche.confidence > heuristicNiche.confidence) {
                setDetectedNiche(aiNiche);
                console.log('[MatchingEngine] AI niche detected:', aiNiche.niche, '|', aiNiche.oneLiner);
              }
            }).catch((err) => {
              console.error('[MatchingEngine] AI niche detection failed:', err);
            }).finally(() => {
              setIsDetectingNiche(false);
            });
          } else {
            setIsDetectingNiche(false);
          }
        }

        // Check if there are more records to load (pagination)
        const itemCount = Array.isArray(rawItems) ? rawItems.length : 0;
        setHasMoreRecords(itemCount >= 100); // If we got 100, there's probably more
        setTotalRecordsAvailable(itemCount);
        setPaginationOffset(itemCount);
        console.log(`[Pagination] Loaded ${itemCount} records, hasMore: ${itemCount >= 100}`);
      } else {
        setRichJobsSignal(null);
        setHasMoreRecords(false);
      }

      if (fundingRes.status === 'fulfilled' && fundingRes.value.rawPayload?.dataset) {
        const richFunding = createRichFundingSignal(fundingRes.value.rawPayload.dataset);
        setRichFundingSignal(richFunding);
      } else {
        setRichFundingSignal(null);
      }

      if (layoffsRes.status === 'fulfilled' && layoffsRes.value.rawPayload?.dataset) {
        const richLayoffs = createRichLayoffsSignal(layoffsRes.value.rawPayload.dataset);
        setRichLayoffsSignal(richLayoffs);
      } else {
        setRichLayoffsSignal(null);
      }

      setRoleFilter(config.jobRoleFilter || '');
      setIndustryFilter(config.jobIndustryFilter || '');

      if (jobsRes.status === 'fulfilled' && jobsRes.value.metadata?.subtitle) {
        const subtitle = jobsRes.value.metadata.subtitle;
        const sourcesMatch = subtitle.match(/from (\d+) source/);
        if (sourcesMatch) {
          setSourcesCount(parseInt(sourcesMatch[1]));
        } else {
          setSourcesCount(1);
        }
      }

      // Refresh complete
      setIsRefreshing(false);
    } catch (error) {
      setSignals(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch signals',
      }));
      setIsRefreshing(false);
    }
  };

  // REMOVED: Auto-fetch - user must click "Scan for signals" button
  // User controls when to start scanning (saves tokens + gives control)
  // const hasAutoFetchedRef = useRef(false);
  // useEffect(() => {
  //   if (settingsLoaded && !hasAutoFetchedRef.current) {
  //     hasAutoFetchedRef.current = true;
  //     console.log('[MatchingEngine] Auto-fetching signals on first load...');
  //     fetchSignals();
  //   }
  // }, [settingsLoaded]);

  // REMOVED: Auto-fetch on provider change - user must manually refresh to save tokens
  // useEffect(() => {
  //   const debounceTimer = setTimeout(() => {
  //     fetchSignals();
  //   }, 500);
  //   return () => clearTimeout(debounceTimer);
  // }, [provider.apiKey]);

  // REMOVED: Auto-refresh every 15 minutes - user must manually refresh to save tokens
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     fetchSignals();
  //   }, 15 * 60 * 1000);
  //   return () => clearInterval(interval);
  // }, []);

  // ============================================================================
  // PIPELINE INTEGRATION (Stage 5: Pipeline is the system)
  // PipelineRunSnapshot drives UI, legacy state for fallback only
  // ============================================================================
  const pipelineTriggeredRef = useRef(false);
  const [shadowPipelineRunning, setShadowPipelineRunning] = useState(false);
  const [pipelineSnapshot, setPipelineSnapshot] = useState<PipelineRunSnapshot | null>(null);

  useEffect(() => {
    // Stage 5: Pipeline is the system (no feature flags)
    // Only run once per data load
    if (pipelineTriggeredRef.current) return;
    // Don't run if already running
    if (shadowPipelineRunning) return;
    // Wait for settings to load
    if (!settingsLoaded) return;
    // Need raw data for pipeline
    if (!signals.jobs.rawPayload) {
      console.log('[Pipeline] No raw demand data available yet');
      return;
    }
    // Stage 5: Trigger on raw data availability
    const hasDemandData = signals.jobs.rawPayload?.data?.length > 0 || signals.jobs.rawPayload?.length > 0;
    if (!hasDemandData || discoveredSupplyCompanies.length === 0) return;

    pipelineTriggeredRef.current = true;
    setShadowPipelineRunning(true);

    // Stage 5: Legacy comparison removed - stub snapshot for compatibility
    const legacySnapshot = {
      matchCount: 0,
      domains: [] as string[],
      enrichedCount: 0,
      readyToSendCount: 0,
    };

    console.log('[Pipeline] Starting pipeline run...');

    // Prepare pipeline config
    const pipelineConfig: PipelineIntegrationConfig = {
      aiConfig: aiConfig,
      enrichmentConfig: {
        apiKey: enrichmentConfig.apiKey,
        anymailFinderApiKey: enrichmentConfig.anymailFinderApiKey,
        ssmApiKey: enrichmentConfig.ssmApiKey,
      },
      instantlyConfig: instantlyConfig ? {
        apiKey: instantlyConfig.apiKey,
        campaignDemand: instantlyConfig.campaignDemand,
        campaignSupply: instantlyConfig.campaignSupply,
      } : null,
      userId: user?.id || null,
    };

    console.log('[Shadow] Running shadow pipeline...');
    console.log('[Shadow] Config:', {
      aiConfigured: !!aiConfig && isAIConfigured(aiConfig),
      enrichmentConfigured: !!enrichmentConfig.apiKey,
      instantlyConfigured: !!instantlyConfig?.apiKey,
    });

    // Run shadow pipeline (no sends, no writes, just comparison)
    runShadowPipeline(
      signals.jobs.rawPayload || [],
      discoveredSupplyCompanies,
      pipelineConfig,
      legacySnapshot
    ).then(() => {
      // Stage 5: Pipeline is the system - get snapshot for UI
      const snapshot = getCurrentSnapshot();
      console.log('[Pipeline] Complete:', snapshot?.runId);
      if (snapshot) {
        setPipelineSnapshot(snapshot);
        console.log('[Pipeline] UI driven by snapshot');
      }
      setShadowPipelineRunning(false);
    }).catch(err => {
      console.error('[Pipeline] Error:', err);
      setShadowPipelineRunning(false);
    });

  }, [settingsLoaded, matchingResults.length, discoveredSupplyCompanies.length, signals.jobs.rawPayload, aiConfig, enrichmentConfig, instantlyConfig, user?.id, demandStates, preEnrichedPools, shadowPipelineRunning]);

  // Reset pipeline trigger when data refreshes
  useEffect(() => {
    if (isRefreshing) {
      pipelineTriggeredRef.current = false;
    }
  }, [isRefreshing]);

  // ============================================================================
  // AI NARRATION GENERATION - Fire and forget, enriches matching results
  // Users don't care about AI costs - process ALL results
  // ============================================================================
  const generateNarrationsForResults = async (results: MatchingResult[]) => {
    if (!aiConfig || !isAIConfigured(aiConfig)) return;
    if (results.length === 0) return;

    setIsGeneratingNarrations(true);
    console.log(`[AIService] Generating narrations for ALL ${results.length} companies (users don't care about AI costs)...`);

    // Process ALL results - no limit (deals are $20K+, AI costs are negligible)
    const topResults = results;

    for (const result of topResults) {
      // Skip if we already have narration for this domain
      if (matchNarrations[result.domain]) continue;

      try {
        // Get matched supply for this result
        const matchedSupply = selectedSupplyByDemandDomain[result.domain] || discoveredSupplyCompanies[0];

        // Generate AI narration
        const narration = await generateMatchNarration(
          aiConfig,
          {
            companyName: result.companyName,
            domain: result.domain,
            signals: [result.signalSummary, ...(result.matchReasons || [])],
            jobTitles: result.jobTitlesBeingHired,
            jobCount: result.jobCount,
            signalAge: undefined, // TODO: track signal age
            industry: detectIndustry(result.companyName, result.domain)
          },
          matchedSupply ? {
            name: matchedSupply.name || matchedSupply.domain,
            specialty: matchedSupply.specialty || matchedSupply.nicheExpertise
          } : undefined
        );

        if (narration) {
          setMatchNarrations(prev => ({ ...prev, [result.domain]: narration }));
          console.log(`[AIService] Narration: ${result.companyName} → ${narration.headline}`);
        }

        // Also generate signal stacking
        const signals = [
          { text: result.signalSummary, type: 'hiring' as const },
          ...(result.matchReasons || []).slice(0, 2).map(r => ({
            text: r,
            type: 'other' as const
          }))
        ];

        const stacked = await stackSignals(aiConfig, signals, result.companyName);
        if (stacked) {
          setStackedSignals(prev => ({ ...prev, [result.domain]: stacked }));
        }

        // Generate deal score if we have supply
        if (matchedSupply) {
          const score = await scoreDeal(
            aiConfig,
            {
              companyName: result.companyName,
              signals: [result.signalSummary, ...(result.matchReasons || [])],
              jobCount: result.jobCount
            },
            {
              name: matchedSupply.name || matchedSupply.domain,
              specialty: matchedSupply.specialty,
              matchScore: result.operatorFitScore
            }
          );
          if (score) {
            setDealScores(prev => ({ ...prev, [result.domain]: score }));
          }
        }
      } catch (err) {
        console.error(`[AIService] Narration failed for ${result.domain}:`, err);
      }
    }

    setIsGeneratingNarrations(false);
  };

  // Trigger narration generation when matching results are ready
  useEffect(() => {
    if (matchingResults.length > 0 && aiConfig && isAIConfigured(aiConfig)) {
      // Small delay to not block UI
      const timer = setTimeout(() => {
        generateNarrationsForResults(matchingResults);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [matchingResults.length, aiConfig]);

  // ============================================================================
  // BATCH INTRO GENERATION - Generate intros for all ready contacts in STATE 5
  // ============================================================================
  const batchIntroGenerationRef = useRef(false);
  const batchIntroRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const batchIntroStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedReadyCountRef = useRef(0); // Track last processed count

  useEffect(() => {
    const roleType = pressureDetection?.roleType;
    if (!roleType || roleType === 'unknown') return;

    const readyCount = getReadyCount(preEnrichedPools, roleType);
    const hasAI = aiConfig && isAIConfigured(aiConfig);
    const hasSupply = discoveredSupplyCompanies.length > 0;

    // Don't restart while actively generating - just track that more are available
    // The generation loop will pick up new contacts when it finishes
    if (batchIntroGenerationRef.current) {
      // Silently note new contacts arrived - don't restart
      if (readyCount > lastProcessedReadyCountRef.current) {
        console.log('[BatchIntros] New contacts ready while generating:', lastProcessedReadyCountRef.current, '→', readyCount, '(will process after current batch)');
      }
      return; // Don't restart - let current batch finish
    }

    // STATE 5 conditions: has ready contacts, AI configured, supply available, not already running
    if (readyCount > 0 && hasAI && hasSupply) {
      batchIntroGenerationRef.current = true;
      lastProcessedReadyCountRef.current = readyCount; // Track what we're processing

      console.log('[BatchIntros] ═══════════════════════════════════════════════');
      console.log('[BatchIntros] STATE 5 conditions met - generating batch intros');
      console.log('[BatchIntros] Ready count:', readyCount);
      console.log('[BatchIntros] Matching results:', matchingResults.length);
      console.log('[BatchIntros] Supply companies:', discoveredSupplyCompanies.length);
      console.log('[BatchIntros] First supply:', discoveredSupplyCompanies[0]?.name);

      // Get ALL ready contacts and generate intros for ALL of them
      const readyContacts = getReadyContacts(preEnrichedPools, roleType, readyCount);

      const generateBatchIntros = async () => {
        try {
        // ================================================================
        // STEP 1: Filter supply companies that have contact emails
        // ================================================================
        // Phase 2: Read from new state for supply contacts
        const suppliesWithContacts = discoveredSupplyCompanies.filter(s =>
          getSupplyContactState(s.domain).contact?.email
        );

        console.log('[BatchIntros] Supply companies with contacts:', suppliesWithContacts.length, '/', discoveredSupplyCompanies.length);

        if (suppliesWithContacts.length === 0 && discoveredSupplyCompanies.length > 0) {
          console.warn('[BatchIntros] ⚠️ No supply contacts have emails yet - using first provider for demand intros');
        }

        // ================================================================
        // STEP 1.5: Fetch company enrichment (pain points, competitors) in PARALLEL
        // ================================================================
        // LOCAL lookup object - merges existing state + newly fetched data
        // This avoids React state async issues
        const localEnrichmentLookup: Record<string, CompanyEnrichment | null> = { ...companyEnrichmentByDomain };

        if (isCompanyIntelConfigured(instantlyConfig)) {
          const domainsNeedingEnrichment = readyContacts
            .filter(c => !localEnrichmentLookup[c.domain])
            .map(c => c.domain);

          if (domainsNeedingEnrichment.length > 0) {
            console.log(`[BatchIntros] Fetching company enrichment for ${domainsNeedingEnrichment.length} domains...`);

            // Fetch all in parallel (fast)
            const enrichmentResults = await Promise.all(
              domainsNeedingEnrichment.map(async (domain) => {
                try {
                  const enrichment = await enrichDomain(domain, instantlyConfig.apiKey, user?.id);
                  return { domain, enrichment };
                } catch (err) {
                  console.warn(`[BatchIntros] Company enrichment failed for ${domain}:`, err);
                  return { domain, enrichment: null };
                }
              })
            );

            // Add to LOCAL lookup (immediate access) + prepare state update
            const newEnrichments: Record<string, CompanyEnrichment | null> = {};
            for (const { domain, enrichment } of enrichmentResults) {
              if (enrichment) {
                localEnrichmentLookup[domain] = enrichment; // LOCAL - immediate
                newEnrichments[domain] = enrichment;        // For state update
              }
            }

            // Update React state for UI (async, but we use localEnrichmentLookup below)
            if (Object.keys(newEnrichments).length > 0) {
              setCompanyEnrichmentByDomain(prev => ({ ...prev, ...newEnrichments }));
              console.log(`[BatchIntros] ✓ Enriched ${Object.keys(newEnrichments).length} companies with pain points/competitors`);
            }
          }
        } else {
          console.log('[BatchIntros] Skip company enrichment - Instantly API key not configured');
        }

        // ================================================================
        // STEP 2: Generate DEMAND intros (PARALLEL processing for speed)
        // ================================================================
        const PARALLEL_BATCH_SIZE = 5; // Process 5 intros at a time (reduced from 10 to prevent Azure rate limits)

        // Prepare all contacts that need intros
        // DEBUG: Log domain matching
        console.log('[BatchIntros] Ready contacts domains:', readyContacts.slice(0, 5).map(c => c.domain));
        console.log('[BatchIntros] Matching results domains:', matchingResults.slice(0, 5).map(r => r.domain));

        const contactsNeedingIntros = readyContacts.filter(contact => {
          // Phase 2: Read from new state (single source of truth)
          const state = getDemandState(contact.domain);
          if (state.demandIntro) {
            console.log('[BatchIntros] Skipping (already has intro):', contact.domain);
            return false;
          }
          const result = matchingResults.find(r => r.domain === contact.domain);
          if (!result) {
            console.log('[BatchIntros] Skipping (no matching result):', contact.domain);
          }
          return !!result;
        });

        console.log('[BatchIntros] Contacts needing intros:', contactsNeedingIntros.length);

        let totalGenerated = 0;
        let totalFailed = 0;
        const failedDomains: Array<{ contact: typeof contactsNeedingIntros[0]; provider: typeof discoveredSupplyCompanies[0] }> = [];

        // Process in parallel batches
        for (let batchStart = 0; batchStart < contactsNeedingIntros.length; batchStart += PARALLEL_BATCH_SIZE) {
          const batch = contactsNeedingIntros.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);

          console.log(`[BatchIntros] Processing batch ${Math.floor(batchStart / PARALLEL_BATCH_SIZE) + 1}/${Math.ceil(contactsNeedingIntros.length / PARALLEL_BATCH_SIZE)} (${batch.length} intros)`);

          // Generate all intros in this batch in parallel
          const introPromises = batch.map(async (contact, idx) => {
            const globalIdx = batchStart + idx;
            const result = matchingResults.find(r => r.domain === contact.domain);
            if (!result) return null;

            // Category-based matching: find best supply for this demand's category
            let provider = selectedSupplyByDemandDomain[contact.domain];
            if (!provider) {
              // Extract demand category from job titles
              const demandCategory = extractHireCategory(
                result.jobTitlesBeingHired?.[0] || '',
                result.jobTitlesBeingHired || []
              );

              // Build demand context for scoring
              const demandContext: DemandContext = {
                companyName: contact.companyName || contact.domain,
                domain: contact.domain,
                category: demandCategory,
                signalStrength: result.signalStrength,
              };

              // Find best matching supply by category
              const supplyPool = suppliesWithContacts.length > 0 ? suppliesWithContacts : discoveredSupplyCompanies;
              const scoredMatches = findScoredMatches(supplyPool, demandContext, 1);

              if (scoredMatches.length > 0) {
                provider = scoredMatches[0].supply;
                console.log(`[BatchIntros] Category match: ${contact.domain} (${demandCategory}) → ${provider.name}`);
              } else {
                // Fallback to first available if no category match
                provider = supplyPool[0];
                console.log(`[BatchIntros] No category match for ${contact.domain}, using first available: ${provider?.name}`);
              }
            }

            if (!provider?.name) return null;

            try {
              // Use niche-aware signal fallback
              const nicheSignalFallback = detectedNiche?.actionVerb
                ? `${detectedNiche.actionVerb}`
                : `${result.jobCount || 1} active signals`;

              const signalDetail = result.signalSummary || nicheSignalFallback;
              const firstName = (contact.name || '').split(' ')[0] || 'there';
              const providerSpecialty = provider.specialty || detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';

              // Step 1: Detect match context (2-5 words)
              const matchContext = await detectMatchContext(
                aiConfig,
                {
                  companyName: contact.companyName || contact.domain,
                  signalDetail
                },
                {
                  providerName: provider.name,
                  specialty: providerSpecialty
                }
              );

              // Step 2: Generate demand intro using anti-fragile approach (signal-based, no enrichment)
              const intro = await generateDemandIntroAntifragile(
                aiConfig,
                {
                  matchContext,
                  firstName,
                  companyName: contact.companyName || contact.domain,
                  signalDetail,
                  isCuratedList: result.isCuratedList
                },
                {
                  name: provider.name,
                  specialty: providerSpecialty
                }
              );

              if (intro && intro.length > 10) {
                return { domain: contact.domain, intro, provider, failed: false };
              } else {
                console.warn(`[BatchIntros] Empty/short intro for ${contact.domain}:`, intro ? `"${intro}" (${intro.length} chars)` : 'null/empty');
                return { domain: contact.domain, intro: null, provider, failed: true };
              }
            } catch (err) {
              const isTimeout = err instanceof Error && err.message.includes('timed out');
              console.error('[BatchIntros] ❌ Exception for', contact.domain, ':', err instanceof Error ? err.message : err, isTimeout ? '(will retry)' : '');
              return { domain: contact.domain, intro: null, provider, failed: true, isTimeout };
            }
          });

          // Wait for all intros in this batch
          const results = await Promise.all(introPromises);

          // Update state with all successful intros from this batch
          const successfulIntros: Record<string, string> = {};
          const successfulProviders: Record<string, typeof discoveredSupplyCompanies[0]> = {};

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r && r.intro && !r.failed) {
              successfulIntros[r.domain] = r.intro;
              successfulProviders[r.domain] = r.provider;
              console.log('[BatchIntros] ✓', r.domain);
            } else if (r && r.failed && r.isTimeout) {
              // Track timeout failures for retry
              failedDomains.push({ contact: batch[i], provider: r.provider });
            }
          }

          // Batch update state (more efficient)
          const batchSuccessCount = Object.keys(successfulIntros).length;
          const batchFailCount = batch.length - batchSuccessCount;
          totalGenerated += batchSuccessCount;
          totalFailed += batchFailCount;

          if (batchSuccessCount > 0) {
            // Phase 3: Dual-write for each successful intro
            for (const [domain, intro] of Object.entries(successfulIntros)) {
              setDemandIntro(domain, intro);
            }
            setSelectedSupplyByDemandDomain(prev => ({ ...prev, ...successfulProviders }));
          }

          console.log(`[BatchIntros] Batch complete: ${batchSuccessCount}/${batch.length} succeeded | Running total: ${totalGenerated}/${contactsNeedingIntros.length} (${totalFailed} failed)`);
        }

        // ================================================================
        // STEP 2.5: RETRY failed demand intros (timeout errors only)
        // ================================================================
        if (failedDomains.length > 0) {
          console.log(`[BatchIntros] Retrying ${failedDomains.length} timed-out domains after 2s delay...`);
          await new Promise(r => setTimeout(r, 2000)); // 2 second delay before retry

          for (const { contact, provider } of failedDomains) {
            const result = matchingResults.find(r => r.domain === contact.domain);
            if (!result) continue;

            try {
              // Use niche-aware signal fallback
              const nicheSignalFallback = detectedNiche?.actionVerb
                ? `${detectedNiche.actionVerb}`
                : `${result.jobCount || 1} active signals`;

              const signalDetail = result.signalSummary || nicheSignalFallback;
              const firstName = (contact.name || '').split(' ')[0] || 'there';
              const providerSpecialty = provider.specialty || detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';

              // Step 1: Detect match context (2-5 words)
              const matchContext = await detectMatchContext(
                aiConfig,
                {
                  companyName: contact.companyName || contact.domain,
                  signalDetail
                },
                {
                  providerName: provider.name,
                  specialty: providerSpecialty
                }
              );

              // Step 2: Generate demand intro using anti-fragile approach (signal-based, no enrichment)
              const intro = await generateDemandIntroAntifragile(
                aiConfig,
                {
                  matchContext,
                  firstName,
                  companyName: contact.companyName || contact.domain,
                  signalDetail,
                  isCuratedList: result?.isCuratedList
                },
                {
                  name: provider.name,
                  specialty: providerSpecialty
                }
              );

              if (intro && intro.length > 10) {
                // Phase 3: Use dual-write helper
                setDemandIntro(contact.domain, intro);
                setSelectedSupplyByDemandDomain(prev => ({ ...prev, [contact.domain]: provider }));
                totalGenerated++;
                totalFailed--;
                console.log('[BatchIntros] ✓ Retry succeeded:', contact.domain);
              }
            } catch (err) {
              console.error('[BatchIntros] ❌ Retry failed:', contact.domain, err instanceof Error ? err.message : err);
            }
          }
        }

        // ================================================================
        // STEP 3: Generate SUPPLY intros (PARALLEL processing)
        // Each supply gets intro about a DIFFERENT demand company
        // ================================================================
        console.log('[BatchIntros] Generating supply intros for', suppliesWithContacts.length, 'providers');

        let totalSupplyGenerated = 0;
        let totalSupplyFailed = 0;

        // Prepare supply intro tasks
        const supplyIntroTasks = [];
        for (let i = 0; i < suppliesWithContacts.length && i < readyContacts.length; i++) {
          const supply = suppliesWithContacts[i];
          const contact = readyContacts[i];
          const demandDomain = contact.domain;

          // Skip if supply intro already exists - Phase 2: Read from new state
          const demandState = getDemandState(demandDomain);
          if (demandState.supplyIntro) continue;

          const result = matchingResults.find(r => r.domain === demandDomain);
          if (!result) continue;

          supplyIntroTasks.push({ supply, contact, demandDomain, result });
        }

        // Process in parallel batches
        for (let batchStart = 0; batchStart < supplyIntroTasks.length; batchStart += PARALLEL_BATCH_SIZE) {
          const batch = supplyIntroTasks.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);

          const supplyPromises = batch.map(async ({ supply, contact, demandDomain, result }) => {
            // Phase 2: Read supply contact from new state
            const supplyContactState = getSupplyContactState(supply.domain);
            const supplyContact = supplyContactState.contact;
            // Use legacy hireCategory for backwards compatibility
            const hireCategory = result.jobTitlesBeingHired?.[0]?.toLowerCase().includes('engineer') ? 'engineering'
              : result.jobTitlesBeingHired?.[0]?.toLowerCase().includes('sales') ? 'sales'
              : result.jobTitlesBeingHired?.[0]?.toLowerCase().includes('market') ? 'marketing'
              : 'engineering';

            // Use niche-aware signal fallback
            const nicheSignalFallback = detectedNiche?.actionVerb
              ? `${detectedNiche.actionVerb}`
              : 'showing momentum';

            try {
              const signalDetail = result.signalSummary || nicheSignalFallback;
              const providerSpecialty = supply.specialty || detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';

              // Step 1: Detect match context (2-5 words)
              const matchContext = await detectMatchContext(
                aiConfig,
                {
                  companyName: contact.companyName || contact.domain,
                  signalDetail
                },
                {
                  providerName: supply.name,
                  specialty: providerSpecialty
                }
              );

              // Step 2: Generate supply intro using anti-fragile approach (signal-based, no enrichment)
              const supplyIntro = await generateSupplyIntroAntifragile(
                aiConfig,
                {
                  matchContext,
                  providerFirstName: supplyContact?.name?.split(' ')[0] || 'there',
                  providerCompany: supply.name
                },
                {
                  companyName: contact.companyName || contact.domain,
                  contactName: contact.name || 'the decision maker',
                  contactTitle: contact.title || 'decision maker',
                  signalDetail
                }
              );

              if (supplyIntro && supplyIntro.length > 10) {
                return { demandDomain, supplyIntro, supplyName: supply.name };
              } else {
                console.warn(`[BatchIntros] Empty/short supply intro for ${supply.name}:`, supplyIntro ? `"${supplyIntro}" (${supplyIntro.length} chars)` : 'null/empty');
              }
            } catch (err) {
              console.error('[BatchIntros] ❌ Supply exception for', supply.name, ':', err instanceof Error ? err.message : err);
            }
            return null;
          });

          const supplyResults = await Promise.all(supplyPromises);

          // Batch update state
          const successfulSupplyIntros: Record<string, string> = {};
          for (const r of supplyResults) {
            if (r) {
              successfulSupplyIntros[r.demandDomain] = r.supplyIntro;
              totalSupplyGenerated++;
              console.log('[BatchIntros] ✓ Supply intro for', r.supplyName);
            } else {
              totalSupplyFailed++;
            }
          }

          if (Object.keys(successfulSupplyIntros).length > 0) {
            // Phase 3: Dual-write for each successful supply intro
            for (const [domain, intro] of Object.entries(successfulSupplyIntros)) {
              setSupplyIntro(domain, intro);
            }
          }
        }

        console.log('[BatchIntros] ═══════════════════════════════════════════════');
        console.log(`[BatchIntros] COMPLETE:`);
        console.log(`  DEMAND: ${totalGenerated} generated, ${totalFailed} failed`);
        console.log(`  SUPPLY: ${totalSupplyGenerated} generated, ${totalSupplyFailed} failed`);
        console.log('[BatchIntros] ═══════════════════════════════════════════════');

        // Check if new contacts arrived while we were generating
        const currentReadyCount = getReadyCount(preEnrichedPools, roleType);
        if (currentReadyCount > lastProcessedReadyCountRef.current) {
          console.log(`[BatchIntros] ✓ New contacts arrived during generation: ${lastProcessedReadyCountRef.current} → ${currentReadyCount}`);
          // Reset ref to allow processing new contacts (with small delay to avoid rapid fire)
          batchIntroRetryTimeoutRef.current = setTimeout(() => {
            batchIntroGenerationRef.current = false;
          }, 2000);
        } else {
          // All done, keep ref true to prevent re-running for same contacts
          console.log('[BatchIntros] ✓ All contacts processed, no new arrivals');
        }

        // CRITICAL: Reset ref if we didn't generate all intros (allows retry)
        const targetCount = contactsNeedingIntros.length;
        if (totalGenerated < targetCount) {
          console.log(`[BatchIntros] ⚠️ Incomplete: ${totalGenerated}/${targetCount} - will retry in 10s`);
          // Reset ref after a delay to allow retry (store ref for cleanup)
          batchIntroRetryTimeoutRef.current = setTimeout(() => {
            batchIntroGenerationRef.current = false;
          }, 10000);
        }
        } catch (err) {
          console.error('[BatchIntros] ❌ FATAL ERROR in batch generation:', err);
          // Reset ref so it can be retried
          batchIntroGenerationRef.current = false;
        }
      };

      // Run with delay to not block UI (store ref for cleanup)
      batchIntroStartTimeoutRef.current = setTimeout(generateBatchIntros, 1000);
    }

    // Cleanup timeouts on unmount
    return () => {
      if (batchIntroRetryTimeoutRef.current) {
        clearTimeout(batchIntroRetryTimeoutRef.current);
      }
      if (batchIntroStartTimeoutRef.current) {
        clearTimeout(batchIntroStartTimeoutRef.current);
      }
    };
  }, [pressureDetection?.roleType, preEnrichedPools, aiConfig, discoveredSupplyCompanies.length, matchingResults]);

  useEffect(() => {
    if (activeResult && signals.jobs.metadata) {
      const insights = generateJobInsights(
        signals.jobs.metadata,
        trendDirection,
        sourcesCount,
        roleFilter,
        industryFilter
      );
      setJobInsights(insights);
    }
  }, [activeResultIndex, activeResult, signals.jobs.metadata, trendDirection, sourcesCount, roleFilter, industryFilter]);

  useEffect(() => {
    if (signals.jobs.metadata) {
      previousState.current = {
        ...previousState.current,
        trendDirection,
      } as any;
    }
  }, [signals.jobs.metadata, trendDirection]);

  function detectIndustry(companyName?: string | null, domain?: string | null): string {
    const name = safeLower(companyName);
    const host = safeLower(domain);

    if (name.includes('health') || name.includes('med') || name.includes('clinic') || name.includes('pharma')) {
      return 'Healthcare';
    }
    if (name.includes('bank') || name.includes('finance') || name.includes('capital')) {
      return 'FinTech';
    }
    if (name.includes('retail') || name.includes('store')) {
      return 'Retail';
    }
    if (name.includes('logistics') || name.includes('freight') || name.includes('transport')) {
      return 'Logistics';
    }
    if (name.includes('energy') || name.includes('climate') || name.includes('solar')) {
      return 'Energy';
    }

    if (host.endsWith('.ai')) return 'AI/ML';
    if (host.includes('saas')) return 'SaaS';
    if (host.includes('health')) return 'Healthcare';
    if (host.includes('bank') || host.includes('fin')) return 'FinTech';

    return 'Tech';
  }

  function extractCompanySize(job: any, jobCount?: number): number | null {
    if (job?.employer_company_size && typeof job.employer_company_size === 'number') {
      return job.employer_company_size;
    }
    if (job?.company_employees && typeof job.company_employees === 'number') {
      return job.company_employees;
    }

    const count = jobCount || 1;
    if (count < 5) return 50;
    if (count < 20) return 200;
    if (count < 50) return 500;
    return 1000;
  }

  function extractGeography(job: any): string {
    // Use universal extraction - handles ANY location format
    const extracted = extractJobLikeFields(job);
    let rawLocation = extracted.locationText;

    // Fallback to individual fields if locationText is empty
    if (!rawLocation) {
      const city = safeText(job?.job_city);
      const state = safeText(job?.job_state);
      const country = safeText(job?.job_country);
      rawLocation = [city, state, country].filter(Boolean).join(', ');
    }

    const locationLower = safeLower(rawLocation);

    if (locationLower.includes('united states') || locationLower.includes('usa') || locationLower.includes('us')) {
      return 'North America';
    }
    if (locationLower.includes('canada') || locationLower.includes('toronto') || locationLower.includes('vancouver')) {
      return 'North America';
    }
    if (locationLower.includes('remote')) {
      return 'Remote';
    }

    if (rawLocation) return rawLocation;

    return '';
  }

  function normalizeDomain(raw: unknown): string | null {
    if (raw == null) return null;
    const str = typeof raw === 'string' ? raw : String(raw);
    if (!str) return null;
    try {
      let d = str.trim();
      if (d.startsWith('http://') || d.startsWith('https://')) {
        const u = new URL(d);
        d = u.hostname;
      }
      return d.replace(/^www\./i, '');
    } catch {
      return str.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    }
  }

  const determineWindowStatus = (strength: number, momentum: string): string => {
    if (strength >= 60) return 'OPEN';
    if (strength >= 30) return 'WATCH';
    if (strength >= 10) return 'BUILDING';
    return 'EARLY';
  };

  const calculateMatching = (): MatchingResult[] => {
    // GUARD: Don't build companies until jobs data is actually ready
    const rawPayload = signals.jobs.rawPayload;
    const jobItems = rawPayload?.data ?? [];
    const datasetType = rawPayload?.datasetType || 'jobs_dataset';
    const isCuratedList = datasetType === 'curated_list';

    // DIAGNOSTIC: Log exactly what's failing
    console.log('[MatchingEngine] Data check:', {
      isLive: signals.jobs.isLive,
      hasRawPayload: !!rawPayload,
      rawPayloadKeys: rawPayload ? Object.keys(rawPayload) : [],
      jobItemsIsArray: Array.isArray(jobItems),
      jobItemsLength: jobItems.length,
      datasetType,
      isCuratedList,
      sampleItem: jobItems[0] ? JSON.stringify(jobItems[0]).slice(0, 200) : null
    });

    if (!signals.jobs.isLive || !Array.isArray(jobItems) || jobItems.length === 0) {
      console.log('[MatchingEngine] Jobs data not ready yet, skipping company build');
      return [];
    }

    const momentum = predictionResult.momentumDirection || 'Flat';
    const windowStatus = determineWindowStatus(signalStrength, momentum);

    const companySize = signals.jobs.metadata?.companySize;
    const fundingRound = signals.funding.metadata?.round;

    let signalType = 'jobs';
    if (signals.funding.isLive && signals.funding.value !== 'No data') {
      signalType = 'funding';
    } else if (signals.layoffs.isLive && signals.layoffs.value !== 'No data') {
      signalType = 'layoffs';
    } else if (signals.hiringVelocity.isLive && signals.hiringVelocity.value !== 'No data') {
      signalType = 'hiringVelocity';
    } else if (signals.toolAdoption.isLive && signals.toolAdoption.value !== 'No data') {
      signalType = 'tech';
    }

    const companies: { name: string; domain: string; jobCount: number; sampleJob?: any; allJobs: any[]; industry?: string; companySize?: number; geography?: string; jobTitles: string[] }[] = [];

    // DEFENSIVE: Ensure we have an array before iterating
    const safeJobItems = Array.isArray(jobItems) ? jobItems : [];

    if (safeJobItems.length > 0) {
      const companyMap = new Map<string, { name: string; count: number; sampleJob: any; allJobs: any[]; jobTitles: Set<string> }>();

      safeJobItems.forEach((job: any) => {
        // Use universal field extractor - handles ANY job object shape
        const extracted = extractJobLikeFields(job);
        const name = extracted.companyName;

        // Generate domain from URL or slugify company name
        let domain = extracted.companyUrl;
        if (!domain) {
          domain = safeLower(name).replace(/[^a-z0-9]/g, '') + '.com';
        }

        const key = safeLower(domain);
        const jobTitle = extracted.title;

        if (companyMap.has(key)) {
          const existing = companyMap.get(key)!;
          if (jobTitle) existing.jobTitles.add(jobTitle);
          existing.allJobs.push(job);
          companyMap.set(key, { ...existing, count: existing.count + 1 });
        } else {
          const titles = new Set<string>();
          if (jobTitle) titles.add(jobTitle);
          companyMap.set(key, { name, count: 1, sampleJob: job, allJobs: [job], jobTitles: titles });
        }
      });

      companyMap.forEach((value, domain) => {
        const normalizedDomain = normalizeDomain(domain);
        const industry = detectIndustry(value.name, normalizedDomain);
        const extractedSize = extractCompanySize(value.sampleJob, value.count);
        const geography = extractGeography(value.sampleJob);

        companies.push({
          name: value.name,
          domain: normalizedDomain || domain, // Use normalized domain (strips https://, www.)
          jobCount: value.count,
          sampleJob: value.sampleJob,
          allJobs: value.allJobs,
          industry,
          companySize: extractedSize ?? undefined,
          geography,
          jobTitles: Array.from(value.jobTitles), // Job titles being hired
        });
      });
    }

    // Log extracted companies
    console.log('[MatchingEngine] Built companies:', companies.length, companies.slice(0, 3));

    // If no companies extracted, return empty results - don't show fake placeholders
    if (companies.length === 0) {
      console.warn('[MatchingEngine] No companies extracted from signals.jobs.rawPayload.data');
      return [];
    }

    if (process.env.NODE_ENV === 'development') {
      console.groupCollapsed('[MatchingEngine] Match scoring - batch start');
      console.log('Total companies (raw):', companies.length);
      console.log('Connector profile used:', {
        services_offered: connectorProfile?.services_offered || [],
        industries_served: connectorProfile?.industries_served || [],
        solves_for_roles: connectorProfile?.solves_for_roles || [],
        pain_points_solved: connectorProfile?.pain_points_solved || [],
        ideal_company_size: connectorProfile?.ideal_company_size || null,
        geography: connectorProfile?.geography || [],
      });
      console.groupEnd();
    }

    const results: MatchingResult[] = companies.map((company, index) => {
      const whoHasPressureRoles = detectWhoHasPressure(
        { type: signalType, companySize, round: fundingRound },
        companySize
      );

      const topRole = whoHasPressureRoles[0] || 'CEO';
      const roleCount = whoHasPressureRoles.length;
      const whoHasPressure = roleCount > 1
        ? `${topRole} and ${roleCount - 1} other role${roleCount > 2 ? 's' : ''}`
        : topRole;

      const targetTitles = detectTargetTitles(whoHasPressureRoles);

      // NICHE-AGNOSTIC: Use detected niche or generic language
      const signalNoun = detectedNiche?.actionVerb || 'signal';
      const pressureProfile = company.jobCount > 1
        ? `${company.jobCount} ${signalNoun}s detected`
        : `${signalNoun} detected`;

      const whoCanSolve = provider.idealClient || 'Provider matching your profile';

      const timelineLabels = {
        EARLY: 'Early signal',
        BUILDING: 'Signal building',
        WATCH: 'Active signal',
        OPEN: 'Strong signal'
      };

      const suggestedTimeline = timelineLabels[windowStatus] || 'Signal detected';

      const { score: operatorFitScore, reasons: matchReasons, breakdown } = calculateMatchScoreForCompany(
        {
          whoRoles: whoHasPressureRoles,
          industry: company.industry ?? null,
          companySize: company.companySize ?? null,
          pressureType: signalType,
          geography: company.geography ?? null
        },
        connectorProfile
      );

      if (process.env.NODE_ENV === 'development') {
        console.groupCollapsed('[OperatorFit] Score for company:', company.name);
        console.log('Operator fit score:', operatorFitScore);
        console.log('Breakdown:', breakdown);
        console.log('Enriched company meta:', {
          industry: company.industry,
          companySize: company.companySize,
          geography: company.geography,
        });
        console.log('Raw data:', {
          whoRoles: whoHasPressureRoles || [],
          industry: company.industry ?? null,
          companySize: company.companySize ?? null,
          pressureType: signalType,
          geography: company.geography ?? null,
        });
        console.groupEnd();
      }

      const dealValueEstimate = estimateDealValue(
        company.companySize || 50,
        operatorFitScore,
        signalStrength
      );

      const probabilityOfClose = calculateProbability(
        operatorFitScore,
        signalStrength,
        windowStatus
      );

      const exactAngle = getConnectorAngle(topRole);

      // Calculate signal quality score
      const signalData: CompanySignalData = {
        domain: company.domain,
        companyName: company.name,
        signals: (company.allJobs || []).map((job: any) => ({
          title: extractJobLikeFields(job).title,
          raw: job,
        })),
        secondarySignals: {
          hasFunding: signals.funding.isLive && signals.funding.value !== 'No data',
          hasLayoffs: signals.layoffs.isLive && signals.layoffs.value !== 'No data',
        },
      };
      const qualityScore = scoreSignalQuality(signalData);

      // Generate signalSummary based on dataset type
      let signalSummary: string;
      if (isCuratedList) {
        // CURATED LIST MODE: Use industry/niche, not job signals
        // The match is implicit - user curated both sides
        const industry = company.industry || detectedNiche?.niche || 'your industry';
        signalSummary = `${industry} company`;
      } else {
        // JOBS/SIGNALS MODE: Reference the hiring signal
        signalSummary = detectedNiche?.actionVerb
          ? `${detectedNiche.actionVerb} at ${company.name}`
          : (company.jobCount > 1
            ? `${company.jobCount} signals at ${company.name}`
            : `Active at ${company.name}`);
      }

      return {
        id: `${company.domain}-${index}`,
        companyName: company.name,
        domain: company.domain,
        signalSummary,
        isCuratedList, // Pass through so intro generator knows the mode
        windowStatus,
        dealValueEstimate,
        probabilityOfClose,
        exactAngle,
        whoHasPressure,
        whoHasPressureRoles,  // WHO we contact
        targetTitles,
        jobTitlesBeingHired: company.jobTitles || [],  // WHAT is being hired (from signal)
        pressureProfile,
        whoCanSolve,
        suggestedTimeline,
        jobCount: company.jobCount,
        signalStrength,
        operatorFitScore,
        matchReasons,
        companySize: company.companySize || 50,
        signalType: signalType,
        qualityScore,
      };
    });

    const MATCH_THRESHOLD = 0;
    const filteredResults = results
      .filter((r) => (connectorProfile ? r.operatorFitScore >= MATCH_THRESHOLD : true))
      .sort((a, b) => {
        // Primary: Quality score (signal strength/freshness/density)
        if (b.qualityScore.total !== a.qualityScore.total) {
          return b.qualityScore.total - a.qualityScore.total;
        }
        // Secondary: Operator fit score (demand → operator)
        if (b.operatorFitScore !== a.operatorFitScore) return b.operatorFitScore - a.operatorFitScore;
        return (b.signalStrength || 0) - (a.signalStrength || 0);
      });

    if (process.env.NODE_ENV === 'development') {
      const allScores = results.map((r) => r.operatorFitScore ?? 0);
      const maxScore = allScores.length ? Math.max(...allScores) : 0;

      console.groupCollapsed('[OperatorFit] Batch scoring result');
      console.log('Total companies scored:', results.length);
      console.log('Threshold used:', MATCH_THRESHOLD);
      console.log('Companies passing threshold:', filteredResults.length);
      console.log('Highest operator fit score:', maxScore);
      console.groupEnd();
    }

    if (filteredResults.length === 0 && connectorProfile && process.env.NODE_ENV === 'development') {
      const allScores = results.map((r) => r.operatorFitScore ?? 0);
      const maxScore = allScores.length ? Math.max(...allScores) : 0;

      console.warn('[OperatorFit] No strong matches in this batch.', {
        threshold: MATCH_THRESHOLD,
        maxOperatorFitScore: maxScore,
        totalCompanies: results.length,
      });
    }

    return filteredResults;
  };

  // Track which snapshot we've processed to avoid infinite loops
  const processedSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      // Stage 5: Pipeline is the system - legacy matching removed
      if (!pipelineSnapshot) return;

      // Skip if we've already processed this snapshot
      if (processedSnapshotRef.current === pipelineSnapshot.runId) return;
      processedSnapshotRef.current = pipelineSnapshot.runId;

      console.log('[Stage 5] Processing pipeline snapshot:', pipelineSnapshot.runId);

      // Reset activeResultIndex if needed
      if (pipelineSnapshot.matches.length > 0 && activeResultIndex >= pipelineSnapshot.matches.length) {
        setActiveResultIndex(0);
      }

      // Stage 5: Add demand companies to trusted pools using snapshot entities
      const snapshotEntities = pipelineSnapshot.demandEntities || [];
      if (pressureDetection?.pressureDetected && pressureDetection.roleType !== 'unknown' && snapshotEntities.length > 0) {
        const roleType = pressureDetection.roleType;

        // Use functional update to avoid stale closure
        setTrustedDemandPools(currentPools => {
          let updatedPools = currentPools;
          for (const entity of snapshotEntities) {
            updatedPools = addDemandToPool(updatedPools, {
              domain: entity.company.domain || '',
              companyName: entity.company.name || '',
              pressureConfidence: pressureDetection.confidence === 'high' ? 90 : pressureDetection.confidence === 'medium' ? 70 : 50,
              roleType
            });
          }
          return updatedPools;
        });

        // Persist async (don't block UI)
        (async () => {
          try {
            if (isGuest) {
              // Will be handled by next render with updated pools
              console.log('[TrustedDemandPools] Guest mode - persisting later');
              return;
            }
            // AUTHED: persist to DB
            await supabase
              .from('operator_settings')
              .update({ trusted_demand_pools: trustedDemandPools })
              .eq('user_id', user!.id);
            console.log('[TrustedDemandPools] Updated pool for', roleType);
          } catch (err) {
            console.warn('[TrustedDemandPools] Failed to persist:', err);
          }
        })();
      }
    } catch (error) {
      console.error('[Pipeline] Error:', error);
    }
  }, [pipelineSnapshot, pressureDetection, isGuest, user, activeResultIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchingResults.length === 0) return;

      if (e.key === 'ArrowLeft' && activeResultIndex > 0) {
        setActiveResultIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && activeResultIndex < matchingResults.length - 1) {
        setActiveResultIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchingResults.length, activeResultIndex]);

  useEffect(() => {
    if (activeResult?.pressureProfile && activeResult.domain) {
      const personData = getDemandState(activeResult.domain).contact;
      if (!personData?.title) {
        setPersonPressureProfileByDomain(prev => ({
          ...prev,
          [activeResult.domain]: activeResult.pressureProfile
        }));
      }
    }
  }, [activeResult?.pressureProfile, activeResult?.domain, demandStates]);

  useEffect(() => {
    if (activeResult?.domain && isAIConfigured(aiConfig) && !aiWhyNowByDomain[activeResult.domain]) {
      generateWhyNowAndWhyYou(activeResult.domain);
    }
  }, [activeResult?.domain, aiConfig]);

  useEffect(() => {
    if (!activeResult) return;
    const personData = getDemandState(activeResult.domain).contact;
    const aiRewrittenIntro = aiRewrittenIntroByDomain[activeResult.domain];
    const finalIntro = finalIntroByDomain[activeResult.domain];
    const outboundReadiness = calculateOutboundReadiness(personData);
    if (outboundReadiness === 'ready' && aiRewrittenIntro && !finalIntro) {
      setFinalIntroByDomain(prev => ({ ...prev, [activeResult.domain]: aiRewrittenIntro }));
      setIntroUnlockedByDomain(prev => ({ ...prev, [activeResult.domain]: false }));
      console.log('[MatchingEngine] Auto-locked intro — contact became ready');
    }
  }, [activeResult?.domain, demandStates, aiRewrittenIntroByDomain, finalIntroByDomain]);

  useEffect(() => {
    if (!activeResult) return;

    const domain = activeResult.domain; // This is the DEMAND domain
    // Phase 4: Read from new state (single source of truth)
    const domainState = getDemandState(domain);
    const personData = domainState.contact;
    // Two-hop resolution: demand → selected supply → supply contact
    const selectedSupply = selectedSupplyByDemandDomain[domain];
    const supplyContact = selectedSupply ? getSupplyContactState(selectedSupply.domain).contact : null;
    const hasDemandIntro = domainState.demandIntro;
    const hasSupplyIntro = domainState.supplyIntro;

    // Check if we should generate intros
    const aiReady = aiConfig && isAIConfigured(aiConfig);
    const hasBasicData = activeResult.whoHasPressureRoles.length > 0 && personData && signalStrength > 0;

    if (!aiReady || !hasBasicData) return;

    // CASE 1: Neither intro exists - generate both (if not already attempted)
    if (!hasDemandIntro && !introGenerationAttemptedRef.current.has(domain)) {
      introGenerationAttemptedRef.current.add(domain);
      console.log('[MatchingEngine] Auto-generating dual intros for:', domain);
      generateDualIntros(domain);
      return;
    }

    // CASE 2: Demand exists but supply doesn't, AND we now have a supply contact
    // This handles the case where supply contact was enriched after initial intro generation
    if (hasDemandIntro && !hasSupplyIntro && supplyContact?.email && !isGeneratingSupplyIntro) {
      console.log('[MatchingEngine] Supply contact now available - generating supply intro for:', domain);
      generateDualIntros(domain); // Will skip demand (already exists), generate supply
    }
  }, [activeResult?.whoHasPressureRoles, activeResult?.domain, demandStates, selectedSupplyByDemandDomain, supplyContacts, signalStrength, aiConfig]);

  // AUTO-ENRICHMENT DISABLED - Option D: User controls token spend
  // Dataset fetch is FREE (just reading Apify data)
  // Enrichment costs tokens (Apollo/Anymail) - require manual trigger
  //
  // To enrich, user clicks "Enrich" button in the UI
  // This prevents surprise token burns on page refresh
  //
  // OLD AUTO-TRIGGER CODE (preserved for reference):
  /*
  useEffect(() => {
    const roleType = pressureDetection?.roleType;

    // Skip if no pressure detected or no roleType
    if (!pressureDetection?.pressureDetected || roleType === 'unknown') {
      return;
    }

    // Check which pipelines are available
    const hasCompanyIntel = isCompanyIntelConfigured(instantlyConfig);
    const hasContactEnrichment = isContactEnrichmentConfigured(enrichmentConfig);

    // If neither configured, log once and skip
    if (!hasCompanyIntel && !hasContactEnrichment) {
      console.log('[AutoEnrichment] Skip: neither Instantly nor Apollo/PDL configured');
      return;
    }

    // TRACK A: Company Intel (Instantly) - runs independently
    if (hasCompanyIntel) {
      // Trigger company intel for visible domains (runs in handleCompanyEnrichment)
      const visibleDomains = matchingResults.slice(0, 10).map(r => r.domain);
      visibleDomains.forEach(domain => {
        if (!companyEnrichmentByDomain[domain] && !isEnrichingCompanyByDomain[domain]) {
          handleCompanyEnrichment(domain);
        }
      });
      console.log('[CompanyIntel] Triggered for visible domains via Instantly');
    } else {
      console.log('[CompanyIntel] Skipped — Instantly key missing');
    }

    // TRACK B: Contact Enrichment (Apollo/PDL) - runs independently
    if (!hasContactEnrichment) {
      console.log('[ContactEnrichment] Skipped — No contact provider');
      return; // Only skip contact track, company intel already ran above
    }

    // Skip if already running
    if (isWorkerRunning(roleType)) {
      console.log(`[ContactEnrichment] Skip: worker already running for ${roleType}`);
      return;
    }

    // Skip if already auto-triggered this session for this role
    if (autoTriggeredRolesRef.current.has(roleType)) {
      return;
    }

    // Skip if no demand domains available for this roleType
    const demandDomains = getDomainsForRole(trustedDemandPools, roleType);
    if (demandDomains.length === 0) {
      console.log(`[ContactEnrichment] Skip: no demand domains for ${roleType}`);
      return;
    }

    // Check pool level - trigger if below 40% of capacity
    const currentCount = getReadyCount(preEnrichedPools, roleType);
    const REFILL_THRESHOLD = 40; // 40% of 100 capacity

    if (currentCount < REFILL_THRESHOLD) {
      console.log(`[ContactEnrichment] Pool low (${currentCount}/${REFILL_THRESHOLD}), refilling for ${roleType} via Apollo/PDL`);
      autoTriggeredRolesRef.current.add(pressureDetection.roleType);

      // Trigger enrichment silently (reuse existing logic)
      const enrichFn = createEnrichmentFunction();
      setIsPreparingPool(true);

      // Start long-wait timer (5s) for reassurance message
      if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
      longWaitTimerRef.current = setTimeout(() => {
        setShowLongWaitReassurance(true);
      }, 5000);

      startBackgroundEnrichment(
        pressureDetection.roleType,
        trustedDemandPools,
        preEnrichedPools,
        enrichFn,
        enrichmentConfig.anymailFinderApiKey,
        enrichmentConfig.ssmApiKey,
        (updatedPools) => {
          // Cancel long-wait timer when first contact arrives
          if (longWaitTimerRef.current) {
            clearTimeout(longWaitTimerRef.current);
            longWaitTimerRef.current = null;
          }

          // Track newly ready domains for highlight animation
          const currentReady = getReadyContacts(preEnrichedPools, pressureDetection.roleType);
          const newReady = getReadyContacts(updatedPools, pressureDetection.roleType);
          const currentDomains = new Set(currentReady.map(c => c.domain));
          const newDomains = newReady.filter(c => !currentDomains.has(c.domain)).map(c => c.domain);

          if (newDomains.length > 0) {
            setNewlyReadyDomains(prev => {
              const updated = new Set(prev);
              newDomains.forEach(d => updated.add(d));
              return updated;
            });
            // Remove highlight after 400ms
            setTimeout(() => {
              setNewlyReadyDomains(prev => {
                const updated = new Set(prev);
                newDomains.forEach(d => updated.delete(d));
                return updated;
              });
            }, 400);
          }

          setPreEnrichedPools(updatedPools);

          // Check for first contact arriving
          const newReadyCount = getReadyCount(updatedPools, pressureDetection.roleType);
          if (prevReadyCount === 0 && newReadyCount > 0) {
            setShowFirstContactPulse(true);
            setTimeout(() => setShowFirstContactPulse(false), 1500);
          }
          setPrevReadyCount(newReadyCount);

          // Persist silently
          (async () => {
            try {
              // GUEST: persist to localStorage
              if (isGuest) {
                localStorage.setItem('guest_pre_enriched_pools', JSON.stringify(updatedPools));
                return;
              }
              // AUTHED: persist to DB
              await supabase
                .from('operator_settings')
                .update({ pre_enriched_pools: updatedPools })
                .eq('user_id', user!.id);
            } catch (err) {
              console.warn('[AutoEnrichment] Failed to persist:', err);
            }
          })();
        },
        (progress) => {
          setEnrichmentWorkerProgress({
            roleType: progress.roleType,
            total: progress.totalToEnrich,
            completed: progress.enriched,
            succeeded: progress.succeeded,
          });

          if (progress.enriched >= progress.totalToEnrich) {
            setIsPreparingPool(false);
            setShowLongWaitReassurance(false);
            if (longWaitTimerRef.current) {
              clearTimeout(longWaitTimerRef.current);
              longWaitTimerRef.current = null;
            }
          }
        }
      );
    }
  }, [pressureDetection, enrichmentConfig, trustedDemandPools, preEnrichedPools]);
  */

  const getSignalStrengthColor = (strength: number) => {
    if (strength >= 70) return '#26F7C7';
    if (strength >= 40) return '#3A9CFF';
    return '#666666';
  };

  const getOperatorCue = () => {
    const companyCount = matchingResults.length;
    const totalRoles = matchingResults.reduce((sum, r) => sum + (r.jobCount || 0), 0);
    return `${companyCount} ${companyCount === 1 ? 'company' : 'companies'} with ${totalRoles} open ${totalRoles === 1 ? 'role' : 'roles'}`;
  };

  const getSuggestedIntro = (domain: string) => {
    const personData = getDemandState(domain).contact;
    const finalIntro = finalIntroByDomain[domain];
    const aiRewrittenIntro = aiRewrittenIntroByDomain[domain];
    const outboundReadiness = calculateOutboundReadiness(personData);
    if (finalIntro && outboundReadiness === 'ready') {
      return finalIntro;
    }

    if (aiRewrittenIntro) {
      return aiRewrittenIntro;
    }

    if (isRewritingIntro) {
      return 'Writing message…';
    }

    return '';
  };

  const handleAiRewriteIntro = async (domain: string) => {
    // AI requires config (works for both guest + auth if keys are set)
    if (!aiConfig || !isAIConfigured(aiConfig)) {
      showToast('warning', 'Set up API keys in Settings first.');
      return;
    }

    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = getDemandState(domain).contact;
    const personPressureProfile = personPressureProfileByDomain[domain];
    const primaryRole = result.whoHasPressureRoles[0] || 'CEO';
    const need = provider.servicesDelivered[0] || 'operational excellence';

    const cacheKey = `${result.signalSummary}-${personData?.name || primaryRole}-${personData?.title || ''}`;

    if (rewriteCache.has(cacheKey)) {
      const cached = rewriteCache.get(cacheKey)!;
      setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: cached }));

      const outboundReadiness = calculateOutboundReadiness(personData);
      if (outboundReadiness === 'ready') {
        setFinalIntroByDomain(prev => ({ ...prev, [domain]: cached }));
        setIntroUnlockedByDomain(prev => ({ ...prev, [domain]: false }));
      }
      return;
    }

    setIsRewritingIntro(true);

    try {
      const windowStatus = result.windowStatus;
      const signalContext = result.signalSummary;

      const firstName = personData?.name?.split(' ')[0] || primaryRole;

      let primarySignalSummary = '';
      let actualSignalType = 'jobs';

      const signalContextLower = safeLower(signalContext);
      if (result.jobCount && result.jobCount > 0) {
        const roleWord = result.jobCount === 1 ? 'role' : 'roles';
        primarySignalSummary = `${result.jobCount} open ${roleWord}`;
        actualSignalType = 'jobs';
      } else if (signalContextLower.includes('funding') || signalContextLower.includes('raised')) {
        primarySignalSummary = 'fresh funding round';
        actualSignalType = 'funding';
      } else if (signalContextLower.includes('layoff')) {
        primarySignalSummary = 'recent team changes';
        actualSignalType = 'layoffs';
      } else {
        primarySignalSummary = typeof signalContext === 'string' ? signalContext : '';
        actualSignalType = 'jobs';
      }

      let connectorValue = 'extra help';
      if (connectorProfile?.services_offered && connectorProfile.services_offered.length > 0) {
        const service = safeLower(connectorProfile.services_offered[0]);
        if (service.includes('sales')) {
          connectorValue = 'extra sales capacity';
        } else if (service.includes('ops')) {
          connectorValue = 'vetted ops operators';
        } else if (service.includes('implementation') || service.includes('saas')) {
          connectorValue = 'implementation specialists';
        } else {
          connectorValue = `${service} help`;
        }
      } else if (connectorProfile?.pain_points_solved && connectorProfile.pain_points_solved.length > 0) {
        connectorValue = safeLower(connectorProfile.pain_points_solved[0]);
      }

      const originalIntro = `hey ${safeLower(firstName)} — saw ${primarySignalSummary}, i can connect you with ${connectorValue}, want a quick look?`;

      const companyName = result.companyName;

      const rewritten = await rewriteIntro(originalIntro, aiConfig, {
        personFirstName: firstName,
        personFullName: personData?.name,
        personTitle: personData?.title || primaryRole,  // Person we're contacting (for messaging)
        companyName: companyName,
        companyDomain: result.domain,
        signalType: actualSignalType,
        signalSummary: primarySignalSummary,
        roleCount: result.jobCount || 1,
        windowStatus: windowStatus,
        pressureProfile: personPressureProfile || result.pressureProfile,
        jobTitlesBeingHired: result.jobTitlesBeingHired || [],  // Job titles FROM SIGNAL for connector selection
        connectorProfile: connectorProfile || undefined,
        campaignMode: campaignMode
      });

      const finalIntro = rewritten && rewritten.trim() !== '' ? rewritten : originalIntro;

      setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: finalIntro }));

      const newCache = new Map(rewriteCache);
      newCache.set(cacheKey, finalIntro);
      setRewriteCache(newCache);

      const outboundReadiness = calculateOutboundReadiness(personData);
      if (outboundReadiness === 'ready') {
        setFinalIntroByDomain(prev => ({ ...prev, [domain]: finalIntro }));
        setIntroUnlockedByDomain(prev => ({ ...prev, [domain]: false }));
        console.log('[MatchingEngine] Intro locked — ready to send');
      }
    } catch (error) {
      console.error('Error rewriting intro:', error);
      showToast('error', 'Rewrite failed. Check Settings and try again.');
    } finally {
      setIsRewritingIntro(false);
    }
  };

  const handleRegenerateIntro = (domain: string) => {
    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = getDemandState(domain).contact;
    const primaryRole = result.whoHasPressureRoles[0] || 'CEO';

    // Clear the cache entry to force a new generation
    const cacheKey = `${result.signalSummary}-${personData?.name || primaryRole}-${personData?.title || ''}`;
    setRewriteCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(cacheKey);
      return newCache;
    });

    setFinalIntroByDomain(prev => ({ ...prev, [domain]: '' }));
    setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: '' }));
    // Phase 3: Use dual-write helpers for clearing intros
    setDemandIntro(domain, null);
    setSupplyIntro(domain, null);
    setIntroUnlockedByDomain(prev => ({ ...prev, [domain]: true }));

    // Clear the attempted guard so regeneration is allowed
    introGenerationAttemptedRef.current.delete(domain);
    console.log('[MatchingEngine] Clearing intro and cache for regeneration');

    setTimeout(() => {
      // Re-add to attempted set before calling
      introGenerationAttemptedRef.current.add(domain);
      generateDualIntros(domain);
    }, 100);
  };

  // Generate both demand and supply intros for a domain
  const generateDualIntros = async (domain: string) => {
    // ==========================================================================
    // ANTI-FRAGILE INTRO GENERATION (3-Step Method)
    // ==========================================================================
    // Step 1: Detect match context (2-5 words)
    // Step 2: Generate demand intro (3 sentences)
    // Step 3: Generate supply intro (3 sentences)
    // NO Instantly enrichment - focus on SIGNAL data only
    // ==========================================================================

    // AI requires config (works for both guest + auth if keys are set)
    if (!aiConfig || !isAIConfigured(aiConfig)) {
      console.log('[DualIntros] AI not configured, skipping intro generation');
      return;
    }

    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = getDemandState(domain).contact;
    // Only require email - name can be extracted from email if missing
    if (!personData?.email) {
      console.log('[DualIntros] No email found, skipping intro generation');
      return;
    }
    // Ensure we have a name - use email prefix as fallback
    const contactName = personData.name || personData.email.split('@')[0];

    // Get the selected PROVIDER for this demand domain
    const selectedProvider = selectedSupplyByDemandDomain[domain] || discoveredSupplyCompanies[0];
    // Phase 2: Read from new state for supply contact
    const supplyContactForIntro = selectedProvider ? getSupplyContactState(selectedProvider.domain).contact : null;

    // VALIDATION: Skip if no valid provider
    if (!selectedProvider?.name || selectedProvider.name === 'Unknown') {
      console.warn('[DualIntros] ⚠️ SKIPPING - No valid provider name available');
      return;
    }

    // Build signal detail from actual data (NOT from Instantly enrichment)
    const signalDetail = result.signalSummary || (detectedNiche?.actionVerb
      ? `${detectedNiche.actionVerb}`
      : `${result.jobCount || 0} active signals`);

    console.log('[DualIntros] ═══════════════════════════════════════════════');
    console.log('[DualIntros] ANTI-FRAGILE: Generating intros for:', domain);
    console.log('[DualIntros] Signal:', signalDetail);
    console.log('[DualIntros] Provider:', selectedProvider.name);
    console.log('[DualIntros] ═══════════════════════════════════════════════');

    // Check if demand intro already exists - Phase 2: Read from new state
    const introState = getDemandState(domain);
    const existingDemandIntro = introState.demandIntro;
    const existingSupplyIntro = introState.supplyIntro;

    // If both exist, skip
    if (existingDemandIntro && existingSupplyIntro) {
      console.log('[DualIntros] Both intros already exist, skipping');
      return;
    }

    setIsGeneratingDemandIntro(true);
    setIsGeneratingSupplyIntro(true);

    try {
      // Use the combined anti-fragile function (3 steps internally)
      const { demandIntro, supplyIntro, matchContext } = await generateIntrosAntifragile(
        aiConfig,
        {
          companyName: result.companyName,
          signalDetail,
          contactFirstName: contactName.split(' ')[0],
          contactName: contactName,
          contactTitle: personData.title || 'decision maker',
        },
        {
          providerName: selectedProvider.name,
          providerSpecialty: selectedProvider.specialty || selectedProvider.nicheExpertise || 'helps companies like yours',
          contactFirstName: supplyContactForIntro?.name?.split(' ')[0] || 'there',
        }
      );

      console.log('[DualIntros] Match context:', matchContext);

      // Update demand intro (if generated and not already existing)
      // Phase 3: Use dual-write helper
      if (demandIntro && !existingDemandIntro) {
        setDemandIntro(domain, demandIntro);
        setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
        console.log('[DualIntros] ✓ Demand intro:', demandIntro);
      }

      // Update supply intro (if generated, has supply contact, and not already existing)
      // Phase 3: Use dual-write helper
      if (supplyIntro && supplyContactForIntro?.email && !existingSupplyIntro) {
        setSupplyIntro(domain, supplyIntro);
        console.log('[DualIntros] ✓ Supply intro:', supplyIntro);
      } else if (!supplyContactForIntro?.email) {
        console.log('[DualIntros] SKIPPING supply intro - no supply contact email');
      }

    } catch (error) {
      console.error('[DualIntros] Anti-fragile generation failed:', error);
    } finally {
      setIsGeneratingDemandIntro(false);
      setIsGeneratingSupplyIntro(false);
    }
  };

  // Individual regenerate functions for demand and supply intros
  // Added minimum delay to prevent UI glitching from fast state changes
  const regenerateDemandIntro = async (domain: string) => {
    // AI requires config (works for both guest + auth if keys are set)
    if (!aiConfig || !isAIConfigured(aiConfig)) return;

    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = getDemandState(domain).contact;
    if (!personData?.name) return;

    // Get the selected provider (like Toptal) for this demand domain
    // FALLBACK: Use first discovered supply company if none specifically selected
    const selectedProvider = selectedSupplyByDemandDomain[domain] || discoveredSupplyCompanies[0];

    // READINESS GATE: Cannot generate intro without a real provider
    if (!selectedProvider?.name || selectedProvider.name === 'Unknown') {
      console.warn('[DualIntros] Cannot regenerate demand intro - no valid provider');
      return;
    }

    // Use niche-aware specialty fallback
    const nicheSpecialty = detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';
    const provider = {
      name: selectedProvider.name,
      company: selectedProvider.name,
      specialty: selectedProvider.specialty || selectedProvider.nicheExpertise || nicheSpecialty,
    };

    const firstName = personData.name.split(' ')[0];
    // Use niche-aware signal fallback
    const nicheSignalFallback = detectedNiche?.actionVerb || 'showing momentum';
    const signalDetail = result.signalSummary || nicheSignalFallback;

    setIsGeneratingDemandIntro(true);

    try {
      // Step 1: Detect match context (2-5 words)
      const matchContext = await detectMatchContext(
        aiConfig,
        {
          companyName: result.companyName,
          signalDetail
        },
        {
          providerName: provider.name,
          specialty: provider.specialty
        }
      );

      // Step 2: Generate demand intro using anti-fragile approach (signal-based, no enrichment)
      const [demandIntro] = await Promise.all([
        generateDemandIntroAntifragile(
          aiConfig,
          {
            matchContext,
            firstName,
            companyName: result.companyName,
            signalDetail,
            isCuratedList: result.isCuratedList
          },
          {
            name: provider.name,
            specialty: provider.specialty
          }
        ),
        new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
      ]);
      // Phase 3: Use dual-write helper
      setDemandIntro(domain, demandIntro);
      setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
      console.log('[DualIntros] Demand intro regenerated:', demandIntro);
    } catch (error) {
      console.error('[DualIntros] Demand intro failed:', error);
    } finally {
      setIsGeneratingDemandIntro(false);
    }
  };

  const regenerateSupplyIntro = async (domain: string) => {
    // AI requires config (works for both guest + auth if keys are set)
    if (!aiConfig || !isAIConfigured(aiConfig)) return;

    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = getDemandState(domain).contact;
    if (!personData?.name) return;

    // Get the selected provider (Toptal, Terminal, etc.) for this demand domain
    const selectedProvider = selectedSupplyByDemandDomain[domain];
    // Phase 2: Read from new state - two-hop resolution: use selectedProvider's domain to get supply contact
    const supplyContactForIntro = selectedProvider ? getSupplyContactState(selectedProvider.domain).contact : null;

    // CRITICAL GATE: Only regenerate if we have a valid supply contact with email
    if (!supplyContactForIntro || !supplyContactForIntro.email) {
      console.log('[DualIntros] Cannot regenerate supply intro - no supply contact found for demand:', domain);
      return;
    }

    // Use actual company name from the contact (from Apollo) - more accurate than selectedProvider
    const actualProviderName = supplyContactForIntro.company;
    console.log('[DualIntros] Regenerating supply intro for provider:', actualProviderName, 'contact:', supplyContactForIntro.name);

    // Niche-aware fallbacks
    const nicheSignalFallback = detectedNiche?.actionVerb || 'showing momentum';
    const nicheFitReason = detectedNiche
      ? `${result.companyName} is ${detectedNiche.actionVerb}`
      : `${result.companyName} is showing activity`;

    const signalDetail = result.signalSummary || nicheSignalFallback;

    setIsGeneratingSupplyIntro(true);

    try {
      const providerSpecialty = selectedProvider?.specialty || detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';

      // Step 1: Detect match context (2-5 words)
      const matchContext = await detectMatchContext(
        aiConfig,
        {
          companyName: result.companyName,
          signalDetail
        },
        {
          providerName: actualProviderName,
          specialty: providerSpecialty
        }
      );

      // Step 2: Generate supply intro using anti-fragile approach (signal-based, no enrichment)
      const [supplyIntro] = await Promise.all([
        generateSupplyIntroAntifragile(
          aiConfig,
          {
            matchContext,
            providerFirstName: supplyContactForIntro.name?.split(' ')[0] || 'there',
            providerCompany: actualProviderName
          },
          {
            companyName: result.companyName,
            contactName: personData.name,
            contactTitle: personData.title || 'decision maker',
            signalDetail
          }
        ),
        new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
      ]);
      // Phase 3: Use dual-write helper
      setSupplyIntro(domain, supplyIntro);
      console.log('[DualIntros] Supply intro regenerated for', supplyContactForIntro.name, 'at', actualProviderName, ':', supplyIntro);
    } catch (error) {
      console.error('[DualIntros] Supply intro failed:', error);
    } finally {
      setIsGeneratingSupplyIntro(false);
    }
  };

  const generateWhyNowAndWhyYou = async (domain: string) => {
    // AI requires config (works for both guest + auth if keys are set)
    const result = matchingResults.find(r => r.domain === domain);
    if (!result || !isAIConfigured(aiConfig)) return;

    try {
      const sampleJob = signals.jobs.rawPayload?.data?.find((job: any) => {
        const jobDomain = job.employer_website || job.company_website || '';
        return jobDomain.includes(result.domain) || result.domain.includes(jobDomain);
      });

      const whyNowPromise = generateWhyNow(aiConfig, {
        companyName: result.companyName,
        jobTitle: sampleJob?.job_title,
        jobDescription: sampleJob?.job_description,
        roleCount: result.jobCount || 1,
        companySize: result.companySize || 50,
        signalType: result.signalType
      });

      const primaryRole = result.whoHasPressureRoles[0] || 'CEO';
      const whyYouPromise = generateWhyYou(aiConfig, {
        buyerTitle: primaryRole,
        companyName: result.companyName,
        jobTitle: sampleJob?.job_title,
        jobDescription: sampleJob?.job_description,
        connectorServices: connectorProfile?.services_offered
      });

      const [whyNow, whyYou] = await Promise.all([whyNowPromise, whyYouPromise]);

      setAiWhyNowByDomain(prev => ({ ...prev, [domain]: whyNow }));
      setAiWhyYouByDomain(prev => ({ ...prev, [domain]: whyYou }));
    } catch (error) {
      console.error('[MatchingEngine] Failed to generate Why Now/Why You:', error);
    }
  };

  // =========================================================================
  // SUPPLY CONFIRMATION FLOW (Option B)
  // =========================================================================

  /**
   * Check if a person looks like a decision-maker who could be a supplier contact
   */
  const looksLikeSupplierContact = (title: string): boolean => {
    const supplierTitles = /\b(ceo|coo|cfo|founder|owner|partner|director|head|vp|vice president|president|managing|principal|recruiter|talent|staffing|hr |human resources)\b/i;
    return supplierTitles.test(title || '');
  };

  /**
   * Confirm a person as a supplier and create SupplyCompany
   */
  const confirmAsSupplier = () => {
    if (!pendingSupplyConfirmation) return;

    const { domain, companyName, contactName, contactEmail, contactTitle, hireCategory } = pendingSupplyConfirmation;

    // Create new SupplyCompany from confirmed contact
    const newSupplyCompany: SupplyCompany = {
      name: companyName,
      domain: domain,
      description: `Confirmed supplier - ${contactTitle}`,
      hireCategory: hireCategory,
      classification: {
        role: 'supply',
        confidence: 'high',
        hireCategory: hireCategory,
        signals: ['user_confirmed_inference'],
      },
      raw: { source: 'user_confirmed_inference', confirmedAt: new Date().toISOString() },
      existingContact: {
        name: contactName,
        email: contactEmail,
        title: contactTitle,
      },
    };

    // Add to discovered supply companies
    setDiscoveredSupplyCompanies(prev => {
      // Don't add duplicates
      if (prev.some(s => s.domain === domain)) return prev;
      return [...prev, newSupplyCompany];
    });

    showToast('success', `${companyName} confirmed as supplier`);
    setPendingSupplyConfirmation(null);
    console.log(`[Supply] User confirmed ${companyName} as supplier (source: user_confirmed_inference)`);
  };

  /**
   * Dismiss the supply confirmation prompt
   */
  const dismissSupplyConfirmation = () => {
    setPendingSupplyConfirmation(null);
  };

  // Enrich supply contact (person at dynamically discovered supply company)
  const enrichSupplyContact = async (companyDomain: string, result: MatchingResult, specificSupply?: SupplyCompany): Promise<{ contact: SupplyContact | null; supply: SupplyCompany | null }> => {
    // Determine hire category from job titles being hired
    const hireCategory = extractHireCategory(
      result.jobTitlesBeingHired?.map(t => ({ title: t })),
      result.signalSummary
    );

    // Find matching supply companies from discovered list
    let selectedSupply: SupplyCompany | null = null;
    let alternatives: SupplyCompany[] = [];

    if (specificSupply) {
      // User chose a specific supply company
      selectedSupply = specificSupply;
      alternatives = discoveredSupplyCompanies.filter(s => s.domain !== specificSupply.domain);
    } else {
      // AI-POWERED MATCHING: Let AI pick the best suppliers (no keyword restrictions)
      let matches: SupplyCompany[] = [];

      if (isAIConfigured(aiConfig) && discoveredSupplyCompanies.length > 0) {
        const aiMatches = await aiMatchSuppliers(
          aiConfig,
          {
            companyName: result.companyName,
            domain: result.domain,
            signal: result.signalSummary || (detectedNiche?.actionVerb
              ? `${detectedNiche.actionVerb}`
              : `${result.jobCount || 1} active signals`),
            industry: companyEnrichmentByDomain[result.domain]?.industry,
          },
          discoveredSupplyCompanies.map(s => ({
            name: s.name,
            domain: s.domain,
            description: s.description,
            specialty: s.specialty,
          })),
          5
        );

        // Convert AI matches back to SupplyCompany objects
        matches = aiMatches
          .map(m => discoveredSupplyCompanies.find(s => s.domain === m.domain))
          .filter((s): s is SupplyCompany => !!s);

        // Store AI match reasoning
        if (aiMatches.length > 0) {
          console.log('[SupplyMatch] AI matches:', aiMatches.map(m => `${m.name} (${m.reason})`).join(' | '));

          // Create scored matches format for compatibility
          const scoredMatches: ScoredSupplyMatch[] = aiMatches.map((m, i) => ({
            supply: discoveredSupplyCompanies.find(s => s.domain === m.domain)!,
            score: 100 - (i * 10), // AI ranks by relevance, so assign descending scores
            factors: { aiMatched: true },
            matchNarration: m.reason,
            reasoning: m.reason,
          })).filter(m => m.supply);

          if (scoredMatches.length > 0) {
            setAllScoredMatchesByDomain(prev => ({
              ...prev,
              [result.domain]: scoredMatches
            }));
            setSupplyMatchScoreByDomain(prev => ({
              ...prev,
              [result.domain]: scoredMatches[0].score
            }));
            setMatchReasoningByDemandDomain(prev => ({
              ...prev,
              [result.domain]: scoredMatches[0].reasoning
            }));
          }
        }
      }

      if (matches.length === 0) {
        console.log('[SupplyEnrich] AI matching returned no results');
        if (discoveredSupplyCompanies.length === 0) {
          showToast('info', 'No providers loaded. Add a Supply dataset in Settings to enable two-sided matching.');
        } else {
          showToast('info', 'Matching paused — check Settings');
        }
        return { contact: null, supply: null };
      }

      // Apply quality ranking when pressure is detected
      if (pressureDetection?.pressureDetected) {
        const rankedMatches = rankSupplyProviders(matches, {
          pressureDetection,
          demandCategory: hireCategory
        });
        matches = rankedMatches;
        console.log('[SupplyEnrich] Ranked by quality:', matches.map(m => `${m.name} (${m.qualityScore})`).join(', '));

        // Update trusted supply pools (fire-and-forget persist)
        const roleType = pressureDetection.roleType;
        const updatedPools = updatePoolForRole(trustedSupplyPools, roleType, rankedMatches);
        setTrustedSupplyPools(updatedPools);

        // Persist async (don't block UI)
        (async () => {
          try {
            // GUEST: persist to localStorage
            if (isGuest) {
              localStorage.setItem('guest_trusted_supply_pools', JSON.stringify(updatedPools));
              console.log('[TrustedPools] Saved to localStorage for guest');
              return;
            }
            // AUTHED: persist to DB
            await supabase
              .from('operator_settings')
              .update({ trusted_supply_pools: updatedPools })
              .eq('user_id', user!.id);
            console.log('[TrustedPools] Updated pool for', roleType, '- total:', updatedPools[roleType]?.providers.length || 0);
          } catch (err) {
            console.warn('[TrustedPools] Failed to persist:', err);
          }
        })();

        // Apply tier-aware rotation to distribute intros
        const eligibleDomains = rankedMatches.map(m => m.domain);
        const rotationResult = getNextRotatedProvider(updatedPools, roleType, eligibleDomains);

        if (rotationResult) {
          // Find the matching company from ranked matches
          const rotatedMatch = rankedMatches.find(m => m.domain === rotationResult.provider.domain);
          if (rotatedMatch) {
            selectedSupply = rotatedMatch;
            alternatives = rankedMatches.filter(m => m.domain !== rotatedMatch.domain);
            setRotationAppliedByDomain(prev => ({ ...prev, [companyDomain]: rotationResult.rotationApplied }));
            console.log('[SupplyEnrich] Rotation:', rotationResult.reason);
          } else {
            // Fallback if rotation result not in matches
            selectedSupply = matches[0];
            alternatives = matches.slice(1);
            setRotationAppliedByDomain(prev => ({ ...prev, [companyDomain]: false }));
          }
        } else {
          // No rotation result, use first match
          selectedSupply = matches[0];
          alternatives = matches.slice(1);
          setRotationAppliedByDomain(prev => ({ ...prev, [companyDomain]: false }));
        }
      } else {
        // No pressure detected, use first match
        selectedSupply = matches[0];
        alternatives = matches.slice(1);
        setRotationAppliedByDomain(prev => ({ ...prev, [companyDomain]: false }));
      }
    }

    // Check if we have Apollo API key
    const apolloKey = enrichmentConfig?.apiKey;
    if (!apolloKey) {
      console.log('[SupplyEnrich] No Apollo API key, skipping supply enrichment');
      return { contact: null, supply: selectedSupply };
    }

    // Build list of supply companies to try
    // If user explicitly selected a provider, ONLY try that one (no fallback)
    // If auto-selected, try selected + alternatives as fallback
    const suppliesToTry = specificSupply
      ? [selectedSupply].filter(Boolean) as SupplyCompany[]  // No fallback for explicit selection
      : [selectedSupply, ...alternatives].filter(Boolean) as SupplyCompany[];

    console.log(`[SupplyEnrich] Will try ${suppliesToTry.length} supply companies: ${suppliesToTry.map(s => s.name).join(' → ')}${specificSupply ? ' (explicit selection, no fallback)' : ''}`);

    // Track enrichment status by demand domain (for UI state)
    setIsEnrichingSupplyByDomain(prev => ({ ...prev, [companyDomain]: true }));

    // === SUPPLY FALLBACK LOOP ===
    // Try each supply company until we find a contact with email
    let foundContact: SupplyContact | null = null;
    let successfulSupply: SupplyCompany | null = null;

    for (const supply of suppliesToTry) {
      // Check if domain looks auto-generated (no website in dataset)
      const looksAutoGenerated = supply.domain &&
        !supply.domain.includes('.') ||
        (supply.domain.endsWith('.com') && supply.domain.split('.').length === 2 &&
         supply.domain.replace('.com', '').length > 15);

      if (looksAutoGenerated) {
        console.warn(`[SupplyEnrich] ⚠️ Domain "${supply.domain}" looks auto-generated. Your Apify dataset may be missing website/url field.`);
      }

      console.log(`[SupplyEnrich] Trying supply: ${supply.name} (${supply.domain})`);

      // Update UI to show which supply company we're searching
      setSelectedSupplyByDemandDomain(prev => ({ ...prev, [companyDomain]: supply }));

      try {
        // =====================================================================
        // STEP A: CHECK IF APIFY ALREADY HAS A COMPLETE CONTACT (NO ENRICHMENT)
        // =====================================================================
        const apifyContact = supply.existingContact;
        const hasUsableApifyContact = apifyContact &&
          typeof apifyContact.email === 'string' &&
          apifyContact.email.includes('@') &&
          typeof apifyContact.name === 'string' &&
          apifyContact.name.length > 0;

        let supplyContact: SupplyContact | null = null;

        if (hasUsableApifyContact) {
          // USE APIFY CONTACT DIRECTLY - NO ENRICHMENT NEEDED
          console.log(`[SupplyEnrich] ✓ Using Apify contact directly: ${apifyContact.name} (${apifyContact.email})`);
          supplyContact = {
            name: apifyContact.name,
            email: apifyContact.email,
            title: apifyContact.title || 'Contact',
            linkedin: apifyContact.linkedin,
            company: supply.name,
            domain: supply.domain,
            confidence: 95, // High confidence - direct from dataset
          };
        } else {
          // =====================================================================
          // STEP B: CONDITIONAL ENRICHMENT (ONLY IF APIFY DATA INCOMPLETE)
          // =====================================================================
          console.log(`[SupplyEnrich] Apify contact incomplete, enriching ${supply.name}...`);

          // Get appropriate titles for this supply company's category (niche-aware)
          const searchTitles = getSupplyEnrichmentTitles(supply.hireCategory, detectedNiche);

          supplyContact = await findSupplyContact(
            apolloKey,
            supply.domain,
            supply.name,
            searchTitles,
            supply.existingContact // Pass Apify contact if available
          );

          // DOMAIN MATCH GUARD: Discard if enriched contact is from different company
          if (supplyContact && supplyContact.domain && supplyContact.domain !== supply.domain) {
            console.warn(`[SupplyEnrich] ⚠️ Domain mismatch! Expected ${supply.domain}, got ${supplyContact.domain}. Discarding.`);
            supplyContact = null;
          }
        }

        // If still no email and we have Anymail Finder configured, try fallback
        if (!supplyContact?.email && enrichmentConfig.anymailFinderApiKey && !hasUsableApifyContact) {
          console.log(`[SupplyEnrich] Apollo failed, trying Anymail Finder fallback for ${supply.name}...`);
          const anymailResult = await findEmailWithFallback(
            enrichmentConfig.anymailFinderApiKey,
            {
              domain: supply.domain,
              companyName: supply.name,
              fullName: supply.existingContact?.name,
              hireCategory: supply.hireCategory,
            }
          );

          if (anymailResult) {
            console.log(`[SupplyEnrich] ✓ Anymail Finder found: ${anymailResult.email}`);
            supplyContact = {
              name: anymailResult.name || supply.existingContact?.name || 'Contact',
              email: anymailResult.email,
              title: anymailResult.title || supply.existingContact?.title || 'Contact',
              linkedin: anymailResult.linkedin,
              company: supply.name,
              domain: supply.domain,
              confidence: anymailResult.confidence || 75,
            };
          }
        }

        if (supplyContact && supplyContact.email) {
          foundContact = supplyContact;
          successfulSupply = supply;
          console.log(`[SupplyEnrich] ✓ FOUND at ${supply.name}: ${supplyContact.name} (${supplyContact.title})`);
          break; // Stop searching, we found one
        } else {
          console.log(`[SupplyEnrich] ✗ No contact with email at ${supply.name} (domain: ${supply.domain})`);
        }
      } catch (error) {
        console.error(`[SupplyEnrich] Error at ${supply.name}:`, error);
      }
    }

    // Update final state
    // Sort alternatives by confidence: high first, then medium, then low
    const sortByConfidence = (companies: SupplyCompany[]) => {
      const order = { high: 3, medium: 2, low: 1 };
      return [...companies].sort((a, b) =>
        (order[b.classification?.confidence || 'low'] || 0) - (order[a.classification?.confidence || 'low'] || 0)
      );
    };

    if (foundContact && successfulSupply) {
      // Phase 3: Use dual-write helper - store supply contact by SUPPLY domain
      setSupplyContactForDomain(successfulSupply.domain, foundContact);
      // Store selection by DEMAND domain (which demand maps to which supply)
      setSelectedSupplyByDemandDomain(prev => ({ ...prev, [companyDomain]: successfulSupply }));
      // Show providers sorted by confidence (best matches first)
      const remainingAlternatives = sortByConfidence(
        discoveredSupplyCompanies.filter(s => s.domain !== successfulSupply!.domain)
      );
      setAlternativeSupplyByDomain(prev => ({ ...prev, [companyDomain]: remainingAlternatives }));
      const highConfCount = remainingAlternatives.filter(s => s.classification?.confidence === 'high').length;
      console.log(`[SupplyEnrich] === SUCCESS: ${foundContact.name} @ ${successfulSupply.name} (${highConfCount} perfect + ${remainingAlternatives.length - highConfCount} others) ===`);

      // Mark provider as used for rotation tracking (fire-and-forget persist)
      if (pressureDetection?.pressureDetected && pressureDetection.roleType !== 'unknown') {
        const roleType = pressureDetection.roleType;
        const updatedPools = markProviderUsed(trustedSupplyPools, roleType, successfulSupply.domain);
        setTrustedSupplyPools(updatedPools);

        // Persist async (don't block UI)
        (async () => {
          try {
            // GUEST: persist to localStorage
            if (isGuest) {
              localStorage.setItem('guest_trusted_supply_pools', JSON.stringify(updatedPools));
              return;
            }
            // AUTHED: persist to DB
            await supabase
              .from('operator_settings')
              .update({ trusted_supply_pools: updatedPools })
              .eq('user_id', user!.id);
            console.log('[Rotation] Marked provider used:', successfulSupply.name);
          } catch (err) {
            console.warn('[Rotation] Failed to persist lastUsedAt:', err);
          }
        })();
      }
    } else {
      console.log(`[SupplyEnrich] === FAILED: No supply contact found at any discovered company ===`);
      // Show providers sorted by confidence so user can try best matches first
      const remainingAlternatives = sortByConfidence(
        selectedSupply
          ? discoveredSupplyCompanies.filter(s => s.domain !== selectedSupply.domain)
          : discoveredSupplyCompanies
      );
      setAlternativeSupplyByDomain(prev => ({ ...prev, [companyDomain]: remainingAlternatives }));
    }

    setIsEnrichingSupplyByDomain(prev => ({ ...prev, [companyDomain]: false }));

    // Return the results directly so callers don't need to read from stale state
    return { contact: foundContact, supply: successfulSupply };
  };

  // Switch to a different supply company and re-enrich supply contact
  const handleSwitchSupply = async (companyDomain: string, newSupply: SupplyCompany) => {
    const result = matchingResults.find(r => r.domain === companyDomain);
    if (!result) return;

    console.log(`[SupplySwitch] Switching to ${newSupply.name} for ${companyDomain}`);

    // === IMMEDIATE UI UPDATES ===
    // Update selected provider immediately for instant UI feedback
    setSelectedSupplyByDemandDomain(prev => ({ ...prev, [companyDomain]: newSupply }));

    // Update score/reasoning immediately
    const allMatches = allScoredMatchesByDomain[companyDomain] || [];
    const matchForProvider = allMatches.find(m => m.supply.domain === newSupply.domain);
    if (matchForProvider) {
      setSupplyMatchScoreByDomain(prev => ({ ...prev, [companyDomain]: matchForProvider.score }));
      setMatchReasoningByDemandDomain(prev => ({ ...prev, [companyDomain]: matchForProvider.reasoning }));
    }

    // NOTE: Don't clear supply contact - it's keyed by supply domain, not demand domain
    // The old supply's contact is still valid for that supply company

    // Clear BOTH intros immediately - demand intro mentions provider, so it must regenerate too
    // Phase 3: Use dual-write helpers for clearing intros
    setDemandIntro(companyDomain, null);
    setSupplyIntro(companyDomain, null);

    // Enrich with new supply company - returns the contact directly (no stale state)
    const { contact: freshSupplyContact, supply: actualSupply } = await enrichSupplyContact(companyDomain, result, newSupply);

    // Check if we got a valid contact
    if (!freshSupplyContact?.email) {
      console.log('[SupplySwitch] No supply contact with email found at', newSupply.name);
      return;
    }

    // Check if we have demand person data - Phase 2: Read from new state
    const personData = getDemandState(companyDomain).contact;
    if (!personData?.name) {
      console.log('[SupplySwitch] No demand contact yet - skipping intro generation');
      return;
    }

    // Generate the new supply intro with FRESH data (not stale state)
    // AI requires config (works for both guest + auth if keys are set)
    if (!aiConfig || !isAIConfigured(aiConfig)) {
      console.log('[SupplySwitch] AI not configured, skipping intro generation');
      return;
    }

    // Use the actual company name from the contact (from Apollo), not the selected supply company
    const actualProviderName = freshSupplyContact.company;
    console.log(`[SupplySwitch] Generating BOTH intros for provider switch to ${actualProviderName}`);

    // Use niche-aware fallbacks
    const nicheSignalFallback = detectedNiche?.actionVerb || 'showing momentum';
    const nicheSpecialty = detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';
    const nicheFitReason = detectedNiche
      ? `${result.companyName} is ${detectedNiche.actionVerb}`
      : `${result.companyName} is showing activity`;

    const signalDetail = result.signalSummary || nicheSignalFallback;
    const providerInfo = actualSupply || newSupply;
    const firstName = personData.name.split(' ')[0];

    // Provider info for demand intro
    const provider = {
      name: actualProviderName || providerInfo.name,
      company: actualProviderName || providerInfo.name,
      specialty: providerInfo.specialty || nicheSpecialty
    };

    // Determine hire category for supply intro (fallback for legacy code)
    const hireCategory = extractHireCategory(
      result.jobTitlesBeingHired?.map(t => ({ title: t })),
      result.signalSummary
    );

    // Generate BOTH intros using anti-fragile approach (signal-based, no enrichment)
    setIsGeneratingDemandIntro(true);
    setIsGeneratingSupplyIntro(true);

    try {
      // Use unified anti-fragile intro generation for both demand and supply
      const { demandIntro, supplyIntro, matchContext } = await generateIntrosAntifragile(
        aiConfig,
        {
          companyName: result.companyName,
          signalDetail,
          contactFirstName: firstName,
          contactName: personData.name,
          contactTitle: personData.title || 'decision maker',
        },
        {
          providerName: provider.name,
          providerSpecialty: provider.specialty,
          contactFirstName: freshSupplyContact.name?.split(' ')[0] || 'there',
        }
      );

      // Phase 3: Use dual-write helpers
      setDemandIntro(companyDomain, demandIntro);
      setSupplyIntro(companyDomain, supplyIntro);
      console.log(`[SupplySwitch] ✓ BOTH intros regenerated for provider switch to ${actualProviderName} (context: ${matchContext})`);
    } catch (error) {
      console.error('[SupplySwitch] Intro generation failed:', error);
    } finally {
      setIsGeneratingDemandIntro(false);
      setIsGeneratingSupplyIntro(false);
    }
  };

  // Fetch company enrichment (pain points, competitors, customer profiles) from Instantly AI
  const handleCompanyEnrichment = async (companyDomain: string) => {
    // Already enriching or enriched?
    if (isEnrichingCompanyByDomain[companyDomain] || companyEnrichmentByDomain[companyDomain]) {
      return;
    }

    // Need Instantly API key for company intel (pain points, competitors)
    if (!isCompanyIntelConfigured(instantlyConfig)) {
      console.log('[CompanyIntel] Skip: Instantly API key not configured (need for pain points/competitors)');
      return;
    }

    setIsEnrichingCompanyByDomain(prev => ({ ...prev, [companyDomain]: true }));

    try {
      const enrichment = await enrichDomain(
        companyDomain,
        instantlyConfig.apiKey,
        user?.id
      );

      setCompanyEnrichmentByDomain(prev => ({ ...prev, [companyDomain]: enrichment }));

      console.log(`[CompanyIntel] Enriched ${companyDomain} via Instantly — ${enrichment.painPoints.length} pain points, ${enrichment.competitors.length} competitors`);
    } catch (err) {
      console.error('[CompanyIntel] Failed for', companyDomain, ':', err);
    } finally {
      setIsEnrichingCompanyByDomain(prev => ({ ...prev, [companyDomain]: false }));
    }
  };

  const handleEnrichPerson = async (companyDomain?: string) => {
    if (!companyDomain) {
      showToast('warning', 'Company info missing. Check signals first.');
      return;
    }

    // Also trigger company enrichment in background (non-blocking)
    handleCompanyEnrichment(companyDomain);

    // Normalize domain (strip https://, www., trailing slashes)
    const cleanDomain = normalizeDomain(companyDomain) || companyDomain;

    const result = matchingResults.find(r => r.domain === companyDomain || r.domain === cleanDomain);
    if (!result) {
      showToast('warning', 'No result available yet.');
      return;
    }

    setIsEnrichingDomain(companyDomain);
    setNoContactsFoundByDomain(prev => ({ ...prev, [companyDomain]: false }));

    try {
      // Check cache first (but don't block on errors - just skip cache if query fails)
      // GUEST: Skip DB cache check - guests use localStorage cache via matching_engine_state_v1
      let cachedRecord: any = null;
      if (!isGuest) {
        try {
          const { data, error } = await supabase
            .from('signal_history')
            .select('enriched_at, person_name, person_title, person_email, person_linkedin, target_titles')
            .eq('company_domain', cleanDomain)
            .not('enriched_at', 'is', null)
            .order('enriched_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error) {
            cachedRecord = data;
          } else {
            console.log('[MatchingEngine] Cache query failed (will proceed to enrichment):', error.message);
          }
        } catch (cacheError) {
          console.log('[MatchingEngine] Cache check skipped:', cacheError);
        }
      }

      // ONLY use cache if we have ACTUAL useful data (name OR email)
      // Empty enriched_at records should NOT block enrichment
      const hasUsefulCachedData = cachedRecord?.enriched_at &&
        (cachedRecord.person_name || cachedRecord.person_email);

      if (hasUsefulCachedData) {
        const enrichedAt = new Date(cachedRecord.enriched_at);
        const daysSince = (new Date().getTime() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < 7) {
          console.log('[MatchingEngine] Using cached enrichment from', enrichedAt);
          const cachedPerson: PersonData = {
            name: cachedRecord.person_name,
            title: cachedRecord.person_title,
            email: cachedRecord.person_email,
            linkedin: cachedRecord.person_linkedin,
            confidence: 90,
            enrichedAt: enrichedAt,
            status: calculateEnrichmentStatus({
              name: cachedRecord.person_name,
              title: cachedRecord.person_title,
              email: cachedRecord.person_email,
              linkedin: cachedRecord.person_linkedin,
              confidence: 90
            })
          };
          // Phase 3: Use dual-write helper
          setDemandContact(companyDomain, cachedPerson);

          // Show rewarding cache hit message (green toast)
          showToast('cache', 'We know this person already, no charge for you!');

          console.log('[Pressure Profile] CACHED - Person:', {
            name: cachedPerson.name,
            title: cachedPerson.title,
            company: result.companyName
          });

          if (cachedPerson.title) {
            const pressureProfile = getContextualPressureProfile({
              personTitle: cachedPerson.title,
              signalType: result.signalType,
              companySize: result.companySize,
              roleCount: result.jobCount || 1,
              companyName: result.companyName
            });
            console.log('[Pressure Profile] CACHED - Result:', pressureProfile);
            setPersonPressureProfileByDomain(prev => ({ ...prev, [companyDomain]: pressureProfile }));
          } else {
            console.log('[Pressure Profile] CACHED - Skipped (no title)');
          }

          // STILL trigger supply matching even when using cached demand contact
          await enrichSupplyContact(cleanDomain, result);

          setIsEnrichingDomain(null);
          return;
        }
      }

      // Check if ANY enrichment method is configured (Apollo/PDL OR Anymail Finder)
      const hasApolloOrPdl = isContactEnrichmentConfigured(enrichmentConfig);
      const hasAnymailFinder = !!enrichmentConfig.anymailFinderApiKey;

      if (!hasApolloOrPdl && !hasAnymailFinder) {
        showToast('warning', 'Set up contact provider (Apollo/PDL) in Settings first.');
        setIsEnrichingDomain(null);
        return;
      }

      console.log('[MatchingEngine] Enriching person for domain:', companyDomain);
      console.log('[MatchingEngine] WHO-derived targetTitles to pass to Apollo:', result.targetTitles);
      console.log('[MatchingEngine] WHO pressure roles:', result.whoHasPressureRoles);
      console.log('[MatchingEngine] Work Owner settings:', workOwnerSettings);

      // CRITICAL: Determine hire category for STRICT role alignment
      // This determines which titles are valid (e.g., engineering signal = only engineering leaders)
      const determineHireCategory = (): WorkOwnerHireCategory => {
        const summary = safeLower(result.signalSummary);
        const jobTitlesArr = Array.isArray(result.jobTitlesBeingHired) ? result.jobTitlesBeingHired : [];
        const jobTitles = jobTitlesArr.map(t => safeLower(t)).join(' ');

        // Check for sales FIRST (before engineering, since "sales engineer" should be sales)
        if (/\bsales\b|account exec|sdr\b|bdr\b|closer|revenue|business develop|\bae\b|account manager/.test(summary) ||
            /\bsales\b|account exec|sdr\b|bdr\b/.test(jobTitles)) {
          return 'sales';
        }

        // Engineering
        if (/engineer|developer|software|frontend|backend|fullstack|full-stack|devops|sre|architect|programmer|data scientist|ml |machine learning/.test(summary) ||
            /engineer|developer|software/.test(jobTitles)) {
          return 'engineering';
        }

        // Marketing
        if (/marketing|growth|seo|content|brand|demand gen|social media/.test(summary) ||
            /marketing|growth/.test(jobTitles)) {
          return 'marketing';
        }

        // Operations
        if (/\bops\b|revops|operations|finance|hr\b|human resources|people ops/.test(summary) ||
            /operations|ops\b/.test(jobTitles)) {
          return 'operations';
        }

        // Funding signals
        if (/fund|series|raise|investment/.test(safeLower(result.signalType))) {
          return 'funding';
        }

        // Default to engineering (most common for job signals)
        console.log('[MatchingEngine] Could not determine hire category, defaulting to engineering');
        return 'engineering';
      };

      const hireCategory = determineHireCategory();
      console.log(`[MatchingEngine] Determined hire category: ${hireCategory.toUpperCase()}`);

      // ================================================================
      // CHECK CACHE FIRST - Skip Apollo if we already have this contact
      // Re-verify if stale (>30 days old)
      // ================================================================
      const cached = await getCachedContact(companyDomain);
      if (cached?.email) {
        const isStale = isVerificationStale(cached);

        // If stale and we have Anymail key, re-verify
        if (isStale && enrichmentConfig.anymailFinderApiKey) {
          console.log(`[MatchingEngine] CACHE HIT (STALE) - re-verifying ${cached.email}`);
          try {
            const { verifyEmail } = await import('./services/AnymailFinderService');
            const verifyResult = await verifyEmail(enrichmentConfig.anymailFinderApiKey, cached.email);
            const newStatus = verifyResult.status === 'verified' ? 'verified'
              : verifyResult.status === 'risky' ? 'risky'
              : verifyResult.status === 'invalid' ? 'invalid'
              : 'unverified';

            // Update cache with fresh verification
            await updateVerificationStatus(companyDomain, cached.email, newStatus as 'verified' | 'risky' | 'invalid');
            console.log(`[MatchingEngine] Re-verified ${cached.email}: ${newStatus}`);

            // Only use if still valid
            if (newStatus === 'invalid') {
              console.log(`[MatchingEngine] Cached email now invalid - proceeding to Apollo`);
              // Continue to Apollo lookup below
            } else {
              // Use cached + re-verified contact - Phase 3: Use dual-write helper
              setDemandContact(companyDomain, {
                name: cached.name || '',
                title: cached.title || '',
                email: cached.email,
                linkedin: cached.linkedin,
                confidence: 0.9,
                status: 'ready',
              });
              setIsEnrichingByDomain(prev => ({ ...prev, [companyDomain]: false }));
              return;
            }
          } catch (err) {
            console.warn(`[MatchingEngine] Re-verification failed, using cached:`, err);
          }
        }

        // Fresh cache or no Anymail key - use as-is
        if (!isStale || !enrichmentConfig.anymailFinderApiKey) {
          console.log(`[MatchingEngine] ✓ CACHE HIT - skip Apollo for ${companyDomain}: ${cached.email}`);
          // Phase 3: Use dual-write helper
          setDemandContact(companyDomain, {
            name: cached.name || '',
            title: cached.title || '',
            email: cached.email,
            linkedin: cached.linkedin,
            confidence: 0.9,
            status: 'ready',
          });
          setIsEnrichingByDomain(prev => ({ ...prev, [companyDomain]: false }));
          return;
        }
      }

      // Step 1: Try Work Owner Search first (if keywords configured)
      const workOwnerSettingsForApi: WorkOwnerSettings = {
        work_owner_departments: workOwnerSettings.departments.join(', '),
        work_owner_keywords: workOwnerSettings.keywords.join(', '),
      };

      let person: PersonData | null = null;
      let searchSource = 'existing';

      // CRITICAL: Pass hireCategory to enforce strict role alignment
      const workOwner = await findWorkOwnerByDomain(
        companyDomain,
        workOwnerSettingsForApi,
        enrichmentConfig.apiKey || '',
        hireCategory
      );

      if (workOwner) {
        // Work owner found - use it directly
        console.log('[MatchingEngine] Work Owner found:', workOwner.name, workOwner.title);
        person = {
          name: workOwner.name,
          title: workOwner.title,
          email: workOwner.email,
          linkedin: workOwner.linkedin,
          confidence: workOwner.confidence,
          status: workOwner.email ? 'ready' : 'found_no_contact',
        };
        searchSource = 'work_owner';
      } else {
        // Step 2: Fall back to existing enrichment pipeline
        console.log('[MatchingEngine] Work Owner not found, falling back to existing enrichment');

        // Build enrichment context
        const enrichmentContext = {
          signalType: result.signalType,
          jobCategory: roleCategoryFromJobTitle(result.jobTitlesBeingHired?.[0]),
          companyName: result.companyName,
          companySize: result.companySize,
        };

        person = await enrichPerson(companyDomain, result.targetTitles || [], enrichmentConfig, result.whoHasPressureRoles || [], enrichmentContext);
        // Credit tracked later after verification
      }

      // === ANYMAIL FINDER FALLBACK FOR DEMAND CONTACTS ===
      // If Apollo failed to find email and we have Anymail Finder configured, try fallback
      if ((!person || !person.email) && enrichmentConfig.anymailFinderApiKey) {
        console.log(`[DemandEnrich] Apollo ${person ? 'found contact but no email' : 'failed'}, trying Anymail Finder fallback for ${companyDomain}...`);

        try {
          const anymailResult = await findEmailWithFallback(
            enrichmentConfig.anymailFinderApiKey,
            {
              domain: companyDomain,
              companyName: result.companyName,
              fullName: person?.name, // Use existing name if we found one
              hireCategory: hireCategory, // Pass the hire category for decision maker search
            }
          );

          if (anymailResult?.email) {
            // Anymail Finder emails are pre-verified
            trackCreditUsage(anymailResult.email, 'verified');
            console.log(`[DemandEnrich] ✓ Anymail Finder found: ${anymailResult.email}`);

            if (person) {
              // We had a person but no email - add the email
              person.email = anymailResult.email;
              person.status = 'ready';
              if (!person.name && anymailResult.name) person.name = anymailResult.name;
              if (!person.title && anymailResult.title) person.title = anymailResult.title;
              if (!person.linkedin && anymailResult.linkedin) person.linkedin = anymailResult.linkedin;
            } else {
              // No person at all - create from Anymail result
              person = {
                name: anymailResult.name || 'Contact',
                title: anymailResult.title || '',
                email: anymailResult.email,
                linkedin: anymailResult.linkedin,
                confidence: anymailResult.confidence || 70,
                status: 'ready',
              };
            }
            searchSource = 'anymail_finder';
          } else {
            console.log(`[DemandEnrich] ✗ Anymail Finder also failed for ${companyDomain}`);
          }
        } catch (anymailError) {
          console.error(`[DemandEnrich] Anymail Finder error:`, anymailError);
        }
      }

      if (person) {
        console.log('[MatchingEngine] Enrichment complete via:', searchSource);
        console.log('[MatchingEngine] Person:', {
          name: person.name,
          title: person.title,
          company: result.companyName,
          source: searchSource
        });

        // Phase 3: Use dual-write helper
        setDemandContact(companyDomain, person);
        setNoContactsFoundByDomain(prev => ({ ...prev, [companyDomain]: false }));
        const strategy = searchSource === 'work_owner' ? 'work_owner' : ((person as any).searchStrategy || 'primary');
        console.log('[MatchingEngine] Person enriched:', person.name, person.title, 'status:', person.status, 'source:', strategy);

        if (searchSource === 'work_owner') {
          console.log('[MatchingEngine] Found via Work Owner Search');
        } else if (strategy === 'fallback') {
          console.log('[MatchingEngine] Found via fallback - closest decision maker');
        }

        // Only show success toast if we have actual useful data
        if (person.name || person.email) {
          const personName = person.name || person.email?.split('@')[0] || 'Contact';
          const companyPart = result.companyName ? ` at ${result.companyName}` : '';
          const sourceLabel = searchSource === 'work_owner' ? ' (work owner)' : '';
          showToast('success', `Found ${personName}${companyPart}${sourceLabel}`);
        }

        // SAVE TO SHARED CACHE - All users benefit from this enrichment
        if (person.email) {
          saveToCache({
            domain: companyDomain,
            email: person.email,
            name: person.name,
            title: person.title,
            linkedin: person.linkedin,
            companyName: result.companyName,
            source: searchSource === 'anymail_finder' ? 'anymailfinder' : 'apollo',
          });
          console.log(`[MatchingEngine] ✓ Saved to cache: ${person.email}`);
        }

        if (person.title) {
          const pressureProfile = getContextualPressureProfile({
            personTitle: person.title,
            signalType: result.signalType,
            companySize: result.companySize,
            roleCount: result.jobCount || 1,
            companyName: result.companyName
          });
          console.log('[Pressure Profile] FRESH - Result:', pressureProfile);
          setPersonPressureProfileByDomain(prev => ({ ...prev, [companyDomain]: pressureProfile }));
        } else {
          console.log('[Pressure Profile] FRESH - Skipped (no title)');
        }

        // Update the most recent signal_history record for this domain (AUTHED ONLY)
        // Note: Supabase update doesn't support order/limit, so we update all matching records
        if (!isGuest) {
          await supabase
            .from('signal_history')
            .update({
              person_name: person.name || null,
              person_title: person.title || null,
              person_email: person.email || null,
              person_linkedin: person.linkedin || null,
              target_titles: Array.isArray(result.targetTitles) ? result.targetTitles : [],
              enriched_at: new Date().toISOString()
            })
            .eq('company_domain', cleanDomain);
          console.log('[MatchingEngine] Saved enriched person data to database');
        }

        // Step 3: Also enrich supply contact (provider company contact)
        await enrichSupplyContact(cleanDomain, result);
      } else {
        setNoContactsFoundByDomain(prev => ({ ...prev, [companyDomain]: true }));
        showToast('warning', 'No contact found for this company');

        // Mark as enriched even when no contact found (prevents re-attempts) - AUTHED ONLY
        if (!isGuest) {
          await supabase
            .from('signal_history')
            .update({
              enriched_at: new Date().toISOString()
            })
            .eq('company_domain', cleanDomain);
        }
      }
    } catch (error) {
      console.error('[MatchingEngine] Error enriching person:', error);
      showToast('error', 'Could not get contact. Check Settings.');
    } finally {
      setIsEnrichingDomain(null);
    }
  };

  const handleSendToInstantly = async (domain: string) => {
    console.log('[Instantly] Button clicked');

    const result = matchingResults.find(r => r.domain === domain);
    const personData = getDemandState(domain).contact;
    const finalIntro = finalIntroByDomain[domain];

    console.log('[Instantly] Person data:', personData);
    console.log('[Instantly] Config:', {
      hasKey: !!instantlyConfig?.apiKey,
      hasCampaign: !!instantlyConfig?.campaignId
    });

    if (!result || !personData || !personData.email || !finalIntro) {
      console.error('[Instantly] Missing required data:', {
        hasResult: !!result,
        hasPersonData: !!personData,
        hasEmail: !!personData?.email,
        hasFinalIntro: !!finalIntro
      });
      showToast('error', 'Missing contact data for routing');
      return;
    }

    if (!instantlyConfig?.apiKey || !instantlyConfig?.campaignId) {
      console.error('[Instantly] Config missing:', {
        hasApiKey: !!instantlyConfig?.apiKey,
        hasCampaignId: !!instantlyConfig?.campaignId
      });
      showToast('error', 'Please set up Instantly in Settings first');
      return;
    }

    const [first_name, ...rest] = (personData.name || '').split(' ');
    const last_name = rest.join(' ');

    // Validate required fields
    if (!personData.email) {
      console.error('[Instantly] Email is required when using campaign');
      showToast('error', 'Email required for routing');
      return;
    }

    if (!instantlyConfig.campaignId) {
      console.error('[Instantly] Campaign ID is required');
      showToast('error', 'Campaign ID is required. Please configure in Settings');
      return;
    }

    const payload = {
      campaign: instantlyConfig.campaignId,  // Note: "campaign" not "campaign_id"
      email: personData.email,
      first_name: first_name || '',
      last_name: last_name || '',
      company_name: result.companyName || '',
      website: result.domain || '',
      personalization: finalIntro,  // Newlines are preserved
      skip_if_in_workspace: true,
      skip_if_in_campaign: true,
      skip_if_in_list: true,
      custom_variables: {
        signal_summary: result.signalSummary,
        who_has_pressure: result.whoHasPressure,
        pressure_profile: result.pressureProfile,
        window_status: result.windowStatus,
        signal_strength: result.signalStrength.toString()
      }
    };

    console.log('[Instantly] Payload being sent:', payload);

    try {
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [domain]: true }));
      const ok = await createInstantlyLead(instantlyConfig.apiKey, payload);
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [domain]: false }));

      if (!ok) {
        console.error('[Instantly] API returned false/error');
        showToast('error', 'Could not send to Instantly. Please try again');
        return;
      }

      console.log('[Instantly] Contact routed successfully');
      showToast('success', 'Routed to campaign');
    } catch (error) {
      console.error('[Instantly] Full error:', error);
      console.error('[Instantly] Error message:', (error as Error).message);
      console.error('[Instantly] Error stack:', (error as Error).stack);
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [domain]: false }));
      showToast('error', 'Could not send to Instantly. Please try again');
    }
  };

  const handleDualSend = async (domain: string, type: 'DEMAND' | 'SUPPLY') => {
    console.log(`[DualSend] Sending ${type} for ${domain}`);
    console.log('[DualSend] Instantly config:', {
      hasApiKey: !!instantlyConfig?.apiKey,
      hasCampaignDemand: !!instantlyConfig?.campaignDemand,
      hasCampaignSupply: !!instantlyConfig?.campaignSupply,
      hasOldCampaignId: !!instantlyConfig?.campaignId,
    });

    const result = matchingResults.find(r => r.domain === domain);
    const personData = getDemandState(domain).contact; // Demand contact (person at hiring company)

    // For DEMAND: we need the demand contact's email
    if (type === 'DEMAND' && (!result || !personData || !personData.email)) {
      showToast('error', 'Missing contact data for demand routing');
      return;
    }

    // For SUPPLY: we need to select provider + enrich supply contact
    let supplyContact: SupplyContact | null = null;
    let selectedProvider: SupplyCompany | null = null;
    let supplyIntroForSend: string | undefined;

    if (type === 'SUPPLY') {
      // Step 1: Check if provider already selected
      selectedProvider = selectedSupplyByDemandDomain[domain];

      if (!selectedProvider) {
        showToast('error', 'No provider selected. Enrich contact first.');
        return;
      }
      console.log(`[DualSend] Selected provider: ${selectedProvider.name} (${selectedProvider.domain})`);

      // Step 2: Check if we already have an enriched supply contact - Phase 2: Read from new state
      supplyContact = getSupplyContactState(selectedProvider.domain).contact;

      if (!supplyContact) {
        // Step 3: Enrich supply contact using Apollo
        const apolloKey = enrichmentConfig?.apiKey;
        if (!apolloKey) {
          showToast('error', 'Apollo API key required for supply enrichment. Set it in Settings.');
          return;
        }

        console.log(`[DualSend] Enriching supply contact at ${selectedProvider.domain}...`);
        setIsEnrichingSupplyByDomain(prev => ({ ...prev, [domain]: true }));

        try {
          supplyContact = await findSupplyContact(
            apolloKey,
            selectedProvider.domain,
            selectedProvider.name,
            selectedProvider.defaultTitles,
            selectedProvider.existingContact // Pass Apify contact if available
          );

          // If Apollo failed and we have Anymail Finder configured, try fallback
          if (!supplyContact?.email && enrichmentConfig.anymailFinderApiKey) {
            console.log(`[DualSend] Apollo failed, trying Anymail Finder fallback...`);
            const anymailResult = await findEmailWithFallback(
              enrichmentConfig.anymailFinderApiKey,
              {
                domain: selectedProvider.domain,
                companyName: selectedProvider.name,
                fullName: selectedProvider.existingContact?.name,
                hireCategory: selectedProvider.hireCategory,
              }
            );

            if (anymailResult) {
              console.log(`[DualSend] ✓ Anymail Finder found: ${anymailResult.email}`);
              supplyContact = {
                name: anymailResult.name || selectedProvider.existingContact?.name || 'Contact',
                email: anymailResult.email,
                title: anymailResult.title || selectedProvider.existingContact?.title || 'Contact',
                linkedin: anymailResult.linkedin,
                company: selectedProvider.name,
                domain: selectedProvider.domain,
                confidence: anymailResult.confidence || 75,
              };
            }
          }

          if (supplyContact) {
            // Phase 3: Use dual-write helper - store by supply domain (provider's domain)
            setSupplyContactForDomain(selectedProvider.domain, supplyContact);
            console.log(`[DualSend] Found supply contact: ${supplyContact.name} (${supplyContact.title}) at ${supplyContact.company}`);
          }
        } catch (error) {
          console.error('[DualSend] Supply enrichment failed:', error);
        } finally {
          setIsEnrichingSupplyByDomain(prev => ({ ...prev, [domain]: false }));
        }
      }

      if (!supplyContact || !supplyContact.email) {
        showToast('error', `Could not find contact at ${selectedProvider.name}. Try again later.`);
        return;
      }

      // Step 4: Generate supply intro with actual supply contact name
      // GUEST GUARD + AI CONFIG GUARD: Skip AI for guests or when not configured
      if (isGuest || !aiConfig || !isAIConfigured(aiConfig)) {
        console.log('[DualSend] AI not available, using deterministic intro');
        supplyIntroForSend = `hey ${supplyContact.name.split(' ')[0]} — i've got a live company that fits what you do. details?`;
      } else {
        // Use actual company name from the contact (from Apollo) - more accurate than selectedProvider
        const actualProviderName = supplyContact.company;
        console.log(`[DualSend] Generating supply intro for ${supplyContact.name} at ${actualProviderName}...`);
        const supplyFirstName = supplyContact.name.split(' ')[0];
        const roleCount = result?.jobCount || 1;
        const signalDetail = result?.signalSummary || (detectedNiche?.actionVerb || `${roleCount} active signals`);
        const providerSpecialty = selectedProvider?.specialty || detectedNiche?.introTemplates?.valueProposition || 'helps companies like yours';

        try {
          // Step 1: Detect match context (2-5 words)
          const matchContext = await detectMatchContext(
            aiConfig,
            {
              companyName: result?.companyName || '',
              signalDetail
            },
            {
              providerName: actualProviderName,
              specialty: providerSpecialty
            }
          );

          // Step 2: Generate supply intro using anti-fragile approach (signal-based, no enrichment)
          const freshSupplyIntro = await generateSupplyIntroAntifragile(
            aiConfig,
            {
              matchContext,
              providerFirstName: supplyFirstName,
              providerCompany: actualProviderName
            },
            {
              companyName: result?.companyName || '',
              contactName: personData?.name || 'the contact',
              contactTitle: personData?.title || 'decision maker',
              signalDetail
            }
          );
          // Phase 3: Use dual-write helper
          setSupplyIntro(domain, freshSupplyIntro);
          // Store the intro for immediate use (state won't update synchronously)
          supplyIntroForSend = freshSupplyIntro;
          console.log(`[DualSend] Fresh supply intro generated for ${supplyContact.name} at ${actualProviderName} (context: ${matchContext}):`, freshSupplyIntro);
        } catch (error) {
          console.error('[DualSend] Failed to generate supply intro:', error);
          showToast('error', 'Failed to generate supply intro');
          return;
        }
      }
    }

    let campaignId = type === 'DEMAND'
      ? instantlyConfig?.campaignDemand
      : instantlyConfig?.campaignSupply;

    if (!campaignId && instantlyConfig?.campaignId) {
      console.log('[DualSend] Falling back to old single campaign ID');
      campaignId = instantlyConfig.campaignId;
    }

    if (!instantlyConfig?.apiKey) {
      showToast('error', 'Please set up Instantly API key in Settings first');
      return;
    }

    if (!campaignId || campaignId.trim() === '') {
      showToast('error', `Please set up ${type === 'DEMAND' ? 'Demand' : 'Supply'} campaign in Settings first`);
      return;
    }

    // Use the correct intro based on send type
    // Phase 2: Read from new state (single source of truth)
    const state = getDemandState(domain);
    const aiGeneratedIntro = type === 'DEMAND'
      ? (state.demandIntro || aiRewrittenIntroByDomain[domain])
      : (supplyIntroForSend || state.supplyIntro);

    console.log(`[DualSend] Using ${type} intro:`, aiGeneratedIntro);

    // Build params differently for Demand vs Supply
    let params: DualSendParams;

    if (type === 'DEMAND') {
      // DEMAND: Send to the demand contact (the person at the hiring company)
      const [first_name, ...rest] = (personData?.name || '').split(' ');
      const last_name = rest.join(' ');

      params = {
        campaignId,
        email: personData.email,
        first_name: first_name || '',
        last_name: last_name || '',
        company_name: result?.companyName || '',
        website: result?.domain,
        type,
        signal_metadata: {
          signal_type: result?.signalSummary,
          signal_strength: result?.signalStrength,
          who_has_pressure: result?.whoHasPressure,
          pressure_profile: result?.pressureProfile,
          window_status: result?.windowStatus
        },
        contact_title: personData?.title,
        company_domain: result?.domain,
        intro_text: aiGeneratedIntro,
        // Scoring telemetry (separated)
        operator_fit_score: result?.operatorFitScore,  // Demand → operator fit (0-100)
        supply_match_score: supplyMatchScoreByDomain[domain],  // New: demand → supply fit
        supply_match_reasoning: matchReasoningByDemandDomain[domain],
        supply_domain: selectedSupplyByDemandDomain[domain]?.domain,  // Which provider
      };
    } else {
      // SUPPLY: Send to the enriched supply contact (person at provider company)
      // CRITICAL: Use SUPPLY company name/domain, NOT demand company
      const [supply_first, ...supply_rest] = (supplyContact!.name || '').split(' ');
      const supply_last = supply_rest.join(' ');

      params = {
        campaignId,
        email: supplyContact!.email,
        first_name: supply_first || '',
        last_name: supply_last || '',
        company_name: selectedProvider?.name || supplyContact!.company || '', // SUPPLY company name
        website: selectedProvider?.domain || '', // SUPPLY company domain
        type,
        signal_metadata: {
          signal_type: result?.signalSummary,
          signal_strength: result?.signalStrength,
          // Demand company info for reference in sequences
          demand_company_name: result?.companyName,
          demand_company_domain: result?.domain,
          demand_contact_name: personData?.name,
          demand_contact_title: personData?.title,
          demand_contact_email: personData?.email,
          // Supply company info
          supply_contact_company: supplyContact!.company,
          supply_contact_title: supplyContact!.title
        },
        contact_title: supplyContact!.title,
        company_domain: selectedProvider?.domain || '', // SUPPLY company domain
        intro_text: aiGeneratedIntro,
        // Scoring telemetry (separated)
        operator_fit_score: result?.operatorFitScore,  // Demand → operator fit (0-100)
        supply_match_score: supplyMatchScoreByDomain[domain],  // New: demand → supply fit
        supply_match_reasoning: matchReasoningByDemandDomain[domain],
        supply_domain: selectedProvider?.domain,  // Which provider
      };

      console.log(`[DualSend] SUPPLY recipient: ${supplyContact!.email} (${supplyContact!.name} @ ${selectedProvider?.name || supplyContact!.company})`);
    }

    try {
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [`${domain}-${type}`]: true }));
      const sendResult = await sendToInstantly(instantlyConfig.apiKey, params);
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [`${domain}-${type}`]: false }));

      if (sendResult.success) {
        console.log(`[DualSend] Successfully sent to ${type} campaign`);
        showToast('success', `Routed to ${type === 'DEMAND' ? 'demand' : 'supply'} campaign`);

        // Update status tracking - only on real success
        if (type === 'DEMAND') {
          setDemandStatusByDomain(prev => ({ ...prev, [domain]: 'sent' }));

          // Mark demand as used for rotation tracking (fire-and-forget persist)
          if (pressureDetection?.pressureDetected && pressureDetection.roleType !== 'unknown') {
            const roleType = pressureDetection.roleType;
            const updatedPools = markDemandUsed(trustedDemandPools, roleType, domain);
            setTrustedDemandPools(updatedPools);

            // Persist async (don't block UI)
            (async () => {
              try {
                // GUEST: persist to localStorage
                if (isGuest) {
                  localStorage.setItem('guest_trusted_demand_pools', JSON.stringify(updatedPools));
                  return;
                }
                // AUTHED: persist to DB
                await supabase
                  .from('operator_settings')
                  .update({ trusted_demand_pools: updatedPools })
                  .eq('user_id', user!.id);
                console.log('[Rotation] Marked demand used:', result?.companyName);
              } catch (err) {
                console.warn('[Rotation] Failed to persist demand lastUsedAt:', err);
              }
            })();
          }
        } else {
          setSupplyStatusByDomain(prev => ({ ...prev, [domain]: 'sent' }));
        }
      } else {
        console.error(`[Instantly] ${type.toLowerCase()} failed:`, sendResult.error);
        // Set failed status
        if (type === 'DEMAND') {
          setDemandStatusByDomain(prev => ({ ...prev, [domain]: 'failed' }));
        } else {
          setSupplyStatusByDomain(prev => ({ ...prev, [domain]: 'failed' }));
        }
        showToast('error', 'Instantly error – check console');
      }
    } catch (error) {
      console.error(`[Instantly] ${type.toLowerCase()} failed:`, error);
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [`${domain}-${type}`]: false }));
      // Set failed status on exception
      if (type === 'DEMAND') {
        setDemandStatusByDomain(prev => ({ ...prev, [domain]: 'failed' }));
      } else {
        setSupplyStatusByDomain(prev => ({ ...prev, [domain]: 'failed' }));
      }
      showToast('error', 'Instantly error – check console');
    }
  };

  const handleSendBoth = async (domain: string) => {
    console.log('[SendBoth] start', domain);

    const results = await Promise.allSettled([
      handleDualSend(domain, 'DEMAND'),
      handleDualSend(domain, 'SUPPLY'),
    ]);

    console.log('[SendBoth] done', results);
  };

  // =========================================================================
  // BATCH SEND MODE (v2 - Consumes from PreEnrichedContactsPool only)
  // =========================================================================

  // V2 Preflight: Show confirmation modal with 10s cancel window
  const startBatchSend = async () => {
    if (!instantlyConfig?.apiKey) {
      showToast('error', 'Instantly API key required');
      return;
    }

    if (!pressureDetection?.pressureDetected) {
      showToast('error', 'Pressure detection required for batch send');
      return;
    }

    const roleType = pressureDetection.roleType;
    if (roleType === 'unknown') {
      showToast('error', 'Valid roleType required for batch send');
      return;
    }

    // Get ready contacts from PreEnrichedContactsPool
    const readyCount = getReadyCount(preEnrichedPools, roleType);
    console.log(`[BatchSend] Ready contacts in pool for ${roleType}: ${readyCount}`);

    if (readyCount === 0) {
      // Check if worker is running
      if (isWorkerRunning(roleType)) {
        const progress = getWorkerProgress(roleType);
        showToast('info', `Enrichment in progress (${progress?.succeeded || 0} ready). Try again shortly.`);
      } else {
        showToast('info', 'No ready contacts. Run enrichment first.');
      }
      return;
    }

    // Determine actual batch size (limited by pool and requested)
    const actualBatchSize = Math.min(batchSize, readyCount);

    // V2: Show preflight modal with 10s countdown
    setPreflightSendCount(actualBatchSize);
    setPreflightCountdown(10);
    setShowBatchPreflight(true);

    // Start countdown (executeBatchSendRef is kept updated on every render)
    if (preflightTimerRef.current) clearInterval(preflightTimerRef.current);
    preflightTimerRef.current = setInterval(() => {
      setPreflightCountdown(prev => {
        if (prev <= 1) {
          // Countdown finished - execute send using ref (avoids stale closure)
          if (preflightTimerRef.current) clearInterval(preflightTimerRef.current);
          setShowBatchPreflight(false);
          executeBatchSendRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cancel preflight countdown
  const cancelBatchPreflight = () => {
    if (preflightTimerRef.current) {
      clearInterval(preflightTimerRef.current);
      preflightTimerRef.current = null;
    }
    setShowBatchPreflight(false);
    setPreflightCountdown(0);
  };

  // Execute batch send (called after preflight countdown or skip)
  // NOTE: This function is stored in a ref to avoid stale closure issues
  const executeBatchSend = async () => {
    if (!pressureDetection?.pressureDetected) return;
    const roleType = pressureDetection.roleType;
    if (roleType === 'unknown') return;

    const readyCount = getReadyCount(preEnrichedPools, roleType);
    const actualBatchSize = Math.min(batchSize, readyCount);

    console.log(`[BatchSend] Starting batch of ${actualBatchSize} from pool (requested ${batchSize}, available ${readyCount})`);

    // Set routing progress IMMEDIATELY so UI shows progress state
    setRoutingProgress({
      total: actualBatchSize,
      completed: 0,
      startTime: Date.now()
    });

    // Create executor with progress callback for live UI updates
    const executor = new BatchSendExecutor(
      instantlyConfig.apiKey,
      (progress) => setRoutingProgress(prev => prev ? {
        ...prev,
        completed: progress.completed
      } : null)
    );
    batchExecutorRef.current = executor;

    // GET contacts from pool (don't consume yet - only consume after successful send)
    const poolContacts = getReadyContacts(preEnrichedPools, roleType, actualBatchSize);

    console.log(`[BatchSend] Got ${poolContacts.length} ready contacts from pool`);

    // Process each contact: generate intro, create batch item
    const sendItems: Parameters<typeof executor.enqueue>[0] = [];
    let processedCount = 0;

    for (const contact of poolContacts) {
      processedCount++;

      try {
        // Lookup matching result for job data (pool contacts don't have this)
        const matchResult = matchingResults.find(r => r.domain === contact.domain);
        const jobTitles = matchResult?.jobTitlesBeingHired || [];
        const jobCount = matchResult?.jobCount || 1;

        // Contact already has verified email from pool
        const personData: PersonData = {
          email: contact.email,
          name: contact.name,
          title: contact.title,
          linkedin: contact.linkedin,
          status: 'ready',
        };

        // Phase 3: Use dual-write helper for UI consistency
        setDemandContact(contact.domain, personData);

        // Get pre-generated intro (NO AI calls during send - too slow)
        // Phase 2: Read from new state
        const contactState = getDemandState(contact.domain);
        let intro = contactState.demandIntro;
        if (!intro) {
          // Use simple fallback intro - AI intros should be pre-generated
          const matchedSupplyDomain = contactState.selectedSupplyDomain;
          const matchedSupply = matchedSupplyDomain
            ? discoveredSupplyCompanies.find(s => s.domain === matchedSupplyDomain)
            : discoveredSupplyCompanies[0];
          const providerName = matchedSupply?.name || connectorProfile?.company_name || 'our network';
          const [contactFirstName] = (contact.name || '').split(' ');

          // Simple fallback intro (no AI call)
          // GATE: Skip if no real company name (don't polish garbage)
          if (!contact.companyName || contact.companyName.includes('.')) {
            console.log(`[BatchSend] Skipping ${contact.domain} - no company name (data quality issue)`);
            continue;
          }
          const { greeting: demandGreeting } = humanGreeting(contactFirstName);
          intro = `${demandGreeting}, saw ${contact.companyName} is showing momentum - ${providerName} works with similar teams. Worth a quick intro?`;
          console.log(`[BatchSend] Using fallback intro for ${contact.domain} (pre-generation missed)`);

          // Save for consistency - Phase 3: Use dual-write helper
          setDemandIntro(contact.domain, intro!);
        }

        // Create demand batch item
        const [firstName, ...lastParts] = (contact.name || '').split(' ');
        const lastName = lastParts.join(' ');

        if (instantlyConfig.campaignDemand) {
          sendItems.push(createDemandBatchItem(
            contact.domain,
            contact.email,
            firstName || '',
            lastName || '',
            contact.companyName,
            intro,
            instantlyConfig.campaignDemand,
            {
              signal_type: contact.signalSummary,
              signal_strength: contact.signalStrength
            }
          ));
        }

        // ========================================
        // SUPPLY SENDING - Auto-match and send to provider
        // ========================================
        // SUPPLY ROUTING: AI-powered matching (no keyword restrictions)
        console.log(`[BatchSend] Supply routing check for ${contact.domain}:`, {
          hasCampaignSupply: !!instantlyConfig.campaignSupply,
          supplyCount: discoveredSupplyCompanies.length,
          willRoute: !!(instantlyConfig.campaignSupply && discoveredSupplyCompanies.length > 0)
        });

        // Route supply if campaign configured and suppliers available
        if (instantlyConfig.campaignSupply && discoveredSupplyCompanies.length > 0) {
          // Try to get pre-selected provider, or round-robin (NO AI - too slow)
          let selectedProvider = selectedSupplyByDemandDomain[contact.domain];

          // Round-robin fallback (no AI call - fast)
          if (!selectedProvider) {
            selectedProvider = discoveredSupplyCompanies[processedCount % discoveredSupplyCompanies.length];
            console.log(`[BatchSend] Round-robin supply: ${selectedProvider.name} for ${contact.companyName}`);
          }

          if (selectedProvider) {
            console.log(`[BatchSend] Have selectedProvider: ${selectedProvider.name} for ${contact.domain}`);
            // Phase 2: Read from new state - use provider's domain, not demand domain
            let supplyContact = getSupplyContactState(selectedProvider.domain).contact;

            // FIX #2: Fallback to Apify existingContact if no enriched contact
            if (!supplyContact && selectedProvider.existingContact?.email) {
              supplyContact = {
                email: selectedProvider.existingContact.email,
                name: selectedProvider.existingContact.name || 'Contact',
                title: selectedProvider.existingContact.title || '',
                company: selectedProvider.name,
                domain: selectedProvider.domain,
                linkedin: selectedProvider.existingContact.linkedin,
                confidence: 100, // Apify data is trusted
              };
              console.log(`[BatchSend] Using Apify existingContact for ${selectedProvider.name}: ${supplyContact.email}`);
            }

            // NO APOLLO CALLS DURING SEND - use pre-cached contacts only
            // Apollo calls during batch send = 1323s for 246 deals (5+ seconds each)
            // Pre-enrich supply contacts BEFORE batch send via the enrichment pipeline
            if (!supplyContact) {
              console.log(`[BatchSend] ⏭️ Skipping supply for ${selectedProvider.name} - no pre-cached contact (enrich before send)`);
            }

            if (supplyContact?.email) {
              // Get pre-generated supply intro (NO AI calls during send)
              // Phase 2: Read from new state
              let supplyIntro = getDemandState(contact.domain).supplyIntro;
              if (!supplyIntro) {
                // GATE: Skip supply intro if no real company name (don't polish garbage)
                if (!contact.companyName || contact.companyName.includes('.')) {
                  console.log(`[BatchSend] Skipping supply intro for ${contact.domain} - no company name`);
                } else {
                  const [supplyFirstName] = (supplyContact.name || '').split(' ');
                  const signalDescription = detectedNiche?.actionVerb
                    ? `${detectedNiche.actionVerb}`
                    : (jobTitles[0] ? `looking for ${jobTitles[0]}` : 'showing momentum');
                  const { greeting: supplyGreeting } = humanGreeting(supplyFirstName);
                  supplyIntro = `${supplyGreeting}, ${contact.companyName} is ${signalDescription} - interested in an intro?`;
                  console.log(`[BatchSend] Using fallback supply intro for ${contact.domain}`);
                  setSupplyIntro(contact.domain, supplyIntro!);
                }
              }

              console.log(`[BatchSend] supplyIntro for ${contact.domain}:`, supplyIntro ? 'GENERATED' : 'MISSING');

              if (supplyIntro) {
                const [supplyFirstName, ...supplyLastParts] = (supplyContact.name || '').split(' ');
                const supplyLastName = supplyLastParts.join(' ');

                console.log(`[BatchSend] *** ADDING SUPPLY SEND: ${supplyContact.email} at ${selectedProvider.name} ***`);
                sendItems.push(createSupplyBatchItem(
                  contact.domain,
                  selectedProvider.domain,
                  supplyContact.email,
                  supplyFirstName || '',
                  supplyLastName || '',
                  supplyContact.company || selectedProvider.name,
                  supplyIntro,
                  instantlyConfig.campaignSupply,
                  {
                    demand_company: contact.companyName,
                    signal_type: contact.signalSummary
                  }
                ));
                console.log(`[BatchSend] ✓ Added supply send: ${supplyContact.email} at ${selectedProvider.name}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[BatchSend] Error preparing ${contact.domain}:`, error);
      }
    }

    if (sendItems.length === 0) {
      setRoutingProgress(null); // Clear progress since nothing to send
      // Give specific reason
      if (!instantlyConfig.campaignDemand) {
        showToast('error', 'No demand campaign configured. Check Settings → Outreach.');
      } else if (poolContacts.length === 0) {
        showToast('info', 'No enriched contacts in pool. Run enrichment first.');
      } else {
        showToast('info', 'Nothing to route. Check Settings.');
      }
      console.log('[BatchSend] Nothing to route:', {
        poolContactsCount: poolContacts.length,
        hasDemandCampaign: !!instantlyConfig.campaignDemand,
        hasSupplyCampaign: !!instantlyConfig.campaignSupply,
        supplyCompaniesCount: discoveredSupplyCompanies.length
      });
      return;
    }

    // =========================================================================
    // SUPPLY AGGREGATION: Group supply items by email for deal flow positioning
    // Same recruiter matching 5 companies → 1 email showing abundance
    // =========================================================================
    const demandItems = sendItems.filter(item => item.type === 'DEMAND');
    const supplyItems = sendItems.filter(item => item.type === 'SUPPLY');

    // Group supply items by email
    const supplyGroups = groupSupplyByEmail(
      supplyItems,
      (demandDomain) => {
        // Get signal for this demand
        const result = matchingResults.find(r => r.domain === demandDomain);
        return result?.signalSummary || 'active opportunity';
      },
      (demandDomain) => {
        // Get company name for this demand
        const result = matchingResults.find(r => r.domain === demandDomain);
        return result?.companyName || demandDomain;
      }
    );

    // Process supply groups - aggregate 3+ matches, keep singles as-is
    const processedSupplyItems: typeof supplyItems = [];

    for (const group of supplyGroups) {
      if (shouldUseAggregatedIntro(group)) {
        // 3+ matches → generate aggregated intro
        const signals = group.matches.map(m => m.signal);
        const category = detectCommonCategory(signals);

        console.log(`[BatchSend] 🎯 Aggregating ${group.matches.length} matches for ${group.email} (${category})`);

        // Generate aggregated intro (or use fallback if AI not configured)
        let aggregatedIntro = '';
        if (aiConfig && isAIConfigured(aiConfig)) {
          try {
            aggregatedIntro = await generateAggregatedSupplyIntro(
              aiConfig,
              {
                firstName: group.firstName,
                company: group.companyName,
                specialty: category,
              },
              group.matches,
              category
            );
          } catch (err) {
            console.warn('[BatchSend] Aggregated intro generation failed:', err);
          }
        }

        // Fallback if AI failed or not configured
        if (!aggregatedIntro) {
          const { greeting: aggGreeting } = humanGreeting(group.firstName);
          aggregatedIntro = `${aggGreeting}, I've got ${group.matches.length} companies actively looking for help in ${category} right now. A few are moving fast. Worth a quick look to see if any fit?`;
        }

        // Create ONE supply item with aggregated intro
        processedSupplyItems.push(createSupplyBatchItem(
          group.matches[0].demandDomain, // Use first demand as reference
          group.supplyDomain,
          group.email,
          group.firstName,
          group.lastName,
          group.companyName,
          aggregatedIntro,
          instantlyConfig.campaignSupply,
          {
            aggregated: true,
            match_count: group.matches.length,
            demand_companies: group.matches.map(m => m.demandCompanyName).join(', '),
            category
          }
        ));

        console.log(`[BatchSend] ✓ Created aggregated supply send for ${group.email}: ${group.matches.length} companies in ${category}`);
      } else {
        // 1-2 matches → keep original items (find them in supplyItems)
        for (const match of group.matches) {
          const originalItem = supplyItems.find(
            item => item.params.email?.toLowerCase() === group.email && item.demandDomain === match.demandDomain
          );
          if (originalItem) {
            processedSupplyItems.push(originalItem);
          }
        }
      }
    }

    // Combine demand + processed supply items
    const finalSendItems = [...demandItems, ...processedSupplyItems];
    console.log(`[BatchSend] Final items: ${demandItems.length} demand + ${processedSupplyItems.length} supply (from ${supplyItems.length} original)`);

    // Update progress with actual send count (may differ from initial estimate)
    setRoutingProgress(prev => prev ? { ...prev, total: finalSendItems.length } : null);

    // Enqueue and execute
    executor.enqueue(finalSendItems);
    const result = await executor.start();

    // Clear routing progress - modal takes over
    setRoutingProgress(null);

    // NOW consume contacts from pool (only after sends complete)
    // This way if batch fails/cancelled, contacts stay in pool for retry
    const sentDemandDomains = finalSendItems
      .filter(item => item.type === 'DEMAND')
      .map(item => item.demandDomain);

    let updatedPools = preEnrichedPools;
    for (const domain of sentDemandDomains) {
      updatedPools = markContactConsumed(updatedPools, roleType, domain);
    }
    setPreEnrichedPools(updatedPools);
    console.log(`[BatchSend] Consumed ${sentDemandDomains.length} contacts from pool`);

    // Persist updated pools (fire-and-forget)
    (async () => {
      try {
        // GUEST: persist to localStorage
        if (isGuest) {
          localStorage.setItem('guest_pre_enriched_pools', JSON.stringify(updatedPools));
          return;
        }
        // AUTHED: persist to DB
        await supabase
          .from('operator_settings')
          .update({ pre_enriched_pools: updatedPools })
          .eq('user_id', user!.id);
      } catch (err) {
        console.warn('[BatchSend] Failed to persist pre-enriched pools:', err);
      }
    })();

    // Mark sent domains
    for (const item of finalSendItems) {
      setDemandStatusByDomain(prev => ({ ...prev, [item.demandDomain]: 'sent' }));
    }

    batchExecutorRef.current = null;

    // Track daily sends for operator dashboard
    const newDailyTotal = dailySentToday + result.succeeded;
    setDailySentToday(newDailyTotal);
    localStorage.setItem('operator_sent_today', String(newDailyTotal));

    // Count demand vs supply AFTER deduplication (mirrors executor logic)
    const seenEmails = new Set<string>();
    let demandCount = 0;
    let supplyCount = 0;
    for (const item of finalSendItems) {
      const email = item.params.email?.toLowerCase();
      if (email && !seenEmails.has(email)) {
        seenEmails.add(email);
        if (item.type === 'DEMAND') demandCount++;
        else if (item.type === 'SUPPLY') supplyCount++;
      }
    }

    // Check if cancelled - must account for skipped duplicates
    // Batch is cancelled if: queue had items AND we didn't process them all
    // result.skipped = duplicates filtered during enqueue (already excluded from total)
    // So if total == succeeded + failed, batch completed (even if all failed)
    const wasCancelled = result.total > 0 && result.total > (result.succeeded + result.failed);
    const skippedCount = result.skipped; // Duplicates filtered during enqueue

    // Build sexy batch summary
    const batchSummary = [
      `${result.succeeded} deals routed`,
      demandCount > 0 ? `${demandCount} demand` : null,
      supplyCount > 0 ? `${supplyCount} supply` : null,
    ].filter(Boolean).join(' · ');

    // Show batch result modal with full summary (no toast - modal handles it)
    setBatchSummaryModal({
      show: true,
      succeeded: result.succeeded,
      demandCount,
      supplyCount,
      dailyTotal: newDailyTotal,
      durationMs: result.durationMs,
      cancelled: wasCancelled,
      skipped: skippedCount,
    });
  };

  // Keep ref updated on every render so interval gets fresh state
  executeBatchSendRef.current = executeBatchSend;

  const cancelBatchSend = () => {
    if (batchExecutorRef.current) {
      batchExecutorRef.current.cancel();
      showToast('info', 'Batch cancelled');
    }
  };

  // =========================================================================
  // BACKGROUND ENRICHMENT TRIGGER
  // =========================================================================

  /**
   * Create enrichment function for BackgroundEnrichmentWorker
   */
  const createEnrichmentFunction = () => {
    return async (domain: string, roleType: string) => {
      // CHECK 1: Already have email? Use NEW STATE (single source of truth)
      const demandState = getDemandState(domain);
      if (demandState.contact?.email) {
        console.log(`[BackgroundEnrichment] ✓ SKIP - already have email for ${domain}: ${demandState.contact.email}`);
        return {
          email: demandState.contact.email,
          name: demandState.contact.name || '',
          title: demandState.contact.title || '',
          linkedin: demandState.contact.linkedin,
          companyName: domain,
          emailSource: 'apify' as const,
        };
      }

      // Phase 4: Legacy fallback removed - new state is single source of truth

      // CHECK 2: Check shared cache (all users' previous enrichments)
      const cached = await getCachedContact(domain);
      if (cached?.email) {
        console.log(`[BackgroundEnrichment] ✓ CACHE HIT - skip Apollo for ${domain}: ${cached.email}`);
        return {
          email: cached.email,
          name: cached.name || '',
          title: cached.title || '',
          linkedin: cached.linkedin,
          companyName: cached.company_name || domain,
          emailSource: cached.source as 'apollo' | 'anymailfinder' | 'apify',
        };
      }

      // Determine hire category from roleType
      let hireCategory: WorkOwnerHireCategory = 'engineering';
      if (roleType === 'sales') hireCategory = 'sales';
      else if (roleType === 'marketing') hireCategory = 'marketing';
      else if (roleType === 'operations' || roleType === 'finance') hireCategory = 'operations';

      // Try Work Owner first
      const workOwnerSettingsForApi: WorkOwnerSettings = {
        work_owner_departments: workOwnerSettings.departments.join(', '),
        work_owner_keywords: workOwnerSettings.keywords.join(', '),
      };

      const workOwner = await findWorkOwnerByDomain(
        domain,
        workOwnerSettingsForApi,
        enrichmentConfig.apiKey || '',
        hireCategory
      );

      if (workOwner?.email) {
        // SAVE TO SHARED CACHE - all users benefit
        saveToCache({
          domain,
          email: workOwner.email,
          name: workOwner.name,
          title: workOwner.title,
          linkedin: workOwner.linkedin,
          companyName: domain,
          source: 'apollo',
        });
        return {
          email: workOwner.email,
          name: workOwner.name,
          title: workOwner.title,
          linkedin: workOwner.linkedin,
          companyName: domain,
          emailSource: 'apollo' as const,
        };
      }

      // Fall back to standard enrichment
      const person = await enrichPerson(
        domain,
        [], // No specific titles
        enrichmentConfig,
        [], // No pressure roles
        { signalType: 'jobs', companyName: domain }
      );

      if (person?.email) {
        // SAVE TO SHARED CACHE - all users benefit
        saveToCache({
          domain,
          email: person.email,
          name: person.name || '',
          title: person.title || '',
          linkedin: person.linkedin,
          companyName: domain,
          source: 'apollo',
        });
        return {
          email: person.email,
          name: person.name || '',
          title: person.title || '',
          linkedin: person.linkedin,
          companyName: domain,
          emailSource: 'apollo' as const,
        };
      }

      // Fallback to Anymailfinder if Apollo didn't find email
      if (enrichmentConfig.anymailFinderApiKey) {
        try {
          const anymailResult = await findEmailWithFallback(
            enrichmentConfig.anymailFinderApiKey,
            {
              domain,
              hireCategory,
            }
          );

          if (anymailResult?.email) {
            console.log(`[BackgroundEnrichment] Anymailfinder found: ${anymailResult.email}`);
            // SAVE TO SHARED CACHE - all users benefit
            saveToCache({
              domain,
              email: anymailResult.email,
              name: anymailResult.name || '',
              title: anymailResult.title || '',
              linkedin: anymailResult.linkedin,
              companyName: domain,
              source: 'anymailfinder',
              verificationStatus: 'verified', // Anymailfinder is pre-verified
            });
            return {
              email: anymailResult.email,
              name: anymailResult.name || '',
              title: anymailResult.title || '',
              linkedin: anymailResult.linkedin,
              companyName: domain,
              emailSource: 'anymailfinder' as const,
            };
          }
        } catch (err) {
          console.warn(`[BackgroundEnrichment] Anymailfinder fallback failed for ${domain}:`, err);
        }
      }

      return null;
    };
  };

  /**
   * Trigger background enrichment for current roleType
   * Uses optimistic UI for immediate feedback
   */
  const triggerBackgroundEnrichment = () => {
    console.log('[Enrichment] triggerBackgroundEnrichment called');
    console.log('[Enrichment] pressureDetection:', pressureDetection);
    console.log('[Enrichment] enrichmentConfig:', enrichmentConfig);

    if (!pressureDetection?.pressureDetected) {
      console.log('[Enrichment] BLOCKED: No pressure detected');
      showToast('error', 'Pressure detection required');
      return;
    }

    const roleType = pressureDetection.roleType;
    if (roleType === 'unknown') {
      console.log('[Enrichment] BLOCKED: roleType is unknown');
      showToast('error', 'Valid roleType required');
      return;
    }

    // Check if ANY enrichment method is configured (Apollo/PDL OR Anymail Finder)
    const hasApolloOrPdl = isContactEnrichmentConfigured(enrichmentConfig);
    const hasAnymailFinder = !!enrichmentConfig.anymailFinderApiKey;

    if (!hasApolloOrPdl && !hasAnymailFinder) {
      console.log('[Enrichment] BLOCKED: No enrichment configured (need Apollo, PDL, or Anymail Finder)');
      showToast('info', 'Add enrichment API key in Settings');
      return;
    }

    console.log('[Enrichment] Config:', { hasApolloOrPdl, hasAnymailFinder });

    if (isWorkerRunning(roleType)) {
      console.log('[Enrichment] BLOCKED: Worker already running');
      showToast('info', 'Enrichment already running');
      return;
    }

    console.log('[Enrichment] All checks passed, starting enrichment for', roleType);

    // OPTIMISTIC UI: Set preparing state immediately
    setIsPreparingPool(true);
    setOptimisticProgress(0);
    setPrevReadyCount(getReadyCount(preEnrichedPools, roleType));
    setShowFirstContactPulse(false);

    // Start long-wait timer (5s) for reassurance message
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    longWaitTimerRef.current = setTimeout(() => {
      setShowLongWaitReassurance(true);
    }, 5000);

    // Start optimistic progress animation (advances to ~70% before real data)
    if (optimisticIntervalRef.current) {
      clearInterval(optimisticIntervalRef.current);
    }
    optimisticIntervalRef.current = setInterval(() => {
      setOptimisticProgress(prev => {
        // Ease out: slow down as we approach 70%
        const remaining = 70 - prev;
        const increment = Math.max(0.5, remaining * 0.08);
        return Math.min(70, prev + increment);
      });
    }, 200);

    const enrichFn = createEnrichmentFunction();

    startBackgroundEnrichment(
      roleType,
      trustedDemandPools,
      preEnrichedPools,
      enrichFn,
      enrichmentConfig.anymailFinderApiKey,
      enrichmentConfig.ssmApiKey,
      (updatedPools) => {
        // Cancel long-wait timer when first contact arrives
        if (longWaitTimerRef.current) {
          clearTimeout(longWaitTimerRef.current);
          longWaitTimerRef.current = null;
        }

        // Track newly ready domains for highlight animation
        const currentReady = getReadyContacts(preEnrichedPools, roleType);
        const newReady = getReadyContacts(updatedPools, roleType);
        const currentDomains = new Set(currentReady.map(c => c.domain));
        const newDomains = newReady.filter(c => !currentDomains.has(c.domain)).map(c => c.domain);

        if (newDomains.length > 0) {
          setNewlyReadyDomains(prev => {
            const updated = new Set(prev);
            newDomains.forEach(d => updated.add(d));
            return updated;
          });
          // Remove highlight after 400ms
          setTimeout(() => {
            setNewlyReadyDomains(prev => {
              const updated = new Set(prev);
              newDomains.forEach(d => updated.delete(d));
              return updated;
            });
          }, 400);
        }

        setPreEnrichedPools(updatedPools);

        // Check for first contact arriving (trigger pulse animation)
        const newReadyCount = getReadyCount(updatedPools, roleType);
        if (prevReadyCount === 0 && newReadyCount > 0) {
          setShowFirstContactPulse(true);
          setTimeout(() => setShowFirstContactPulse(false), 1500);
        }
        setPrevReadyCount(newReadyCount);

        // Persist (fire-and-forget)
        (async () => {
          try {
            // GUEST: persist to localStorage
            if (isGuest) {
              localStorage.setItem('guest_pre_enriched_pools', JSON.stringify(updatedPools));
              return;
            }
            // AUTHED: persist to DB
            await supabase
              .from('operator_settings')
              .update({ pre_enriched_pools: updatedPools })
              .eq('user_id', user!.id);
          } catch (err) {
            console.warn('[BackgroundEnrichment] Failed to persist:', err);
          }
        })();
      },
      (progress) => {
        // Stop optimistic animation once real data arrives
        if (optimisticIntervalRef.current && progress.enriched > 0) {
          clearInterval(optimisticIntervalRef.current);
          optimisticIntervalRef.current = null;
        }

        setEnrichmentWorkerProgress({
          roleType: progress.roleType,
          total: progress.totalToEnrich,
          completed: progress.enriched,
          succeeded: progress.succeeded,
        });

        // Worker finished
        if (progress.enriched >= progress.totalToEnrich) {
          setIsPreparingPool(false);
          setOptimisticProgress(0);
          setShowLongWaitReassurance(false);
          if (longWaitTimerRef.current) {
            clearTimeout(longWaitTimerRef.current);
            longWaitTimerRef.current = null;
          }
        }
      },
      // onContactFound - for live feed
      (contact) => {
        setRecentlyFoundContacts(prev => {
          const newContact = { ...contact, foundAt: Date.now() };
          const updated = [newContact, ...prev].slice(0, maxRecentContacts);
          return updated;
        });
      }
    );
  };

  const formatLastSync = () => {
    if (!signals.lastSyncTime) return 'Never';
    const now = new Date();
    const lastSync = new Date(signals.lastSyncTime);
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleToggleCleanView = async (
    signalType: 'jobs' | 'funding' | 'layoffs' | 'hiring' | 'tech',
    currentState: boolean,
    rawPayload: any
  ) => {
    const setters = {
      jobs: { show: setShowCleanJobs, summary: setCleanJobsSummary, cleaning: setIsCleaningJobs, builder: buildCleanJobsSummary },
      funding: { show: setShowCleanFunding, summary: setCleanFundingSummary, cleaning: setIsCleaningFunding, builder: buildCleanFundingSummary },
      layoffs: { show: setShowCleanLayoffs, summary: setCleanLayoffsSummary, cleaning: setIsCleaningLayoffs, builder: buildCleanLayoffsSummary },
      hiring: { show: setShowCleanHiring, summary: setCleanHiringSummary, cleaning: setIsCleaningHiring, builder: buildCleanHiringSummary },
      tech: { show: setShowCleanTech, summary: setCleanTechSummary, cleaning: setIsCleaningTech, builder: buildCleanTechSummary },
    };

    const { show, summary, cleaning, builder } = setters[signalType];
    const summaries = { jobs: cleanJobsSummary, funding: cleanFundingSummary, layoffs: cleanLayoffsSummary, hiring: cleanHiringSummary, tech: cleanTechSummary };
    const currentSummary = summaries[signalType];

    show(!currentState);

    if (currentState) return;

    if (!rawPayload) return;

    if (!aiConfig || !aiConfig.enableCleaning) return;

    if (currentSummary) return;

    cleaning(true);
    try {
      const cleaned = await cleanApiResponse(rawPayload, signalType, aiConfig);
      const summaryText = builder(cleaned);
      summary(summaryText);
    } catch (e) {
      console.warn(`Failed to clean ${signalType} signal, falling back to raw summary`, e);
    } finally {
      cleaning(false);
    }
  };

  // Loading skeleton while settings load
  if (!settingsLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
        <div className="max-w-[1400px] mx-auto">
          <div className="h-4 w-32 bg-white/5 rounded animate-pulse mb-6" />
          <div className="mb-8">
            <div className="h-3 w-20 bg-white/5 rounded-full animate-pulse mb-2" />
            <div className="h-8 w-64 bg-white/5 rounded animate-pulse mb-2" />
            <div className="h-4 w-96 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="grid lg:grid-cols-[300px_1fr] gap-6 mt-8">
            <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-white/[0.04]">
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-2 w-16 bg-white/5 rounded animate-pulse" />
                    <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-white/[0.04] h-48">
                <div className="h-3 w-24 bg-white/5 rounded animate-pulse mb-4" />
                <div className="space-y-2">
                  <div className="h-2 w-full bg-white/5 rounded animate-pulse" />
                  <div className="h-2 w-3/4 bg-white/5 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Dock disabled={!!routingProgress} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      {/* Apple-style Toast Notification */}
      {toastNotification && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300"
          style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className={`
            px-4 py-3 rounded-[14px] shadow-lg backdrop-blur-xl flex items-center gap-3
            border transition-all duration-300
            ${toastNotification.type === 'cache'
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-100'
              : toastNotification.type === 'success'
              ? 'bg-white/10 border-white/20 text-white'
              : toastNotification.type === 'warning'
              ? 'bg-amber-500/15 border-amber-500/25 text-amber-100'
              : toastNotification.type === 'info'
              ? 'bg-white/[0.06] border-white/[0.12] text-white/80'
              : 'bg-red-500/15 border-red-500/25 text-red-100'
            }
          `}>
            {/* Icon */}
            <div className={`
              w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
              ${toastNotification.type === 'cache'
                ? 'bg-emerald-500/30'
                : toastNotification.type === 'success'
                ? 'bg-white/15'
                : toastNotification.type === 'warning'
                ? 'bg-amber-500/25'
                : toastNotification.type === 'info'
                ? 'bg-white/10'
                : 'bg-red-500/25'
              }
            `}>
              {toastNotification.type === 'cache' && <Sparkles size={14} className="text-emerald-300" />}
              {toastNotification.type === 'success' && <CheckCircle size={14} className="text-white/90" />}
              {toastNotification.type === 'warning' && <AlertCircle size={14} className="text-amber-300" />}
              {toastNotification.type === 'info' && <Info size={14} className="text-white/60" />}
              {toastNotification.type === 'error' && <XCircle size={14} className="text-red-300" />}
            </div>
            {/* Message */}
            <span className="text-[13px] font-medium tracking-[-0.01em]">{toastNotification.message}</span>
          </div>
        </div>
      )}

      {/* Supply Confirmation Modal */}
      {pendingSupplyConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-2">Confirm as Supplier?</h3>
            <p className="text-sm text-white/60 mb-4">
              This contact looks like a supplier. Create a Supply entity from <span className="text-white font-medium">{pendingSupplyConfirmation.companyName}</span>?
            </p>
            <div className="bg-white/5 rounded-lg p-3 mb-4">
              <div className="text-xs text-white/40 mb-1">Contact</div>
              <div className="text-sm text-white">{pendingSupplyConfirmation.contactName}</div>
              <div className="text-xs text-white/50">{pendingSupplyConfirmation.contactTitle}</div>
              <div className="text-xs text-white/40 mt-1">{pendingSupplyConfirmation.contactEmail}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={dismissSupplyConfirmation}
                className="flex-1 px-4 py-2 text-sm text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={confirmAsSupplier}
                className="flex-1 px-4 py-2 text-sm text-black bg-white hover:bg-white/90 rounded-lg font-medium transition-colors"
              >
                Confirm Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto">
        {/* Clean header - Apple restraint */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-2 -ml-2 rounded-lg hover:bg-white/[0.04] transition-colors"
            >
              <ArrowLeft size={18} className="text-white/40" />
            </button>
            <div>
              <h1 className="text-[17px] font-medium text-white/90 tracking-[-0.01em]">Matching Engine</h1>
              <p className="text-[13px] text-white/40 mt-0.5">Live opportunities</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(isPreparingPool || (pressureDetection?.roleType && pressureDetection.roleType !== 'unknown' && isWorkerRunning(pressureDetection.roleType))) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-pulse" />
                <span className="text-[11px] text-white/50 font-medium">Finding the right people...</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Health Banner - shows when provider is disabled */}
        <AIHealthBanner onFixConfig={() => navigate('/settings')} className="mb-6" />

        {/* V2 ENTRY SCREEN - Premium matching flow */}
        {(() => {
          const roleType = pressureDetection?.roleType;
          const globalReadyCount = roleType ? getUniqueSendCount(preEnrichedPools, roleType) : 0;

          // Stage 5: Pipeline is the system - snapshot drives UI
          const uiState = pipelineSnapshot ? snapshotToUIState(pipelineSnapshot) : null;
          const introCount = uiState ? uiState.readyCount : Object.values(demandStates).filter(s => s.demandIntro).length;
          const companiesDetected = uiState ? uiState.matchingResults.length : matchingResults.length;
          const snapshotDataHealth = pipelineSnapshot ? pipelineSnapshot.dataHealth : dataHealth;

          // isWorking: true if preparing, worker running, OR progress incomplete
          const workerAlreadyRunning = roleType ? isWorkerRunning(roleType) : false;
          const isWorking = isPreparingPool || workerAlreadyRunning || (enrichmentWorkerProgress?.roleType === roleType && (enrichmentWorkerProgress?.completed ?? 0) < (enrichmentWorkerProgress?.total ?? 0));
          const loadingCount = isWorking ? Math.max(0, (enrichmentWorkerProgress?.total || 0) - (enrichmentWorkerProgress?.completed || 0)) : 0;
          const actualSendCount = Math.min(batchSize, globalReadyCount);
          const hasValidRole = roleType && roleType !== 'unknown';
          const rawDemandCount = signals.jobs.rawPayload?.data?.length || companiesDetected;
          const roleLabel = companiesDetected > 0 ? `${companiesDetected} signals` : 'Signals';
          const progressPercent = enrichmentWorkerProgress?.total ? Math.round(((enrichmentWorkerProgress?.completed ?? 0) / enrichmentWorkerProgress.total) * 100) : 0;

          // ==============================================
          // PREMIUM MATCHING FLOW - 5 States:
          // 1. BEGIN: No data → "Begin matching"
          // 2. MATCHING: isRefreshing → Animation + progress
          // 3. RESULTS: Data loaded → "X matches" + preview
          // 4. ENRICHING: isWorking → Live feed of contacts
          // 5. READY: globalReadyCount > 0 → Route button
          // ==============================================

          // DEBUG: Log current state
          console.log('[UI State]', {
            hasValidRole,
            roleType,
            globalReadyCount,
            isWorking,
            companiesDetected,
            isRefreshing,
            pressureDetection: pressureDetection?.roleType
          });

          // ─────────────────────────────────────────────────────────────
          // STATE 5a: ROUTING IN PROGRESS - Show live progress
          // ─────────────────────────────────────────────────────────────
          if (routingProgress) {
            const elapsed = (Date.now() - routingProgress.startTime) / 1000;
            const rate = routingProgress.completed > 0 ? routingProgress.completed / elapsed : 8; // 8/sec default
            const remaining = Math.max(0, routingProgress.total - routingProgress.completed);
            const secondsLeft = Math.ceil(remaining / rate);
            const percent = routingProgress.total > 0
              ? Math.round((routingProgress.completed / routingProgress.total) * 100)
              : 0;

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-md mx-auto pt-20 text-center"
              >
                {/* Animated routing icon */}
                <motion.div
                  className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  >
                    <ArrowUpRight className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[32px] font-semibold text-white mb-2"
                >
                  Routing {routingProgress.total} deals
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-white/40 text-[15px] mb-8"
                >
                  {routingProgress.completed}/{routingProgress.total} • ~{secondsLeft}s left
                </motion.p>

                {/* Progress bar */}
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden mb-4">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                {/* Percentage */}
                <motion.p
                  className="text-emerald-400 text-[13px] font-medium mb-6"
                  key={percent}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                >
                  {percent}% complete
                </motion.p>

                {/* Cancel button */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  onClick={cancelBatchSend}
                  className="px-4 py-2 text-[13px] text-white/50 hover:text-white/80 hover:bg-white/[0.04] rounded-lg transition-colors"
                >
                  Cancel
                </motion.button>
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 5: READY TO ROUTE - Contacts enriched and ready
          // ─────────────────────────────────────────────────────────────
          if (hasValidRole && globalReadyCount > 0 && !isWorking) {
            // Local var for intro preview (intros generate during send, but show preview if any exist)
            const hasIntros = introCount > 0;
            // Phase 4: Get sample domains from new state
            const sampleDomains = Object.keys(demandStates).filter(d => demandStates[d].demandIntro).slice(0, 5);

            // Use detected niche if available, fallback to role-based label
            const nicheLabel = detectedNiche?.niche || roleLabel;
            const demandLabel = detectedNiche?.demandType || `${roleLabel} contacts`;
            const supplyLabel = detectedNiche?.supplyType || 'providers';

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="max-w-3xl mx-auto pt-6"
              >
                {/* Compact Header + Intro Preview in one view - NO SCROLLING NEEDED */}
                <div className="grid grid-cols-[200px_1fr] gap-6">
                  {/* Left: Compact stats */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center justify-start pt-4"
                  >
                    {/* Niche badge */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                      />
                      <span className="text-[11px] font-medium text-emerald-400">
                        {nicheLabel}
                      </span>
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                      className="text-[48px] font-semibold tracking-tight text-white mb-1"
                    >
                      {globalReadyCount}
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                      className="text-[14px] text-white/40 mb-6"
                    >
                      ready to route
                    </motion.p>

                    {/* Premium stats - Linear/Vercel style */}
                    <div className="w-full">
                      {/* Context - subtle, not alarming */}
                      <div className="flex items-center justify-center gap-2 text-[11px] text-white/30">
                        {companiesDetected > 0 && (
                          <>
                            <span>{companiesDetected} signals</span>
                            <span className="text-white/10">·</span>
                          </>
                        )}
                        <span className="text-emerald-400/70">{globalReadyCount} enriched</span>
                        {introCount > 0 && (
                          <>
                            <span className="text-white/10">·</span>
                            <span className="text-emerald-400/70">{introCount} with intros</span>
                          </>
                        )}
                      </div>

                      {/* DATA HEALTH: Apple-style gate feedback (Stage 3: uses snapshot when available) */}
                      {snapshotDataHealth && (snapshotDataHealth.demand.quality !== 'good' || snapshotDataHealth.supply.quality !== 'good') && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                          <div className="flex items-center gap-2 text-[11px] text-amber-400/80">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>Data quality</span>
                          </div>
                          <div className="mt-1.5 text-[10px] text-white/40 space-y-0.5">
                            {snapshotDataHealth.demand.quality !== 'good' && (
                              <p>Demand: {snapshotDataHealth.demand.withName}/{snapshotDataHealth.demand.total} have company names</p>
                            )}
                            {snapshotDataHealth.supply.quality !== 'good' && (
                              <p>Supply: {snapshotDataHealth.supply.withName}/{snapshotDataHealth.supply.total} have company names</p>
                            )}
                          </div>
                          <p className="mt-1.5 text-[10px] text-white/30">Better datasets → better intros</p>
                        </div>
                      )}
                    </div>

                    {/* Route button */}
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      whileHover={{
                        scale: 1.03,
                        boxShadow: '0 0 60px rgba(52,211,153,0.3)',
                      }}
                      whileTap={{ scale: 0.97 }}
                      onClick={startBatchSend}
                      disabled={globalReadyCount === 0 || isWorking}
                      className="mt-6 w-full py-3 text-[13px] font-semibold rounded-xl bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden group"
                    >
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-200/30 to-transparent"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
                      />
                      <span className="relative">Route all</span>
                    </motion.button>
                  </motion.div>

                  {/* Right: Intro preview cards - THE MAIN CONTENT */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <motion.div
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        />
                        <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Intro preview</span>
                      </div>
                      <span className="text-[11px] text-emerald-400/60">
                        {introCount} ready
                      </span>
                    </div>

                    {hasIntros ? (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar">
                        {sampleDomains.map((domain, idx) => {
                          // Phase 2: Read from new state (single source of truth)
                          const state = getDemandState(domain);
                          const intro = state.demandIntro;
                          const result = matchingResults.find(r => r.domain === domain);
                          const supplyIntro = state.supplyIntro;
                          const narration = matchNarrations[domain];
                          const stacked = stackedSignals[domain];
                          const personData = state.contact;

                          return (
                            <motion.div
                              key={domain}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 + idx * 0.08 }}
                              whileHover={{ scale: 1.01, borderColor: 'rgba(52,211,153,0.3)' }}
                              className="rounded-xl border border-white/[0.08] overflow-hidden cursor-default group"
                              style={{ background: 'rgba(255,255,255,0.02)' }}
                            >
                              {/* Compact header with AI insight */}
                              <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <motion.div
                                    className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center"
                                    whileHover={{ scale: 1.1 }}
                                  >
                                    <span className="text-[9px] font-bold text-emerald-400">
                                      {(result?.companyName || domain).charAt(0).toUpperCase()}
                                    </span>
                                  </motion.div>
                                  <div className="min-w-0">
                                    <span className="text-[12px] font-medium text-white/80">{result?.companyName || domain}</span>
                                    {/* AI Insight instead of boring "1 signal" */}
                                    {narration ? (
                                      <p className="text-[10px] text-emerald-400/70 truncate">{narration.headline}</p>
                                    ) : stacked ? (
                                      <p className="text-[10px] text-blue-400/70 truncate">{stacked.narrative}</p>
                                    ) : (
                                      <p className="text-[10px] text-white/30">
                                        {result?.jobTitlesBeingHired?.[0] || `${result?.jobCount || 1} open role${(result?.jobCount || 1) > 1 ? 's' : ''}`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {/* Urgency/tier badge */}
                                {narration?.urgency === 'hot' ? (
                                  <motion.div
                                    className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-orange-500/20 text-orange-400"
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ repeat: Infinity, duration: 1.5 }}
                                  >
                                    HOT
                                  </motion.div>
                                ) : stacked?.tier === 'A' ? (
                                  <div className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-emerald-500/20 text-emerald-400">A</div>
                                ) : (
                                  <motion.div
                                    className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1.5 }}
                                  />
                                )}
                              </div>

                              {/* The actual intro message */}
                              <div className="px-3 py-2">
                                <p className="text-[12px] leading-relaxed text-white/60">{intro}</p>
                              </div>

                              {/* Supply intro if exists - collapsed */}
                              {supplyIntro && (
                                <div className="px-3 py-2 border-t border-white/[0.03] bg-violet-500/[0.02]">
                                  <p className="text-[10px] text-violet-400/50 mb-1">→ Supply</p>
                                  <p className="text-[11px] leading-relaxed text-white/50">{supplyIntro}</p>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                        {introCount > 5 && (
                          <p className="text-[11px] text-white/30 text-center py-2">
                            +{introCount - 5} more intros ready
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/[0.06] p-6 text-center">
                        <motion.div
                          className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-white/10 border-t-emerald-400/60"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        />
                        <p className="text-[12px] text-white/40">
                          {aiQueueStatus ? getQueueStatusMessage(aiQueueStatus) : 'Generating intros...'}
                        </p>
                        {aiQueueStatus?.mode !== 'normal' && aiQueueStatus?.mode && (
                          <p className="text-[10px] text-white/25 mt-1" title={getQueueTooltip(aiQueueStatus)}>
                            {aiQueueStatus.estimatedTimeRemaining} remaining
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Live Match Feed - Shows WHO matched with WHO */}
                {recentlyFoundContacts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                    className="mb-10 px-4"
                  >
                    <motion.div
                      className="p-5 rounded-2xl border border-white/[0.06] relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                    >
                      {/* Animated background glow */}
                      <motion.div
                        className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-emerald-500/5 blur-3xl"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.3, 0.5, 0.3]
                        }}
                        transition={{ repeat: Infinity, duration: 4 }}
                      />
                      <motion.div
                        className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-blue-500/5 blur-3xl"
                        animate={{
                          scale: [1.2, 1, 1.2],
                          opacity: [0.3, 0.5, 0.3]
                        }}
                        transition={{ repeat: Infinity, duration: 4, delay: 2 }}
                      />

                      <div className="flex items-center gap-2 mb-4 relative">
                        <motion.div
                          className="w-2 h-2 rounded-full bg-emerald-500"
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [1, 0.5, 1],
                            boxShadow: ['0 0 0 0 rgba(52,211,153,0.4)', '0 0 0 8px rgba(52,211,153,0)', '0 0 0 0 rgba(52,211,153,0.4)']
                          }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        />
                        <span className="text-[11px] font-medium text-emerald-400/70 uppercase tracking-wider">Matches found</span>
                        <motion.span
                          className="ml-auto text-[11px] text-white/30"
                          animate={{ opacity: [0.3, 0.6, 0.3] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          live
                        </motion.span>
                      </div>

                      <div className="space-y-3 relative">
                        <AnimatePresence mode="popLayout">
                          {recentlyFoundContacts.slice(0, 4).map((contact, idx) => {
                            // Get matched supply: prefer per-demand selection, fallback to index
                            const matchedSupply = selectedSupplyByDemandDomain[contact.domain]
                              || discoveredSupplyCompanies[idx % discoveredSupplyCompanies.length];

                            return (
                              <motion.div
                                key={`${contact.domain}-${contact.foundAt}`}
                                initial={{ opacity: 0, x: -30, scale: 0.9 }}
                                animate={{ opacity: 1 - idx * 0.1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 30, scale: 0.9 }}
                                transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
                                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.03)' }}
                                className="flex items-center gap-2 p-3 rounded-xl border border-white/[0.04] cursor-default group"
                              >
                                {/* Demand side */}
                                <motion.div
                                  className="flex items-center gap-2 flex-1 min-w-0"
                                  initial={{ x: -10 }}
                                  animate={{ x: 0 }}
                                  transition={{ delay: 0.1 + idx * 0.05 }}
                                >
                                  <motion.div
                                    className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0"
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                  >
                                    <span className="text-[9px] font-bold text-blue-400">
                                      {contact.name.charAt(0).toUpperCase()}
                                    </span>
                                  </motion.div>
                                  <div className="min-w-0">
                                    <p className="text-[12px] text-white/80 truncate font-medium">
                                      {contact.name.split(' ')[0]}
                                    </p>
                                    <p className="text-[10px] text-white/30 truncate">{contact.company}</p>
                                  </div>
                                </motion.div>

                                {/* Animated arrow */}
                                <motion.div
                                  className="flex items-center gap-1 px-2"
                                  animate={{ x: [0, 3, 0] }}
                                  transition={{ repeat: Infinity, duration: 1.5, delay: idx * 0.2 }}
                                >
                                  <motion.div
                                    className="w-1 h-1 rounded-full bg-emerald-500/50"
                                    animate={{ scale: [1, 1.5, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
                                  />
                                  <motion.div
                                    className="w-1 h-1 rounded-full bg-emerald-500/70"
                                    animate={{ scale: [1, 1.5, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }}
                                  />
                                  <motion.div
                                    className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }}
                                  />
                                </motion.div>

                                {/* Supply side */}
                                <motion.div
                                  className="flex items-center gap-2 flex-1 min-w-0"
                                  initial={{ x: 10 }}
                                  animate={{ x: 0 }}
                                  transition={{ delay: 0.2 + idx * 0.05 }}
                                >
                                  <motion.div
                                    className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0"
                                    whileHover={{ scale: 1.1, rotate: -5 }}
                                  >
                                    <span className="text-[9px] font-bold text-violet-400">
                                      {matchedSupply ? (matchedSupply.name || matchedSupply.domain).charAt(0).toUpperCase() : '?'}
                                    </span>
                                  </motion.div>
                                  <div className="min-w-0">
                                    <p className="text-[12px] text-white/80 truncate font-medium">
                                      {matchedSupply ? (matchedSupply.name || matchedSupply.domain).split(' ')[0] : 'Provider'}
                                    </p>
                                    <p className="text-[10px] text-white/30 truncate">
                                      {matchedSupply?.nicheExpertise || matchedSupply?.specialty || 'can help'}
                                    </p>
                                  </div>
                                </motion.div>

                                {/* Match indicator */}
                                <motion.div
                                  className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"
                                  animate={{
                                    scale: [1, 1.3, 1],
                                    opacity: [0.5, 1, 0.5]
                                  }}
                                  transition={{ repeat: Infinity, duration: 1.5, delay: idx * 0.3 }}
                                />
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>

                      {recentlyFoundContacts.length > 4 && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-4 text-[11px] text-white/30 text-center"
                        >
                          +{recentlyFoundContacts.length - 4} more matches
                        </motion.p>
                      )}
                    </motion.div>
                  </motion.div>
                )}

                {/* CTA button moved to left column in grid layout */}
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 4: ENRICHING - Finding decision-makers (active work only)
          // ─────────────────────────────────────────────────────────────
          if (hasValidRole && isWorking) {
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="max-w-xl mx-auto pt-12"
              >
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-center mb-10"
                >
                  <h1 className="text-[36px] font-semibold tracking-tight text-white mb-2">
                    Finding the right people
                  </h1>
                  <p className="text-[15px] text-white/40">
                    {`${enrichmentWorkerProgress?.completed || 0} of ${enrichmentWorkerProgress?.total || companiesDetected} companies`}
                  </p>
                  {detectedNiche?.oneLiner && !aiQueueStatus?.mode && (
                    <p className="mt-2 text-[12px] text-white/25">
                      {detectedNiche.oneLiner}
                    </p>
                  )}
                </motion.div>

                {/* Progress bar */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-10 px-8"
                >
                  <div className="h-[4px] bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-white/40 to-white/60"
                    />
                  </div>
                  {/* Reassurance message - safe to leave */}
                  <p className="text-center text-[11px] text-white/20 mt-3">
                    Safe to leave — progress is saved
                  </p>
                </motion.div>

                {/* Live feed of found contacts */}
                <div className="space-y-3 px-4">
                  <AnimatePresence mode="popLayout">
                    {recentlyFoundContacts.length > 0 ? (
                      recentlyFoundContacts.map((contact, idx) => (
                        <motion.div
                          key={`${contact.domain}-${contact.foundAt}`}
                          initial={{ opacity: 0, x: -30, scale: 0.95 }}
                          animate={{ opacity: 1 - (idx * 0.15), x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 30 }}
                          transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
                          className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06]"
                          style={{ background: 'rgba(255,255,255,0.02)' }}
                        >
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.1, type: 'spring' }}
                            className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-white truncate">
                              {contact.name}
                            </p>
                            <p className="text-[12px] text-white/40 truncate">
                              {contact.title} at {contact.company}
                            </p>
                          </div>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-[11px] text-emerald-400/60 flex-shrink-0"
                          >
                            Located
                          </motion.div>
                        </motion.div>
                      ))
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center gap-3 p-8 text-white/30"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-white/20 border-t-white/50 rounded-full"
                        />
                        <span className="text-[14px]">Searching...</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Found count */}
                <AnimatePresence>
                  {(enrichmentWorkerProgress?.succeeded ?? 0) > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-8 text-center"
                    >
                      <p className="text-[13px] text-white/30">
                        <span className="text-emerald-400 font-medium">{enrichmentWorkerProgress?.succeeded}</span> decision-makers located
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 3: RESULTS - Matches found, show preview with match reasons
          // ─────────────────────────────────────────────────────────────
          if (hasValidRole && companiesDetected > 0) {
            // Stage 5: Use pipeline snapshot data, fall back to legacy
            // Dedupe by domain to avoid duplicate key warnings
            const allDemand = uiState?.matchingResults || matchingResults;
            const seenDomains = new Set<string>();
            const dedupedDemand = allDemand.filter(m => {
              if (!m.domain || seenDomains.has(m.domain)) return false;
              seenDomains.add(m.domain);
              return true;
            });
            const topDemand = dedupedDemand.slice(0, 4);
            const topSupply = discoveredSupplyCompanies.slice(0, 4);
            const hasSupply = topSupply.length > 0;

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="max-w-3xl mx-auto pt-12"
              >
                {/* Header with both counts */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-center mb-10"
                >
                  {/* Niche badge - "Finding the match" animation → "Found" */}
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 transition-all duration-500 ${
                      isDiscoveringMatch
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-white/[0.04] border border-white/[0.08]'
                    }`}
                  >
                    <motion.div
                      className={`w-1.5 h-1.5 rounded-full ${isDiscoveringMatch ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: isDiscoveringMatch ? 0.8 : 2 }}
                    />
                    <span className={`text-[11px] font-medium ${isDiscoveringMatch ? 'text-amber-300' : 'text-white/50'}`}>
                      {isDiscoveringMatch ? 'Finding the match...' : `${getNicheDisplayLabel(detectedNiche, roleLabel)} • Found`}
                    </span>
                  </motion.div>

                  {/* Two big numbers side by side */}
                  <div className="flex items-center justify-center gap-8 mb-4">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
                      className="text-center"
                    >
                      <p className="text-[48px] font-semibold tracking-tight text-blue-400">{companiesDetected}</p>
                      <p className="text-[13px] text-white/40">need help</p>
                      {rawDemandCount > companiesDetected && (
                        <p className="text-[10px] text-white/20 mt-0.5">of {rawDemandCount} contacts</p>
                      )}
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-[32px] text-white/20"
                    >
                      →
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.4, type: 'spring' }}
                      className="text-center"
                    >
                      <p className="text-[48px] font-semibold tracking-tight text-violet-400">{discoveredSupplyCompanies.length}</p>
                      <p className="text-[13px] text-white/40">can help</p>
                      {rawSupplyCount > discoveredSupplyCompanies.length && (
                        <p className="text-[10px] text-white/20 mt-0.5">of {rawSupplyCount} contacts</p>
                      )}
                    </motion.div>
                  </div>

                </motion.div>

                {/* Two columns: Demand | Supply */}
                <div className="grid grid-cols-2 gap-6 mb-10 px-4">
                  {/* DEMAND Column */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[11px] font-medium text-blue-400/70 uppercase tracking-wider">
                        Demand • Need help
                      </span>
                    </div>
                    <div className="space-y-2">
                      {topDemand.map((match, idx) => {
                        const narration = matchNarrations[match.domain];
                        const stacked = stackedSignals[match.domain];
                        const dealScore = dealScores[match.domain];

                        return (
                          <motion.div
                            key={match.domain || idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + idx * 0.08 }}
                            whileHover={{ scale: 1.02, borderColor: 'rgba(59,130,246,0.3)' }}
                            className="p-3 rounded-xl border border-white/[0.06] cursor-default group relative overflow-hidden"
                            style={{ background: narration ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.03)' }}
                          >
                            {/* AI generating indicator */}
                            {isGeneratingNarrations && !narration && (
                              <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                              />
                            )}

                            <div className="flex items-center gap-3 relative">
                              <motion.div
                                className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0"
                                whileHover={{ scale: 1.1, rotate: 5 }}
                              >
                                <span className="text-[11px] font-bold text-blue-400">
                                  {(match.companyName || match.domain).charAt(0).toUpperCase()}
                                </span>
                              </motion.div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-white truncate">
                                  {match.companyName || match.domain}
                                </p>
                                {/* AI Narration headline if available */}
                                {narration ? (
                                  <p className="text-[11px] text-blue-300/70 truncate">
                                    {narration.headline}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-white/30">
                                    {match.jobCount || 1} signal{(match.jobCount || 1) > 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                              {/* Urgency indicator from AI */}
                              {narration?.urgency === 'hot' ? (
                                <motion.div
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/20"
                                  animate={{ scale: [1, 1.05, 1] }}
                                  transition={{ repeat: Infinity, duration: 1.5 }}
                                >
                                  HOT
                                </motion.div>
                              ) : stacked?.tier === 'A' ? (
                                <div className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                                  A
                                </div>
                              ) : (
                                <motion.div
                                  className="w-1.5 h-1.5 rounded-full bg-blue-400/50"
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ repeat: Infinity, duration: 2, delay: idx * 0.2 }}
                                />
                              )}
                            </div>

                            {/* Expanded AI narration story (shows on hover) */}
                            {narration && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                whileHover={{ height: 'auto', opacity: 1 }}
                                className="overflow-hidden"
                              >
                                <p className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/40 leading-relaxed">
                                  {narration.story}
                                </p>
                              </motion.div>
                            )}
                          </motion.div>
                        );
                      })}
                      {companiesDetected > 4 && (
                        <p className="text-[11px] text-white/30 pt-2">+{companiesDetected - 4} more</p>
                      )}
                    </div>
                  </motion.div>

                  {/* SUPPLY Column */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-violet-500" />
                      <span className="text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">
                        Supply • Can help
                      </span>
                    </div>
                    <div className="space-y-2">
                      {hasSupply ? topSupply.map((supply, idx) => (
                        <motion.div
                          key={supply.domain || idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5 + idx * 0.08 }}
                          whileHover={{ scale: 1.02, borderColor: 'rgba(139,92,246,0.3)' }}
                          className="p-3 rounded-xl border border-white/[0.06] cursor-default group"
                          style={{ background: 'rgba(139,92,246,0.03)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-[11px] font-bold text-violet-400">
                                {(supply.name || supply.domain).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-white truncate">
                                {supply.name || supply.domain}
                              </p>
                              <p className="text-[11px] text-white/30 truncate">
                                {supply.nicheExpertise || supply.specialty || 'Provider'}
                              </p>
                            </div>
                            <motion.div
                              className="w-1.5 h-1.5 rounded-full bg-violet-400/50"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ repeat: Infinity, duration: 2, delay: idx * 0.2 }}
                            />
                          </div>
                        </motion.div>
                      )) : (
                        <div className="p-4 rounded-xl border border-white/[0.04] text-center">
                          <p className="text-[12px] text-white/30">No supply dataset yet</p>
                          <button
                            onClick={() => navigate('/settings')}
                            className="mt-2 text-[11px] text-violet-400/70 hover:text-violet-400"
                          >
                            Add supply data →
                          </button>
                        </div>
                      )}
                      {hasSupply && discoveredSupplyCompanies.length > 4 && (
                        <p className="text-[11px] text-white/30 pt-2">+{discoveredSupplyCompanies.length - 4} more</p>
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* Primary CTA - Premium "Prepare" button */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.8 }}
                  className="text-center"
                >
                  <motion.button
                    whileHover={{
                      scale: 1.03,
                      boxShadow: '0 0 80px rgba(59,130,246,0.3)',
                    }}
                    whileTap={{ scale: 0.97 }}
                    onClick={triggerBackgroundEnrichment}
                    className="relative px-14 py-5 text-[16px] font-semibold rounded-2xl bg-white text-black overflow-hidden group"
                  >
                    {/* Shimmer effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                    />
                    <span className="relative">Find decision-makers</span>
                  </motion.button>
                  <motion.p
                    className="mt-5 text-[12px] text-white/25"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                  >
                    System handles enrichment automatically
                  </motion.p>

                  <motion.button
                    onClick={fetchSignals}
                    disabled={isRefreshing}
                    className="mt-6 text-[12px] text-white/30 hover:text-white/50 transition-colors disabled:opacity-30 inline-flex items-center gap-2"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>{isRefreshing ? 'Scanning...' : 'Rescan signals'}</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 2: MATCHING - Premium scanning animation
          // ─────────────────────────────────────────────────────────────
          if (isRefreshing) {
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-md mx-auto pt-20"
              >
                <div className="text-center">
                  {/* Animated radar/scan effect */}
                  <motion.div
                    className="relative w-24 h-24 mx-auto mb-8"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-blue-500/30"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-blue-500/40"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.3 }}
                    />
                    <motion.div
                      className="absolute inset-4 rounded-full border-2 border-blue-500/50"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.3, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.6 }}
                    />
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <motion.div
                        className="w-3 h-3 rounded-full bg-blue-500"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      />
                    </motion.div>
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-[36px] font-semibold tracking-tight text-white mb-3"
                  >
                    Mapping the market
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-[15px] text-white/40 mb-8 max-w-sm mx-auto leading-relaxed"
                  >
                    Scanning for timing alignment
                  </motion.p>

                  {/* Premium two-sided indicator */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center justify-center gap-4 mb-10"
                  >
                    {/* Demand side */}
                    <motion.div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full bg-blue-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      />
                      <span className="text-[11px] text-blue-400/80">Demand</span>
                    </motion.div>

                    {/* Animated connection */}
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1 h-1 rounded-full bg-white/20"
                          animate={{ opacity: [0.2, 0.6, 0.2], x: [0, 2, 0] }}
                          transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
                        />
                      ))}
                    </div>

                    {/* Supply side */}
                    <motion.div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                    >
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.5 }}
                      />
                      <span className="text-[11px] text-violet-400/80">Supply</span>
                    </motion.div>
                  </motion.div>

                  {/* Progress bar with shimmer */}
                  <div className="h-[4px] bg-white/[0.06] rounded-full overflow-hidden max-w-xs mx-auto">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500/50 via-emerald-400/80 to-violet-500/50 rounded-full"
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 1: BEGIN - Premium "Start scanning" state
          // ─────────────────────────────────────────────────────────────
          if (hasValidRole) {
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-md mx-auto pt-20 relative"
              >
                {/* Floating ambient particles */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 rounded-full bg-white/10"
                      style={{
                        left: `${20 + i * 12}%`,
                        top: `${10 + (i % 3) * 25}%`,
                      }}
                      animate={{
                        y: [0, -30, 0],
                        opacity: [0.1, 0.3, 0.1],
                        scale: [1, 1.5, 1],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 3 + i * 0.5,
                        delay: i * 0.4,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>

                <div className="text-center relative">
                  {/* Niche badge with pulse */}
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                    whileHover={{ scale: 1.05 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-6 cursor-default"
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-white/40"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                    <span className="text-[11px] font-medium text-white/40">
                      {roleLabel} • Ready
                    </span>
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
                    className="text-[42px] font-semibold tracking-tight text-white mb-4"
                  >
                    <motion.span
                      animate={{ opacity: [1, 0.9, 1] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                    >
                      Start scanning
                    </motion.span>
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-[15px] text-white/40 mb-12 max-w-xs mx-auto leading-relaxed"
                  >
                    System will find companies with signals and route them to providers
                  </motion.p>

                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                    whileHover={{
                      scale: 1.05,
                      boxShadow: '0 0 100px rgba(255,255,255,0.25)',
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      console.log('🔴 BUTTON CLICKED - TEST');
                      alert('Button works! Starting scan...');
                      fetchSignals();
                    }}
                    className="relative px-14 py-5 text-[16px] font-semibold rounded-2xl bg-white text-black overflow-hidden group"
                  >
                    {/* Shimmer effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'linear', repeatDelay: 1 }}
                    />
                    {/* Glow pulse */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-blue-400/10 via-transparent to-violet-400/10 opacity-0 group-hover:opacity-100"
                      animate={{ opacity: [0, 0.5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    />
                    <span className="relative">Scan for signals</span>
                  </motion.button>

                  {/* Subtle hint animation */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="mt-8 flex items-center justify-center gap-2"
                  >
                    <motion.div
                      className="w-1 h-1 rounded-full bg-white/20"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}
                    />
                    <motion.div
                      className="w-1 h-1 rounded-full bg-white/20"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-1 h-1 rounded-full bg-white/20"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
                    />
                  </motion.div>
                </div>
              </motion.div>
            );
          }

          // ─────────────────────────────────────────────────────────────
          // STATE 0: SETUP - No dataset configured
          // ─────────────────────────────────────────────────────────────
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-md mx-auto pt-20 relative"
            >
              {/* Subtle ambient glow */}
              <motion.div
                className="absolute top-10 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl pointer-events-none"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{ repeat: Infinity, duration: 4 }}
              />

              <div className="text-center relative">
                {/* Animated icon container */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  className="w-16 h-16 mx-auto mb-8 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center cursor-default relative overflow-hidden"
                >
                  {/* Pulse ring */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl border border-white/10"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0, 0.3],
                    }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                  <motion.div
                    animate={{
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ repeat: Infinity, duration: 3 }}
                  >
                    <Radio className="w-7 h-7 text-white/30" />
                  </motion.div>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-[32px] font-semibold tracking-tight text-white mb-3"
                >
                  Connect your dataset
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-[15px] text-white/40 mb-10 max-w-xs mx-auto leading-relaxed"
                >
                  Add an Apify dataset in Settings to start detecting signals
                </motion.p>

                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                  whileHover={{
                    scale: 1.05,
                    boxShadow: '0 0 60px rgba(255,255,255,0.15)',
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/settings')}
                  className="relative px-8 py-3.5 text-[14px] font-semibold rounded-xl bg-white text-black overflow-hidden group"
                >
                  {/* Shimmer */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: 'linear', repeatDelay: 0.5 }}
                  />
                  <span className="relative">Open Settings</span>
                </motion.button>

                {/* Connection dots animation */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-10 flex items-center justify-center gap-8"
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-white/10"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                  <motion.div
                    className="flex gap-1"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1 h-1 rounded-full bg-white/20"
                        animate={{ x: [0, 3, 0] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
                      />
                    ))}
                  </motion.div>
                  <motion.div
                    className="w-2 h-2 rounded-full bg-white/10"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 2, delay: 1 }}
                  />
                </motion.div>
              </div>
            </motion.div>
          );
        })()}

        {/* EXPLORATION MODE REMOVED - See git history */}



      </div>

      {/* V2 Batch Preflight Modal - 10s cancel window */}
      <AnimatePresence>
        {showBatchPreflight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl p-8 max-w-md w-full mx-4"
            >
              {/* Countdown Circle with pulse animation */}
              <div className="text-center mb-6">
                <motion.div
                  className="relative inline-flex items-center justify-center w-24 h-24 mb-4"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="44"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="4"
                    />
                    <motion.circle
                      cx="48"
                      cy="48"
                      r="44"
                      fill="none"
                      stroke="rgba(52,211,153,0.8)"
                      strokeWidth="4"
                      strokeDasharray={44 * 2 * Math.PI}
                      strokeDashoffset={44 * 2 * Math.PI * (1 - preflightCountdown / 10)}
                      strokeLinecap="round"
                      initial={{ strokeDashoffset: 44 * 2 * Math.PI }}
                      animate={{ strokeDashoffset: 44 * 2 * Math.PI * (1 - preflightCountdown / 10) }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </svg>
                  <motion.span
                    className="absolute text-4xl font-bold text-white"
                    key={preflightCountdown}
                    initial={{ scale: 1.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {preflightCountdown}
                  </motion.span>
                </motion.div>
                <motion.h2
                  className="text-xl font-semibold text-white mb-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  Routing {preflightSendCount} deal{preflightSendCount !== 1 ? 's' : ''}
                </motion.h2>
                <motion.p
                  className="text-[13px] text-white/50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {getNicheDisplayLabel(
                    detectedNiche,
                    pressureDetection?.roleType && pressureDetection.roleType !== 'unknown'
                      ? `${pressureDetection.roleType.charAt(0).toUpperCase() + pressureDetection.roleType.slice(1)}`
                      : 'Signals detected'
                  )} • Both sides
                </motion.p>
              </div>

              {/* Deals Preview with staggered animation */}
              {(() => {
                const roleType = pressureDetection?.roleType;
                if (!roleType || roleType === 'unknown') return null;
                const sampleContacts = getReadyContacts(preEnrichedPools, roleType, 3);
                if (sampleContacts.length === 0) return null;

                return (
                  <motion.div
                    className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Deals in motion</p>
                    <div className="space-y-2">
                      {sampleContacts.slice(0, 3).map((contact, i) => (
                        <motion.div
                          key={`${contact.domain}-${i}`}
                          className="flex items-center gap-2"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + i * 0.1 }}
                        >
                          <motion.span
                            className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center text-[9px] font-medium text-emerald-400"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
                          >
                            {i + 1}
                          </motion.span>
                          <span className="text-[12px] text-white/70 truncate">{contact.name}</span>
                          <span className="text-[10px] text-white/30">@ {contact.companyName}</span>
                        </motion.div>
                      ))}
                      {preflightSendCount > 3 && (
                        <motion.p
                          className="text-[10px] text-emerald-400/50 ml-7"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.7 }}
                        >
                          +{preflightSendCount - 3} more routes
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                );
              })()}

              {/* Cancel Button */}
              <motion.button
                onClick={cancelBatchPreflight}
                className="w-full py-3 text-[14px] font-medium rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-Run Overlay - Apple-style 3-step intro with visual examples */}
      <AnimatePresence>
        {showFirstRunOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-md w-full mx-4"
            >
              {/* Step Indicators */}
              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`w-8 h-1 rounded-full transition-all duration-300 ${
                      step === firstRunStep
                        ? 'bg-white'
                        : step < firstRunStep
                        ? 'bg-white/40'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {/* Step Content with Visual Examples */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={firstRunStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  {firstRunStep === 1 && (
                    <div className="text-center">
                      <p className="text-[13px] text-white/40 uppercase tracking-wider mb-4">Step 1</p>
                      <h2 className="text-[22px] font-semibold text-white mb-6 tracking-tight">
                        This shows what's ready
                      </h2>
                      {/* Visual mockup of company list */}
                      <div className="bg-[#0A0A0A] border border-white/[0.08] rounded-xl p-4 mb-6 text-left">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Companies</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-emerald-500/20">
                            <span className="text-[13px] text-white/80">Acme Corp</span>
                            <span className="text-[10px] text-emerald-400 font-medium">Ready</span>
                          </div>
                          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]">
                            <span className="text-[13px] text-white/50">TechStart Inc</span>
                            <span className="text-[10px] text-white/30">Enriching...</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/40">
                        "Ready" means contact found + intro generated
                      </p>
                    </div>
                  )}

                  {firstRunStep === 2 && (
                    <div className="text-center">
                      <p className="text-[13px] text-white/40 uppercase tracking-wider mb-4">Step 2</p>
                      <h2 className="text-[22px] font-semibold text-white mb-6 tracking-tight">
                        This is the intro you're sending
                      </h2>
                      {/* Visual mockup of intro preview */}
                      <div className="space-y-3 mb-6 text-left">
                        <div className="bg-gradient-to-br from-blue-500/[0.08] to-transparent border border-blue-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowRight className="w-3 h-3 text-blue-400" />
                            <span className="text-[10px] text-blue-400/80 uppercase tracking-wider">To Company</span>
                          </div>
                          <p className="text-[12px] text-white/60 leading-relaxed">
                            "Hey Sarah, saw you're scaling the engineering team at Acme. I know someone who places senior devs fast..."
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500/[0.08] to-transparent border border-emerald-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowLeft className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] text-emerald-400/80 uppercase tracking-wider">To Provider</span>
                          </div>
                          <p className="text-[12px] text-white/60 leading-relaxed">
                            "Hey Mike, Acme Corp has an active opportunity. Their decision maker is Sarah Chen..."
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/40">
                        Both intros are personalized from the signal
                      </p>
                    </div>
                  )}

                  {firstRunStep === 3 && (
                    <div className="text-center">
                      <p className="text-[13px] text-white/40 uppercase tracking-wider mb-4">Step 3</p>
                      <h2 className="text-[22px] font-semibold text-white mb-6 tracking-tight">
                        One click routes both
                      </h2>
                      {/* Visual mockup of Route button */}
                      <div className="mb-6">
                        <div className="inline-block px-12 py-4 text-[15px] font-semibold rounded-xl bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.15)]">
                          Route 300
                        </div>
                        <div className="mt-4 flex items-center justify-center gap-6 text-[11px] text-white/30">
                          <span>To Company</span>
                          <ArrowRight className="w-3 h-3" />
                          <span>To Provider</span>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/40">
                        Intros go to both sides simultaneously
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Action Button */}
              <div className="mt-10">
                <button
                  onClick={advanceFirstRunStep}
                  className="w-full py-4 text-[15px] font-semibold rounded-xl bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
                >
                  {firstRunStep < 3 ? 'Continue' : 'Got it — start routing'}
                </button>

                {/* Skip Link */}
                {firstRunStep < 3 && (
                  <button
                    onClick={dismissFirstRunOverlay}
                    className="w-full mt-3 py-2 text-[13px] text-white/30 hover:text-white/50 transition-colors"
                  >
                    Skip intro
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Summary Modal - Premium connector language with CRAZY animations */}
      <AnimatePresence>
        {batchSummaryModal?.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden"
            onClick={() => setBatchSummaryModal(null)}
          >
            {/* Floating particles */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className={`absolute w-2 h-2 rounded-full ${
                  i % 3 === 0 ? 'bg-emerald-400' : i % 3 === 1 ? 'bg-blue-400' : 'bg-purple-400'
                }`}
                style={{ left: `${10 + (i * 7)}%` }}
                initial={{ opacity: 0, y: '100vh' }}
                animate={{
                  opacity: [0, 0.8, 0.8, 0],
                  y: [100, -100],
                }}
                transition={{
                  duration: 2.5,
                  delay: i * 0.15,
                  repeat: Infinity,
                  repeatDelay: 1,
                }}
              />
            ))}

            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 100, rotateX: 45 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: -50 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md mx-4 bg-[#0A0A0A] border border-white/[0.08] rounded-2xl p-8 shadow-2xl relative"
            >
              {/* Glow effect behind card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur-xl"
              />

              {/* Success Icon with pulse */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.1 }}
                className="flex justify-center mb-6"
              >
                <motion.div
                  animate={{
                    boxShadow: [
                      '0 0 0 0 rgba(52, 211, 153, 0.4)',
                      '0 0 0 20px rgba(52, 211, 153, 0)',
                    ],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ rotate: -180, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                  >
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                </motion.div>
              </motion.div>

              {/* Header with stagger */}
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-semibold text-white text-center mb-2"
              >
                {batchSummaryModal.cancelled ? 'Routing Cancelled' : 'Deals Routed'}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white/40 text-center text-sm mb-8"
              >
                {batchSummaryModal.cancelled
                  ? `${batchSummaryModal.succeeded} sent, ${batchSummaryModal.skipped || 0} skipped`
                  : `Batch complete in ${((batchSummaryModal.durationMs || 0) / 1000).toFixed(1)}s`}
              </motion.p>

              {/* Stats Grid with stagger */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                  className="bg-white/[0.03] rounded-xl p-4 text-center border border-white/[0.04]"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                    className="text-3xl font-bold text-white mb-1"
                  >
                    {batchSummaryModal.succeeded}
                  </motion.div>
                  <div className="text-xs text-white/40 uppercase tracking-wider">
                    Total Routed
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, type: 'spring' }}
                  className="bg-white/[0.03] rounded-xl p-4 text-center border border-white/[0.04]"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
                    className="text-3xl font-bold text-emerald-400 mb-1"
                  >
                    {batchSummaryModal.dailyTotal}
                  </motion.div>
                  <div className="text-xs text-white/40 uppercase tracking-wider">
                    Today
                  </div>
                </motion.div>
              </div>

              {/* Breakdown with stagger */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex justify-center gap-6 mb-8 text-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.75, type: 'spring' }}
                  className="flex items-center gap-2"
                >
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-blue-400"
                  />
                  <span className="text-white/60">{batchSummaryModal.demandCount} demand</span>
                </motion.div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.8, type: 'spring' }}
                  className="flex items-center gap-2"
                >
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    className="w-2 h-2 rounded-full bg-purple-400"
                  />
                  <span className="text-white/60">{batchSummaryModal.supplyCount} supply</span>
                </motion.div>
              </motion.div>

              {/* CTA with shimmer */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setBatchSummaryModal(null)}
                className="w-full py-4 text-[15px] font-semibold rounded-xl bg-white text-black relative overflow-hidden group"
              >
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
                />
                <span className="relative">Ready for next batch</span>
              </motion.button>

              {/* Subtle hint */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="text-center text-white/20 text-xs mt-4"
              >
                Keep routing. The magic compounds.
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AppHeader />
      <Dock disabled={!!routingProgress} />
    </div>
  );
}

export default MatchingEngineV3;

