/**
 * STRATEGIC ALIGNMENT PLATFORM — TYPE DEFINITIONS
 * All TypeScript interfaces for the platform feature.
 */

// =============================================================================
// PLATFORM CONFIGURATION
// =============================================================================

export interface PlatformConfig {
  id: string;
  user_id: string;
  slug: string;
  brand_name: string;
  logo_url?: string;
  primary_color: string;
  background_color: string;
  headline: string;
  subheadline?: string;  // Custom subheadline (member's copy, not OS branding)
  cta_text: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// MODE SELECTION
// =============================================================================

export type PlatformMode = 'demand' | 'supply';

export interface ModeOption {
  id: PlatformMode;
  title: string;
  description: string;
  icon: string;
}

// =============================================================================
// SIGNAL SOURCES
// =============================================================================

export type SignalSource =
  | 'clinical_trials'
  | 'nih_grants'
  | 'funded_startups'
  | 'federal_contracts'
  | 'job_signals';

export interface SignalSourceConfig {
  id: SignalSource;
  name: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
}

// =============================================================================
// SIGNALS & MATCHES
// =============================================================================

export interface Signal {
  type: SignalSource | string;
  title: string;
  description?: string;
  date?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export interface StrategicAlignment {
  id?: string;
  company: string;
  domain?: string;
  contactName?: string;
  contactTitle?: string;
  signals: Signal[];
  score: number;
  tier: 'premier' | 'strong' | 'good';
  matchReason?: string;
  rationale?: string[];
}

// =============================================================================
// SEARCH CRITERIA
// =============================================================================

export interface SearchCriteria {
  mode: PlatformMode;
  industry?: string;
  companySize?: string;
  geography?: string;
  signalSources: SignalSource[];
  similarCompanies?: string[]; // Domains for hybrid mode
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface PlatformSearchResponse {
  alignments: StrategicAlignment[];
  stats: {
    total_scanned: number;
    total_matched: number;
    avg_score: number;
  };
  meta: {
    sources_queried: SignalSource[];
    query_time_ms: number;
  };
}

export interface PlatformConfigResponse {
  config: PlatformConfig;
}

// =============================================================================
// UI STATE
// =============================================================================

export type PlatformState =
  | 'loading_config'
  | 'ready'
  | 'mode_select'
  | 'criteria_input'
  | 'analyzing'
  | 'results'
  | 'error';

export interface PlatformError {
  type: 'config_error' | 'rate_limited' | 'network_error' | 'no_results';
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// =============================================================================
// ANALYTICS EVENTS
// =============================================================================

export type AnalyticsEventType =
  | 'platform_accessed'
  | 'mode_selected'
  | 'search_executed'
  | 'results_shown'
  | 'source_selected';

export interface AnalyticsEvent {
  event_type: AnalyticsEventType;
  event_data: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// PLATFORM INTELLIGENCE (Real-time Exa + Apollo)
// =============================================================================

export type IntelligenceSignalType =
  | 'funding'
  | 'exec_change'
  | 'hiring'
  | 'acquisition'
  | 'certification'
  | 'expansion'
  | 'partnership'
  | 'other';

export type IntelligenceSourceType =
  | 'company_page'
  | 'news'
  | 'job_posting'
  | 'press_release';

export type SeniorityLevel =
  | 'c_suite'
  | 'vp'
  | 'director'
  | 'manager'
  | 'other';

export interface IntelligenceCompany {
  companyName: string;
  companyDomain: string | null;
  signalType: IntelligenceSignalType;
  signalTitle: string;
  signalDate: string | null;
  sourceUrl: string;
  sourceType: IntelligenceSourceType;
  sourceTitle: string;
  matchScore: number;
  confidence: number;
}

export interface IntelligenceContact {
  fullName: string | null;
  firstName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  seniorityLevel: SeniorityLevel;
  source: 'apollo' | 'anymail' | null;
}

export interface IntelligenceResult {
  company: IntelligenceCompany;
  contact: IntelligenceContact | null;
}

export interface IntelligenceMeta {
  query: string;
  resultCount: number;
  latencyMs: number;
  cached: boolean;
  costs: {
    exa: number;
    ai: number;
    enrichment: number;
    total: number;
  };
}

export interface IntelligenceResponse {
  success: boolean;
  results: IntelligenceResult[];
  meta: IntelligenceMeta;
  error?: string;
}

// Graph node for visualization
export interface IntelligenceNode {
  id: string;
  type: 'query' | 'company' | 'contact';
  label: string;
  sublabel?: string;
  score?: number;
  signalType?: IntelligenceSignalType;
  sourceType?: IntelligenceSourceType;
  data?: IntelligenceResult;
}

export interface IntelligenceEdge {
  source: string;
  target: string;
  label?: string;
}
