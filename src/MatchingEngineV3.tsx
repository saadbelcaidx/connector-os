import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, TrendingUp, Loader2, Radio, Settings as SettingsIcon, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';
import { PredictionService, SignalTrend } from './PredictionService';
import { JobTrendChart } from './JobTrendChart';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';
import AppHeader from './AppHeader';
import { useOnboarding } from './OnboardingContext';
import { TourTooltip } from './Onboarding';
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
} from './services/SignalsClient';
import { generateJobInsights, JobInsights } from './services/JobInsightsEngine';
import { rewriteIntro, isAIConfigured, rewriteInsight, cleanApiResponse, generateWhyNow, generateWhyYou, generateDemandIntro, generateSupplyIntro } from './services/AIService';
import { createRichFundingSignal, createRichJobsSignal, createRichLayoffsSignal, RichSignal } from './services/SignalFormatters';
import {
  buildCleanJobsSummary,
  buildCleanFundingSummary,
  buildCleanLayoffsSummary,
  buildCleanHiringSummary,
  buildCleanTechSummary
} from './services/CleanViewHelpers';
import { detectWhoHasPressure, detectTargetTitles } from './services/WhoClassificationService';
import { enrichPerson, PersonData, EnrichmentConfig, calculateEnrichmentStatus, isEnrichmentStale, isEnrichmentConfigured, calculateOutboundReadiness, roleCategoryFromJobTitle } from './services/PersonEnrichmentService';
import { findWorkOwnerByDomain, WorkOwnerSettings, WorkOwnerHireCategory } from './services/ApolloWorkOwnerService';
import { getContextualPressureProfile } from './services/PersonPressureService';
import { PersonContactCard } from './PersonContactCard';
import { createInstantlyLead, sendToInstantly, DualSendParams } from './services/InstantlyService';
import { fetchSupplySignals, findMatchingSupply, SupplyCompany, getSupplyEnrichmentTitles } from './services/SupplySignalsClient';
import { HireCategory, extractHireCategory } from './services/CompanyRoleClassifier';
import { findSupplyContact, SupplyContact } from './services/ApolloSupplyEnrichmentService';
import { findEmailWithFallback, mapHireCategoryToAnymail } from './services/AnymailFinderService';
import { cleanCompanyName } from './services/IntroBuilder';
import type { ConnectorProfile } from './types';

const WINDOW_STATUS_LABELS = {
  EARLY: 'Early',
  BUILDING: 'Building',
  WATCH: 'Watch',
  OPEN: 'Open'
};

const WINDOW_STATUS_DESCRIPTIONS = {
  EARLY: 'Early signal across multiple companies — exploratory outreach viable',
  BUILDING: 'Hiring pressure forming across several firms — test outreach',
  WATCH: 'Clear hiring activity — good timing',
  OPEN: 'Strong multi-company hiring window — act fast'
};

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
  matchScore: number;
  matchReasons: string[];
  companySize: number;
  signalType: string;
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

function estimateDealValue(companySize: number, matchScore: number, signalStrength: number) {
  let base = 5000;

  if (companySize < 50) base = 5000;
  else if (companySize < 200) base = 15000;
  else if (companySize < 1000) base = 50000;
  else base = 100000;

  const multiplier = Math.max(0.3, (matchScore + signalStrength) / 200);

  return Math.round(base * multiplier);
}

function calculateProbability(matchScore: number, signalStrength: number, windowStatus: string) {
  let base = (matchScore + signalStrength) / 2;

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
      className="flex items-start gap-3 p-3 rounded-2xl mb-2 relative transition-all duration-350"
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
      className="p-4 rounded-2xl mb-3 transition-all duration-350"
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
  const { user } = useAuth();
  const { currentStep, nextStep, skipOnboarding } = useOnboarding();

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

  const [personDataByDomain, setPersonDataByDomain] = useState<Record<string, PersonData | null>>({});
  const [isEnrichingDomain, setIsEnrichingDomain] = useState<string | null>(null);
  const [noContactsFoundByDomain, setNoContactsFoundByDomain] = useState<Record<string, boolean>>({});
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error' | 'warning' | 'cache'; message: string } | null>(null);
  const [personPressureProfileByDomain, setPersonPressureProfileByDomain] = useState<Record<string, string>>({});
  const [enrichmentConfig, setEnrichmentConfig] = useState<EnrichmentConfig>({ provider: 'none' });
  const [conversationStartedByDomain, setConversationStartedByDomain] = useState<Record<string, boolean>>({});
  const [lastContactDateByDomain, setLastContactDateByDomain] = useState<Record<string, string | null>>({});
  const [introUnlockedByDomain, setIntroUnlockedByDomain] = useState<Record<string, boolean>>({});
  const [rewriteCache, setRewriteCache] = useState<Map<string, string>>(new Map());
  const [aiRewrittenIntroByDomain, setAiRewrittenIntroByDomain] = useState<Record<string, string>>({});
  const [finalIntroByDomain, setFinalIntroByDomain] = useState<Record<string, string>>({});
  const [demandIntroByDomain, setDemandIntroByDomain] = useState<Record<string, string>>({});
  const [supplyIntroByDomain, setSupplyIntroByDomain] = useState<Record<string, string>>({});
  const [isGeneratingDemandIntro, setIsGeneratingDemandIntro] = useState(false);
  const [isGeneratingSupplyIntro, setIsGeneratingSupplyIntro] = useState(false);

  // Track domains where intro generation has been ATTEMPTED (prevents infinite loops)
  const introGenerationAttemptedRef = useRef<Set<string>>(new Set());
  const [aiWhyNowByDomain, setAiWhyNowByDomain] = useState<Record<string, string>>({});
  const [aiWhyYouByDomain, setAiWhyYouByDomain] = useState<Record<string, string>>({});
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [matchingResults, setMatchingResults] = useState<MatchingResult[]>([]);
  const [instantlyConfig, setInstantlyConfig] = useState<{apiKey: string; campaignId: string; campaignDemand: string; campaignSupply: string} | null>(null);
  const [isSendingInstantlyByDomain, setIsSendingInstantlyByDomain] = useState<Record<string, boolean>>({});
  const [connectorProfile, setConnectorProfile] = useState<ConnectorProfile | null>(null);
  const [demandStatusByDomain, setDemandStatusByDomain] = useState<Record<string, string>>({});
  const [supplyStatusByDomain, setSupplyStatusByDomain] = useState<Record<string, string>>({});

  // Two-contact architecture: separate demand (hiring company) and supply (provider) contacts
  const [supplyContactByDomain, setSupplyContactByDomain] = useState<Record<string, SupplyContact | null>>({});
  const [selectedSupplyByDomain, setSelectedSupplyByDomain] = useState<Record<string, SupplyCompany | null>>({});
  const [alternativeSupplyByDomain, setAlternativeSupplyByDomain] = useState<Record<string, SupplyCompany[]>>({});
  const [isEnrichingSupplyByDomain, setIsEnrichingSupplyByDomain] = useState<Record<string, boolean>>({});

  // Dynamic supply discovery - companies fetched from Apify supply dataset
  const [discoveredSupplyCompanies, setDiscoveredSupplyCompanies] = useState<SupplyCompany[]>([]);
  const [supplyDiscoveryStatus, setSupplyDiscoveryStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

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

  const showToast = (type: 'success' | 'error' | 'warning' | 'cache', message: string) => {
    setToastNotification({ type, message });
    setTimeout(() => setToastNotification(null), 4000);
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
    loadSettingsFromDatabase();
    loadSignalHistory();
  }, []);

  const loadSettingsFromDatabase = async () => {
    try {
      const { data, error } = await supabase
        .from('operator_settings')
        .select('*')
        .eq('user_id', 'default')
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
        const selectedProvider = data.ai_provider || 'none';
        const loadedAiConfig = {
          // Map keys based on selected provider
          openaiKey: selectedProvider === 'openai' ? (data.ai_openai_api_key || '') : '',
          azureKey: selectedProvider === 'azure' ? (data.ai_azure_api_key || '') : '',
          azureEndpoint: selectedProvider === 'azure' ? (data.ai_azure_endpoint || '') : '',
          claudeKey: selectedProvider === 'anthropic' ? (data.ai_anthropic_api_key || '') : '',
          model: data.ai_model || 'gpt-4o-mini',
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
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  };

  const loadSignalHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('signal_history')
        .select('signal_strength, created_at')
        .eq('user_id', 'default')
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
    try {
      const whoRoles = activeResult?.whoHasPressureRoles || [];
      const titles = activeResult?.targetTitles || [];
      const personData = activeResult ? personDataByDomain[activeResult.domain] : null;
      const personPressureProfile = activeResult ? personPressureProfileByDomain[activeResult.domain] : null;

      const { error } = await supabase
        .from('signal_history')
        .insert({
          user_id: 'default',
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

    try {
      await supabase.from('usage_logs').insert({
        user_id: user.id,
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
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Silently fail - usage_logs table may not exist in free tier
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
    setIsRefreshing(true);
    setSignals(prev => ({ ...prev, loading: true, error: null }));

    // Clear all cached provider data when refreshing (important when dataset URL changes)
    setSelectedSupplyByDomain({});
    setAlternativeSupplyByDomain({});
    setSupplyContactByDomain({});
    setSupplyIntroByDomain({});
    setIsEnrichingSupplyByDomain({});
    console.log('[MatchingEngine] Cleared cached provider data for fresh reload');

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
      if (config.supplyApiUrl) {
        setSupplyDiscoveryStatus('loading');
        try {
          const supplyResult = await fetchSupplySignals(config.supplyApiUrl);
          if (supplyResult.isLive) {
            setDiscoveredSupplyCompanies(supplyResult.companies);
            setSupplyDiscoveryStatus('loaded');
            console.log(`[Supply] Discovered ${supplyResult.companies.length} supply companies from ${supplyResult.totalDiscovered} total`);
            // Debug: Log first 5 supply companies to trace where they come from
            console.log('[Supply] First 5 companies:', supplyResult.companies.slice(0, 5).map(c => `${c.name} (${c.domain})`));
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
        const richJobs = createRichJobsSignal(jobsRes.value.rawPayload.data);
        setRichJobsSignal(richJobs);
      } else {
        setRichJobsSignal(null);
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

    const companies: { name: string; domain: string; jobCount: number; sampleJob?: any; industry?: string; companySize?: number; geography?: string; jobTitles: string[] }[] = [];

    // DEFENSIVE: Ensure we have an array before iterating
    const safeJobItems = Array.isArray(jobItems) ? jobItems : [];

    if (safeJobItems.length > 0) {
      const companyMap = new Map<string, { name: string; count: number; sampleJob: any; jobTitles: Set<string> }>();

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
          companyMap.set(key, { ...existing, count: existing.count + 1 });
        } else {
          const titles = new Set<string>();
          if (jobTitle) titles.add(jobTitle);
          companyMap.set(key, { name, count: 1, sampleJob: job, jobTitles: titles });
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

      const pressureProfile = `${company.jobCount} open role${company.jobCount !== 1 ? 's' : ''} detected`;

      const whoCanSolve = provider.idealClient || 'Provider matching your profile';

      const timelineLabels = {
        EARLY: 'Early signal',
        BUILDING: 'Signal building',
        WATCH: 'Active signal',
        OPEN: 'Strong signal'
      };

      const suggestedTimeline = timelineLabels[windowStatus] || 'Signal detected';

      const { score: matchScore, reasons: matchReasons, breakdown } = calculateMatchScoreForCompany(
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
        console.groupCollapsed('[MatchingEngine] Match score for company:', company.name);
        console.log('Final match score:', matchScore);
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
        matchScore,
        signalStrength
      );

      const probabilityOfClose = calculateProbability(
        matchScore,
        signalStrength,
        windowStatus
      );

      const exactAngle = getConnectorAngle(topRole);

      return {
        id: `${company.domain}-${index}`,
        companyName: company.name,
        domain: company.domain,
        signalSummary: `${company.jobCount} open ${company.jobCount === 1 ? 'role' : 'roles'} at ${company.name}`,
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
        matchScore,
        matchReasons,
        companySize: company.companySize || 50,
        signalType: signalType,
      };
    });

    const MATCH_THRESHOLD = 0;
    const filteredResults = results
      .filter((r) => (connectorProfile ? r.matchScore >= MATCH_THRESHOLD : true))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.signalStrength || 0) - (a.signalStrength || 0);
      });

    if (process.env.NODE_ENV === 'development') {
      const allScores = results.map((r) => r.matchScore ?? 0);
      const maxScore = allScores.length ? Math.max(...allScores) : 0;

      console.groupCollapsed('[MatchingEngine] Match scoring - batch result');
      console.log('Total companies scored:', results.length);
      console.log('Threshold used:', MATCH_THRESHOLD);
      console.log('Companies passing threshold:', filteredResults.length);
      console.log('Highest match score in batch:', maxScore);
      console.groupEnd();
    }

    if (filteredResults.length === 0 && connectorProfile && process.env.NODE_ENV === 'development') {
      const allScores = results.map((r) => r.matchScore ?? 0);
      const maxScore = allScores.length ? Math.max(...allScores) : 0;

      console.warn('[MatchingEngine] No strong matches in this batch.', {
        threshold: MATCH_THRESHOLD,
        maxScoreInBatch: maxScore,
        totalCompanies: results.length,
      });
    }

    return filteredResults;
  };

  useEffect(() => {
    try {
      const results = calculateMatching();
      setMatchingResults(results);

      // Reset intro generation tracking for new results
      // Only clear domains that are no longer in results
      const newDomains = new Set(results.map(r => r.domain));
      introGenerationAttemptedRef.current.forEach(domain => {
        if (!newDomains.has(domain)) {
          introGenerationAttemptedRef.current.delete(domain);
        }
      });

      if (results.length > 0 && activeResultIndex >= results.length) {
        setActiveResultIndex(0);
      }
    } catch (error) {
      console.error('[MatchingEngine] Error calculating matches:', error);
      setMatchingResults([]);
    }
  }, [signalStrength, predictionResult, signals.jobs, signals.funding, signals.layoffs, signals.hiringVelocity, signals.toolAdoption, provider, connectorProfile]);

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
      const personData = personDataByDomain[activeResult.domain];
      if (!personData?.title) {
        setPersonPressureProfileByDomain(prev => ({
          ...prev,
          [activeResult.domain]: activeResult.pressureProfile
        }));
      }
    }
  }, [activeResult?.pressureProfile, activeResult?.domain, personDataByDomain]);

  useEffect(() => {
    if (activeResult?.domain && isAIConfigured(aiConfig) && !aiWhyNowByDomain[activeResult.domain]) {
      generateWhyNowAndWhyYou(activeResult.domain);
    }
  }, [activeResult?.domain, aiConfig]);

  useEffect(() => {
    if (!activeResult) return;
    const personData = personDataByDomain[activeResult.domain];
    const aiRewrittenIntro = aiRewrittenIntroByDomain[activeResult.domain];
    const finalIntro = finalIntroByDomain[activeResult.domain];
    const outboundReadiness = calculateOutboundReadiness(personData);
    if (outboundReadiness === 'ready' && aiRewrittenIntro && !finalIntro) {
      setFinalIntroByDomain(prev => ({ ...prev, [activeResult.domain]: aiRewrittenIntro }));
      setIntroUnlockedByDomain(prev => ({ ...prev, [activeResult.domain]: false }));
      console.log('[MatchingEngine] Auto-locked intro — contact became ready');
    }
  }, [activeResult?.domain, personDataByDomain, aiRewrittenIntroByDomain, finalIntroByDomain]);

  useEffect(() => {
    if (!activeResult) return;

    const domain = activeResult.domain;
    const personData = personDataByDomain[domain];
    const supplyContact = supplyContactByDomain[domain];
    const hasDemandIntro = demandIntroByDomain[domain];
    const hasSupplyIntro = supplyIntroByDomain[domain];

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
  }, [activeResult?.whoHasPressureRoles, activeResult?.domain, personDataByDomain, supplyContactByDomain, signalStrength, demandIntroByDomain, supplyIntroByDomain, aiConfig]);

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
    const personData = personDataByDomain[domain];
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
    if (!aiConfig || !isAIConfigured(aiConfig)) {
      showToast('warning', 'Please set up AI in Settings first.');
      return;
    }

    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = personDataByDomain[domain];
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
      showToast('error', 'AI rewrite failed. Check Settings and try again.');
    } finally {
      setIsRewritingIntro(false);
    }
  };

  const handleRegenerateIntro = (domain: string) => {
    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = personDataByDomain[domain];
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
    setDemandIntroByDomain(prev => ({ ...prev, [domain]: '' }));
    setSupplyIntroByDomain(prev => ({ ...prev, [domain]: '' }));
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
    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = personDataByDomain[domain];
    // Only require email - name can be extracted from email if missing
    if (!personData?.email) {
      console.log('[DualIntros] No email found, skipping intro generation');
      return;
    }
    // Ensure we have a name - use email prefix as fallback
    const contactName = personData.name || personData.email.split('@')[0];

    console.log('[DualIntros] Generating demand and supply intros for', domain);

    // Get the selected PROVIDER (like Toptal, Terminal, etc.) for this domain
    const selectedProvider = selectedSupplyByDomain[domain];
    const supplyContactForIntro = supplyContactByDomain[domain];

    // Provider info for demand intro - this is WHO we're connecting them to
    const provider = {
      name: selectedProvider?.name || 'a recruiting partner',
      company: selectedProvider?.name || 'a staffing firm',
      specialty: selectedProvider?.specialty || 'fills these roles fast'
    };

    const firstName = contactName.split(' ')[0];
    const signalDetail = result.signalSummary || `${result.jobCount || 0} open roles`;

    // Check if demand intro already exists (don't regenerate unnecessarily)
    const existingDemandIntro = demandIntroByDomain[domain];

    // Generate Demand Intro (to the hiring company) - only if not already generated
    if (!existingDemandIntro) {
      setIsGeneratingDemandIntro(true);
      try {
        // Run generation with minimum delay to prevent UI glitch
        const [demandIntro] = await Promise.all([
          generateDemandIntro(
            aiConfig,
            {
              firstName,
              companyName: result.companyName,
              signalDetail,
              roleLabel: result.jobTitlesBeingHired?.[0] || '',
              roleCount: result.jobCount || 1,
              jobTitles: result.jobTitlesBeingHired || []
            },
            {
              name: provider.name,
              company: provider.company,
              specialty: provider.specialty
            }
          ),
          new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
        ]);
        setDemandIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
        setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
        console.log('[DualIntros] Demand intro generated:', demandIntro);
      } catch (error) {
        console.error('[DualIntros] Demand intro failed:', error);
      } finally {
        setIsGeneratingDemandIntro(false);
      }
    } else {
      console.log('[DualIntros] Demand intro already exists, skipping');
    }

    // Generate Supply Intro (to the provider/recruiter)
    // CRITICAL GATE: Only generate if we have a valid supply contact with email
    if (!supplyContactForIntro || !supplyContactForIntro.email) {
      console.log('[DualIntros] SKIPPING supply intro - no supply contact found');
      // Clear any stale supply intro for this domain
      setSupplyIntroByDomain(prev => {
        const updated = { ...prev };
        delete updated[domain];
        return updated;
      });
      return; // Do not generate supply intro without a real contact
    }

    // This mentions the DEMAND company and DEMAND contact
    // Determine hire category from job titles for better matching
    const hireCategory = extractHireCategory(
      result.jobTitlesBeingHired?.map(t => ({ title: t })),
      result.signalSummary
    );

    setIsGeneratingSupplyIntro(true);
    try {
      // Use actual company name from the contact (from Apollo) - more accurate than selectedProvider
      const actualProviderName = supplyContactForIntro.company;

      // Run generation with minimum delay to prevent UI glitch
      const [supplyIntro] = await Promise.all([
        generateSupplyIntro(
          aiConfig,
          {
            company_name: result.companyName,
            person_name: personData.name,
            title: personData.title || 'decision maker'
          },
          {
            summary: signalDetail,
            roleCount: result.jobCount || 1,
            roleLabel: result.jobTitlesBeingHired?.[0] || '',
            hireCategory: hireCategory,
            fitReason: `${result.companyName} is actively hiring`
          },
          { name: supplyContactForIntro.name },
          {
            name: actualProviderName,
            specialty: selectedProvider?.specialty
          }
        ),
        new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
      ]);
      setSupplyIntroByDomain(prev => ({ ...prev, [domain]: supplyIntro }));
      console.log('[DualIntros] Supply intro generated for', supplyContactForIntro.name, 'at', actualProviderName, ':', supplyIntro);
    } catch (error) {
      console.error('[DualIntros] Supply intro failed:', error);
    } finally {
      setIsGeneratingSupplyIntro(false);
    }
  };

  // Individual regenerate functions for demand and supply intros
  // Added minimum delay to prevent UI glitching from fast state changes
  const regenerateDemandIntro = async (domain: string) => {
    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = personDataByDomain[domain];
    if (!personData?.name) return;

    // Get the selected provider (like Toptal) for this domain
    const selectedProvider = selectedSupplyByDomain[domain];
    const provider = {
      name: selectedProvider?.name || 'a recruiting partner',
      company: selectedProvider?.name || 'a staffing firm',
      specialty: selectedProvider?.specialty || 'fills these roles fast',
    };

    const firstName = personData.name.split(' ')[0];
    const signalDetail = result.signalSummary || `${result.jobCount || 0} open roles`;

    setIsGeneratingDemandIntro(true);

    try {
      // Run generation with minimum delay to prevent UI glitch
      const [demandIntro] = await Promise.all([
        generateDemandIntro(
          aiConfig,
          {
            firstName,
            companyName: result.companyName,
            signalDetail,
            roleLabel: result.jobTitlesBeingHired?.[0] || '',
            roleCount: result.jobCount || 1,
            jobTitles: result.jobTitlesBeingHired || []
          },
          { name: provider.name, company: provider.company, specialty: provider.specialty }
        ),
        new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
      ]);
      setDemandIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
      setAiRewrittenIntroByDomain(prev => ({ ...prev, [domain]: demandIntro }));
      console.log('[DualIntros] Demand intro regenerated:', demandIntro);
    } catch (error) {
      console.error('[DualIntros] Demand intro failed:', error);
    } finally {
      setIsGeneratingDemandIntro(false);
    }
  };

  const regenerateSupplyIntro = async (domain: string) => {
    const result = matchingResults.find(r => r.domain === domain);
    if (!result) return;

    const personData = personDataByDomain[domain];
    if (!personData?.name) return;

    // Get the supply contact (person at provider company)
    const supplyContactForIntro = supplyContactByDomain[domain];
    // Get the selected provider (Toptal, Terminal, etc.)
    const selectedProvider = selectedSupplyByDomain[domain];

    // CRITICAL GATE: Only regenerate if we have a valid supply contact with email
    if (!supplyContactForIntro || !supplyContactForIntro.email) {
      console.log('[DualIntros] Cannot regenerate supply intro - no supply contact found');
      return;
    }

    // Use actual company name from the contact (from Apollo) - more accurate than selectedProvider
    const actualProviderName = supplyContactForIntro.company;
    console.log('[DualIntros] Regenerating supply intro for provider:', actualProviderName, 'contact:', supplyContactForIntro.name);

    const signalDetail = result.signalSummary || `${result.jobCount || 0} open roles`;

    setIsGeneratingSupplyIntro(true);

    try {
      // Run generation with minimum delay to prevent UI glitch
      const [supplyIntro] = await Promise.all([
        generateSupplyIntro(
          aiConfig,
          {
            company_name: result.companyName,
            person_name: personData.name,
            title: personData.title || 'decision maker'
          },
          {
            summary: signalDetail,
            roleCount: result.jobCount || 1,
            roleLabel: result.jobTitlesBeingHired?.[0] || '',
            fitReason: `${result.companyName} is actively hiring`
          },
          { name: supplyContactForIntro.name },
          {
            name: actualProviderName,
            specialty: selectedProvider?.specialty
          }
        ),
        new Promise(resolve => setTimeout(resolve, 400)) // Min delay to prevent glitch
      ]);
      setSupplyIntroByDomain(prev => ({ ...prev, [domain]: supplyIntro }));
      console.log('[DualIntros] Supply intro regenerated for', supplyContactForIntro.name, 'at', actualProviderName, ':', supplyIntro);
    } catch (error) {
      console.error('[DualIntros] Supply intro failed:', error);
    } finally {
      setIsGeneratingSupplyIntro(false);
    }
  };

  const generateWhyNowAndWhyYou = async (domain: string) => {
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
      // Auto-select from dynamically discovered supply companies
      const matches = findMatchingSupply(discoveredSupplyCompanies, hireCategory, 5);

      if (matches.length === 0) {
        console.log('[SupplyEnrich] No supply companies discovered for category:', hireCategory);
        // Show user-friendly message about empty supply
        if (discoveredSupplyCompanies.length === 0) {
          showToast('info', 'No supply entities. Upload Supply dataset or confirm a supplier manually.');
        } else {
          showToast('info', `No ${hireCategory} suppliers found. Try a different category or add suppliers.`);
        }
        return { contact: null, supply: null };
      }

      selectedSupply = matches[0];
      alternatives = matches.slice(1);
    }

    // Check if we have Apollo API key
    const apolloKey = enrichmentConfig?.apolloApiKey || enrichmentConfig?.apiKey;
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

    // Clear previous supply contact
    setSupplyContactByDomain(prev => ({ ...prev, [companyDomain]: null }));
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
      setSelectedSupplyByDomain(prev => ({ ...prev, [companyDomain]: supply }));

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

          // Get appropriate titles for this supply company's category
          const searchTitles = getSupplyEnrichmentTitles(supply.hireCategory);

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
      setSupplyContactByDomain(prev => ({ ...prev, [companyDomain]: foundContact }));
      setSelectedSupplyByDomain(prev => ({ ...prev, [companyDomain]: successfulSupply }));
      // Show providers sorted by confidence (best matches first)
      const remainingAlternatives = sortByConfidence(
        discoveredSupplyCompanies.filter(s => s.domain !== successfulSupply!.domain)
      );
      setAlternativeSupplyByDomain(prev => ({ ...prev, [companyDomain]: remainingAlternatives }));
      const highConfCount = remainingAlternatives.filter(s => s.classification?.confidence === 'high').length;
      console.log(`[SupplyEnrich] === SUCCESS: ${foundContact.name} @ ${successfulSupply.name} (${highConfCount} perfect + ${remainingAlternatives.length - highConfCount} others) ===`);
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

    // Clear cached supply intro immediately
    setSupplyIntroByDomain(prev => {
      const updated = { ...prev };
      delete updated[companyDomain];
      return updated;
    });

    // Enrich with new supply company - returns the contact directly (no stale state)
    const { contact: freshSupplyContact, supply: actualSupply } = await enrichSupplyContact(companyDomain, result, newSupply);

    // Check if we got a valid contact
    if (!freshSupplyContact?.email) {
      console.log('[SupplySwitch] No supply contact with email found at', newSupply.name);
      return;
    }

    // Check if we have demand person data
    const personData = personDataByDomain[companyDomain];
    if (!personData?.name) {
      console.log('[SupplySwitch] No demand contact yet - skipping intro generation');
      return;
    }

    // Generate the new supply intro with FRESH data (not stale state)
    // Use the actual company name from the contact (from Apollo), not the selected supply company
    const actualProviderName = freshSupplyContact.company;
    console.log(`[SupplySwitch] Generating intro for ${freshSupplyContact.name} at ${actualProviderName}`);

    const signalDetail = result.signalSummary || `${result.jobCount || 0} open roles`;
    const providerInfo = actualSupply || newSupply;

    setIsGeneratingSupplyIntro(true);
    try {
      const supplyIntro = await generateSupplyIntro(
        aiConfig,
        {
          company_name: result.companyName,
          person_name: personData.name,
          title: personData.title || 'decision maker'
        },
        {
          summary: signalDetail,
          roleCount: result.jobCount || 1,
          roleLabel: result.jobTitlesBeingHired?.[0] || '',
          fitReason: `${result.companyName} is actively hiring`
        },
        { name: freshSupplyContact.name },
        { name: actualProviderName, specialty: providerInfo.specialty }
      );

      setSupplyIntroByDomain(prev => ({ ...prev, [companyDomain]: supplyIntro }));
      console.log(`[SupplySwitch] ✓ Intro generated for ${freshSupplyContact.name} at ${actualProviderName}`);
    } catch (error) {
      console.error('[SupplySwitch] Intro generation failed:', error);
    } finally {
      setIsGeneratingSupplyIntro(false);
    }
  };

  const handleEnrichPerson = async (companyDomain?: string) => {
    if (!companyDomain) {
      showToast('warning', 'Company info missing. Check signals first.');
      return;
    }

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
      let cachedRecord: any = null;
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
          setPersonDataByDomain(prev => ({ ...prev, [companyDomain]: cachedPerson }));

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

      if (enrichmentConfig.provider === 'none' || !isEnrichmentConfigured(enrichmentConfig)) {
        showToast('warning', 'Set up contact provider in Settings first.');
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

          if (anymailResult) {
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

        setPersonDataByDomain(prev => ({ ...prev, [companyDomain]: person }));
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

        // Update the most recent signal_history record for this domain
        // Note: Supabase update doesn't support order/limit, so we update all matching records
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

        // Step 3: Also enrich supply contact (provider company contact)
        await enrichSupplyContact(cleanDomain, result);
      } else {
        setNoContactsFoundByDomain(prev => ({ ...prev, [companyDomain]: true }));
        showToast('warning', 'No contact found for this company');

        // Mark as enriched even when no contact found (prevents re-attempts)
        await supabase
          .from('signal_history')
          .update({
            enriched_at: new Date().toISOString()
          })
          .eq('company_domain', cleanDomain);
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
    const personData = personDataByDomain[domain];
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
      showToast('error', 'Missing required data for Instantly lead creation');
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
      showToast('error', 'Email is required to send lead to Instantly');
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

      console.log('[Instantly] Lead sent successfully');
      showToast('success', 'Lead sent to Instantly');
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
    const personData = personDataByDomain[domain]; // Demand contact (person at hiring company)

    // For DEMAND: we need the demand contact's email
    if (type === 'DEMAND' && (!result || !personData || !personData.email)) {
      showToast('error', 'Missing contact data for Demand lead');
      return;
    }

    // For SUPPLY: we need to select provider + enrich supply contact
    let supplyContact: SupplyContact | null = null;
    let selectedProvider: SupplyCompany | null = null;
    let supplyIntroForSend: string | undefined;

    if (type === 'SUPPLY') {
      // Step 1: Check if provider already selected
      selectedProvider = selectedSupplyByDomain[domain];

      if (!selectedProvider) {
        showToast('error', 'No provider selected. Enrich contact first.');
        return;
      }
      console.log(`[DualSend] Selected provider: ${selectedProvider.name} (${selectedProvider.domain})`);

      // Step 2: Check if we already have an enriched supply contact
      supplyContact = supplyContactByDomain[domain];

      if (!supplyContact) {
        // Step 3: Enrich supply contact using Apollo
        const apolloKey = enrichmentConfig?.apolloApiKey;
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
            setSupplyContactByDomain(prev => ({ ...prev, [domain]: supplyContact }));
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
      // Use actual company name from the contact (from Apollo) - more accurate than selectedProvider
      const actualProviderName = supplyContact.company;
      console.log(`[DualSend] Generating supply intro for ${supplyContact.name} at ${actualProviderName}...`);
      const supplyFirstName = supplyContact.name.split(' ')[0];
      const demandFirstName = personData?.name?.split(' ')[0] || 'the contact';
      const roleCount = result?.jobCount || 1;
      const signalDetail = result?.signalSummary || `${roleCount} open roles`;

      try {
        const freshSupplyIntro = await generateSupplyIntro(
          aiConfig,
          {
            company_name: result?.companyName || '',
            person_name: personData?.name || demandFirstName, // Full name for canonical template
            title: personData?.title || 'decision maker'
          },
          {
            summary: signalDetail,
            roleCount: roleCount,
            roleLabel: result?.jobTitlesBeingHired?.[0] || 'role',
            hireCategory: result?.hireCategory || 'engineering' // Pass category for canonical template
          },
          {
            name: supplyFirstName
          },
          // Pass actual provider name from Apollo contact - more accurate
          {
            name: actualProviderName,
            specialty: selectedProvider?.specialty
          }
        );
        setSupplyIntroByDomain(prev => ({ ...prev, [domain]: freshSupplyIntro }));
        // Store the intro for immediate use (state won't update synchronously)
        supplyIntroForSend = freshSupplyIntro;
        console.log(`[DualSend] Fresh supply intro generated for ${supplyContact.name} at ${actualProviderName}:`, freshSupplyIntro);
      } catch (error) {
        console.error('[DualSend] Failed to generate supply intro:', error);
        showToast('error', 'Failed to generate supply intro');
        return;
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
    // For Supply, use the freshly generated intro (state update is async)
    const aiGeneratedIntro = type === 'DEMAND'
      ? (demandIntroByDomain[domain] || aiRewrittenIntroByDomain[domain])
      : (supplyIntroForSend || supplyIntroByDomain[domain]);

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
        intro_text: aiGeneratedIntro
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
        intro_text: aiGeneratedIntro
      };

      console.log(`[DualSend] SUPPLY recipient: ${supplyContact!.email} (${supplyContact!.name} @ ${selectedProvider?.name || supplyContact!.company})`);
    }

    try {
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [`${domain}-${type}`]: true }));
      const sendResult = await sendToInstantly(instantlyConfig.apiKey, params);
      setIsSendingInstantlyByDomain(prev => ({ ...prev, [`${domain}-${type}`]: false }));

      if (sendResult.success) {
        console.log(`[DualSend] Successfully sent to ${type} campaign`);
        showToast('success', `Lead sent to ${type === 'DEMAND' ? 'Demand' : 'Supply'} campaign`);

        // Update status tracking - only on real success
        if (type === 'DEMAND') {
          setDemandStatusByDomain(prev => ({ ...prev, [domain]: 'sent' }));
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
        <Dock />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      {toastNotification && (
        <div className={`fixed top-6 right-6 px-5 py-3 rounded-2xl shadow-2xl z-50 animate-slide-in-right flex items-center gap-2 ${
          toastNotification.type === 'cache' ? 'bg-emerald-500/90 text-white' :
          toastNotification.type === 'success' ? 'bg-white/90 text-black' :
          toastNotification.type === 'warning' ? 'bg-white/70 text-black' :
          'bg-white/50 text-black'
        }`}>
          <span className="text-[13px] font-medium">{toastNotification.message}</span>
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
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-gray-200 transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          Back to Connector OS
        </button>

        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white/90 mb-1">Matching Engine</h1>
            <p className="text-sm text-white/40">
              Signal-driven prospecting
            </p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.04] transition-all duration-300"
          >
            <SettingsIcon size={14} className="text-white/40" />
            <span className="text-xs text-white/50">Settings</span>
          </button>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 mt-6">
          <div>
            <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-medium text-white/50">Signals</h3>
                  <div className="flex items-center gap-2">
                    {isRefreshing && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                    )}
                    <button
                      onClick={fetchSignals}
                      disabled={isRefreshing}
                      className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-200 disabled:opacity-30"
                      title="Refresh"
                    >
                      <RefreshCw
                        size={12}
                        className={`text-white/30 ${isRefreshing ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {signals.error && (
                  <div className="mb-4 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                    <div className="text-xs text-white/50">{signals.error}</div>
                  </div>
                )}

                {/* Signal Lines - Minimal */}
                {isRefreshing ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-2.5 w-16 bg-white/[0.04] rounded" />
                        <div className="h-2 w-full bg-white/[0.02] rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Jobs */}
                    <div className="group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1 h-1 rounded-full ${hasJobs ? 'bg-white/50' : 'bg-white/20'}`} />
                        <span className="text-xs text-white/50">Jobs</span>
                      </div>
                      <p className="text-xs text-white/30 leading-relaxed pl-3">
                        {safeText(richJobsSignal?.operatorInsight || signals.jobs.value) || '–'}
                      </p>
                    </div>

                    {/* Funding */}
                    <div className="group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1 h-1 rounded-full ${hasFunding ? 'bg-white/50' : 'bg-white/20'}`} />
                        <span className="text-xs text-white/50">Funding</span>
                      </div>
                      <p className="text-xs text-white/30 leading-relaxed pl-3">
                        {safeText(richFundingSignal?.operatorInsight || signals.funding.value) || '–'}
                      </p>
                    </div>

                    {/* Layoffs */}
                    <div className="group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1 h-1 rounded-full ${hasLayoffs ? 'bg-white/50' : 'bg-white/20'}`} />
                        <span className="text-xs text-white/50">Layoffs</span>
                      </div>
                      <p className="text-xs text-white/30 leading-relaxed pl-3">
                        {safeText(richLayoffsSignal?.operatorInsight || signals.layoffs.value) || '–'}
                      </p>
                    </div>

                    {/* Supply */}
                    <div className="group pt-3 border-t border-white/[0.04]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1 h-1 rounded-full ${discoveredSupplyCompanies.length > 0 ? 'bg-white/50' : 'bg-white/20'}`} />
                        <span className="text-xs text-white/50">Supply</span>
                      </div>
                      <p className="text-xs text-white/30 leading-relaxed pl-3">
                        {supplyDiscoveryStatus === 'loading'
                          ? 'Finding best matches...'
                          : (() => {
                              // Use alternatives for active result if available, otherwise global count
                              const alternatives = activeResult ? (alternativeSupplyByDomain[activeResult.domain] || []) : discoveredSupplyCompanies;
                              const bestMatches = alternatives.filter(
                                s => s.classification?.confidence === 'high'
                              );
                              const worthATry = alternatives.filter(
                                s => s.classification?.confidence !== 'high'
                              );

                              if (bestMatches.length === 0 && worthATry.length === 0) {
                                // Fallback to global count if no alternatives yet
                                const globalBest = discoveredSupplyCompanies.filter(s => s.classification?.confidence === 'high').length;
                                if (globalBest > 0) return `${globalBest} Best Matches`;
                                return discoveredSupplyCompanies.length > 0 ? `${discoveredSupplyCompanies.length} providers` : '–';
                              }
                              // Show both counts to match dropdown
                              if (bestMatches.length > 0 && worthATry.length > 0) {
                                return `${bestMatches.length} Best + ${worthATry.length} more`;
                              }
                              if (bestMatches.length > 0) {
                                return `${bestMatches.length} Best Match${bestMatches.length !== 1 ? 'es' : ''}`;
                              }
                              return `${worthATry.length} Worth a Try`;
                            })()}
                      </p>
                    </div>
                  </div>
                )}

                <JobTrendChart userId="default" onTrendChange={setTrendDirection} />

              </div>
            </div>

            {/* Intro Cards - Clean, spacious */}
            <div className="mt-6 space-y-4">
              {/* TO COMPANY */}
              <div className="group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/25">To {activeResult?.companyName || 'company'}</span>
                  {activeResult && demandIntroByDomain[activeResult.domain] && !isGeneratingDemandIntro && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(demandIntroByDomain[activeResult.domain]);
                        showToast('success', 'Copied');
                      }}
                      className="text-[10px] text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div className={isGeneratingDemandIntro ? 'shimmer rounded-lg p-4' : ''}>
                  {isGeneratingDemandIntro ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-white/[0.04] rounded" />
                      <div className="h-3 w-4/5 bg-white/[0.04] rounded" />
                    </div>
                  ) : activeResult && demandIntroByDomain[activeResult.domain] ? (
                    <p className="text-[13px] leading-[1.7] text-white/60">
                      {demandIntroByDomain[activeResult.domain]}
                    </p>
                  ) : (
                    <p className="text-[12px] text-white/20">–</p>
                  )}
                </div>
              </div>

              {/* TO PROVIDER */}
              <div className="group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/25">To {cleanCompanyName(selectedSupplyByDomain[activeResult?.domain || '']?.name || '') || 'provider'}</span>
                  {activeResult && supplyIntroByDomain[activeResult.domain] && !isGeneratingSupplyIntro && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(supplyIntroByDomain[activeResult.domain]);
                        showToast('success', 'Copied');
                      }}
                      className="text-[10px] text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div className={isGeneratingSupplyIntro ? 'shimmer rounded-lg p-4' : ''}>
                  {isGeneratingSupplyIntro ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-white/[0.04] rounded" />
                      <div className="h-3 w-4/5 bg-white/[0.04] rounded" />
                    </div>
                  ) : activeResult && supplyIntroByDomain[activeResult.domain] ? (
                    <p className="text-[13px] leading-[1.7] text-white/60">
                      {supplyIntroByDomain[activeResult.domain]}
                    </p>
                  ) : (
                    <p className="text-[12px] text-white/20">–</p>
                  )}
                </div>
              </div>

              {/* Regenerate - only show if at least one intro is missing */}
              {activeResult && aiConfig && isAIConfigured(aiConfig) &&
               !conversationStartedByDomain[activeResult.domain] &&
               (!demandIntroByDomain[activeResult.domain] || !supplyIntroByDomain[activeResult.domain]) && (
                <button
                  onClick={() => handleRegenerateIntro(activeResult.domain)}
                  disabled={isGeneratingDemandIntro || isGeneratingSupplyIntro}
                  className="text-[10px] text-white/15 hover:text-white/40 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  {(isGeneratingDemandIntro || isGeneratingSupplyIntro) ? 'Generating...' : 'Regenerate'}
                </button>
              )}
            </div>

          </div>

          <div>
            <div className="flex gap-4">
              <div className="w-56 flex-shrink-0">
              <div className="bg-[#0a0a0a] rounded-2xl p-3 border border-white/[0.04] sticky top-4">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/[0.04]">
                  <h3 className="text-[9px] uppercase tracking-wider text-white/30">
                    {isRefreshing ? (
                      <span className="flex items-center gap-1.5">
                        Companies
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
                      </span>
                    ) : matchingResults.length > 0 ? (
                      `Companies (${matchingResults.length})`
                    ) : (
                      'Companies'
                    )}
                  </h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto no-scrollbar scroll-fade snap-list">
                  {isRefreshing ? (
                    <>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className="w-full px-3 py-2.5 snap-item"
                        >
                          <div className="h-3 w-24 bg-white/5 rounded animate-pulse mb-1.5" />
                          <div className="h-2 w-16 bg-white/[0.03] rounded animate-pulse" />
                        </div>
                      ))}
                    </>
                  ) : (
                    matchingResults.map((result, idx) => (
                      <button
                        key={result.id}
                        onClick={() => setActiveResultIndex(idx)}
                        className={`snap-item w-full text-left px-3 py-2.5 ${
                          idx === activeResultIndex
                            ? 'signal-row-active'
                            : 'signal-row'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1 h-1 rounded-full flex-shrink-0 ${
                              idx === activeResultIndex ? 'bg-white/60' : 'bg-white/30'
                            }`}
                          />
                          <span className={`text-xs truncate ${
                            idx === activeResultIndex ? 'text-white/90' : 'text-white/60'
                          }`}>
                            {result.companyName}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/25 mt-0.5 pl-3">
                          {result.jobCount} {result.jobCount === 1 ? 'role' : 'roles'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1">
              {matchingResults.length === 0 && connectorProfile && !isRefreshing && (
                <div className="rounded-2xl border border-dashed border-white/[0.06] bg-[#0a0a0a] p-4 text-center">
                  <div className="text-[11px] text-white/60 mb-2">
                    No matches found.
                  </div>
                  <div className="text-[10px] text-white/40">
                    Could not build company list from jobs response. Check console for details.
                  </div>
                </div>
              )}

              <div className="relative">
                {/* Skeleton placeholder during refresh */}
                {isRefreshing && matchingResults.length === 0 && (
                  <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-white/[0.04]">
                    {/* Skeleton header */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <div className="h-3.5 w-28 bg-white/5 rounded animate-pulse" />
                        <div className="h-2.5 w-16 bg-white/[0.03] rounded animate-pulse" />
                      </div>
                      <div className="h-4 w-14 bg-white/[0.03] rounded animate-pulse" />
                    </div>

                    {/* Skeleton person card */}
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-8 w-8 bg-white/5 rounded-full animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
                            <div className="h-2 w-16 bg-white/[0.03] rounded animate-pulse" />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <div className="h-7 flex-1 bg-white/[0.03] rounded animate-pulse" />
                          <div className="h-7 flex-1 bg-white/[0.03] rounded animate-pulse" />
                        </div>
                      </div>

                      {/* Skeleton why now */}
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-10 bg-white/[0.02] rounded animate-pulse" />
                        <div className="flex-1 h-2 bg-white/[0.03] rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}

                {matchingResults.map((result, resultIndex) => {
                  if (resultIndex !== activeResultIndex) return null;
                const personData = personDataByDomain[result.domain];
                const personPressureProfile = personPressureProfileByDomain[result.domain];
                const conversationStarted = conversationStartedByDomain[result.domain];
                const isEnrichingPerson = isEnrichingDomain === result.domain;
                const finalIntro = finalIntroByDomain[result.domain];
                const isSendingInstantly = isSendingInstantlyByDomain[result.domain];
                const outboundReadiness = calculateOutboundReadiness(personData);

                return (
                  <div key={result.id}>
                    <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-white/[0.04]">
                      {/* Company Header */}
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-[11px] font-medium text-white/90 truncate">
                            {result.companyName}
                          </h3>
                          {result.domain && (
                            <span className="text-[8px] text-white/30">
                              {result.domain}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-white/30">
                          {result.jobCount} {result.jobCount === 1 ? 'role' : 'roles'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {/* Person Contact Card */}
                        <PersonContactCard
                          personData={personData}
                          targetTitles={result.targetTitles || []}
                          isEnriching={isEnrichingPerson}
                          onEnrichClick={() => !conversationStarted && handleEnrichPerson(result.domain)}
                          enrichmentConfigured={isEnrichmentConfigured(enrichmentConfig)}
                          intro={getSuggestedIntro(result.domain)}
                          onRefreshContact={!conversationStarted ? () => handleEnrichPerson(result.domain) : undefined}
                          onConversationStarted={() => setConversationStartedByDomain(prev => ({ ...prev, [result.domain]: true }))}
                          demandStatus={demandStatusByDomain[result.domain] || 'not_sent'}
                          supplyStatus={supplyStatusByDomain[result.domain] || 'not_sent'}
                          onSendToDemand={() => handleDualSend(result.domain, 'DEMAND')}
                          onSendToSupply={() => handleDualSend(result.domain, 'SUPPLY')}
                          onSendBoth={() => handleSendBoth(result.domain)}
                          onSkip={() => setActiveResultIndex((activeResultIndex + 1) % matchingResults.length)}
                          hasDemandCampaign={!!instantlyConfig?.campaignDemand}
                          hasSupplyCampaign={!!instantlyConfig?.campaignSupply}
                          isSendingDemand={isSendingInstantlyByDomain[`${result.domain}-DEMAND`] || false}
                          isSendingSupply={isSendingInstantlyByDomain[`${result.domain}-SUPPLY`] || false}
                          supplyContact={supplyContactByDomain[result.domain]}
                          selectedSupply={selectedSupplyByDomain[result.domain]}
                          alternativeSupply={alternativeSupplyByDomain[result.domain] || []}
                          onSwitchSupply={(supply) => handleSwitchSupply(result.domain, supply)}
                          isEnrichingSupply={isEnrichingSupplyByDomain[result.domain] || false}
                          demandIntro={demandIntroByDomain[result.domain]}
                          supplyIntro={supplyIntroByDomain[result.domain]}
                          companyName={result.companyName}
                          companyDomain={result.domain}
                          onConfirmAsSupplier={
                            // Only show if: contact has email, no supply exists, and title looks like decision-maker
                            personData?.email && discoveredSupplyCompanies.length === 0 && looksLikeSupplierContact(personData?.title || '')
                              ? () => setPendingSupplyConfirmation({
                                  domain: result.domain,
                                  companyName: result.companyName,
                                  contactName: personData?.name || '',
                                  contactEmail: personData?.email || '',
                                  contactTitle: personData?.title || '',
                                  hireCategory: extractHireCategory(result.jobTitlesBeingHired?.map(t => ({ title: t })), result.signalSummary),
                                })
                              : undefined
                          }
                        />

                      </div>
                    </div>
                  </div>
                );
              })}
                {currentStep === 'matching-engine' && matchingResults.length > 0 && (
                  <TourTooltip
                    step="Step 3 of 4"
                    title="Your First Match"
                    description="Here's your first match. This is where you see pressure, forecasting, and insights."
                    onNext={nextStep}
                    onSkip={skipOnboarding}
                    position="bottom"
                  />
                )}
              </div>

              {/* Operator Summary */}
              {!isRefreshing && matchingResults.length > 0 && (
                <div className="mt-3 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[10px] text-white/40">{getOperatorCue()}</p>
                </div>
              )}
            </div>
            </div>
          </div>

        </div>

      </div>

      <AppHeader />
      <Dock />
    </div>
  );
}

export default MatchingEngineV3;
