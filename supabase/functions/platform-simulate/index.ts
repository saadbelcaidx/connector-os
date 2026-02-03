/**
 * PLATFORM SIMULATE EDGE FUNCTION
 *
 * Searches signal sources and returns strategic alignments.
 * SSM-gated — requires authenticated user with approved SSM access.
 *
 * POST /platform-simulate
 * Body: { source, criteria, userId }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  withCors,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// TYPES
// =============================================================================

interface SearchRequest {
  source: string;
  criteria: {
    mode: 'demand' | 'supply';
    industryVertical: string;
    companySize: string;
    geography: string;
    signalSources: string[];
  };
  userId: string;
}

interface Signal {
  type: string;
  title: string;
  description?: string;
  date?: string;
  amount?: number;
}

interface StrategicAlignment {
  company: string;
  domain?: string;
  score: number;
  tier: 'premier' | 'strong' | 'good';
  signals: Signal[];
  matchReason: string;
}

// =============================================================================
// SSM VERIFICATION
// =============================================================================

async function verifySSMAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('ssm_access')
    .select('status')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle();

  return !!data;
}

// =============================================================================
// ANALYTICS TRACKING
// =============================================================================

async function trackSearch(
  supabase: ReturnType<typeof createClient>,
  configId: string | null,
  source: string,
  criteria: SearchRequest['criteria'],
  resultsCount: number
): Promise<void> {
  if (!configId) return;

  try {
    await supabase.from('platform_analytics').insert({
      platform_config_id: configId,
      event_type: 'search',
      event_data: {
        source,
        criteria,
        results_count: resultsCount,
      },
    });
  } catch (error) {
    // Fire and forget — don't block search results
    console.warn('[platform-simulate] Analytics tracking failed:', error);
  }
}

// =============================================================================
// SIGNAL SOURCE QUERIES
// =============================================================================

async function queryNIHGrants(
  supabase: ReturnType<typeof createClient>,
  criteria: SearchRequest['criteria']
): Promise<StrategicAlignment[]> {
  const { data: grants } = await supabase
    .from('nih_grants')
    .select('*')
    .limit(10);

  if (!grants || grants.length === 0) {
    return [];
  }

  return grants.map((grant: any) => ({
    company: grant.organization_name || 'Research Institution',
    domain: grant.organization_name?.toLowerCase().replace(/\s+/g, '') + '.edu',
    score: Math.floor(Math.random() * 30) + 60,
    tier: 'strong' as const,
    signals: [
      {
        type: 'nih_grants',
        title: grant.project_title || 'NIH Research Grant',
        description: `Award: ${grant.award_amount ? '$' + grant.award_amount.toLocaleString() : 'N/A'}`,
        date: grant.award_date,
        amount: grant.award_amount,
      },
    ],
    matchReason: 'Active NIH research funding indicates growth and capability',
  }));
}

async function queryClinicalTrials(
  supabase: ReturnType<typeof createClient>,
  criteria: SearchRequest['criteria']
): Promise<StrategicAlignment[]> {
  const { data: trials } = await supabase
    .from('clinical_trials')
    .select('*')
    .limit(10);

  if (!trials || trials.length === 0) {
    return [];
  }

  return trials.map((trial: any) => ({
    company: trial.sponsor || 'Clinical Sponsor',
    domain: trial.sponsor?.toLowerCase().replace(/\s+/g, '') + '.com',
    score: Math.floor(Math.random() * 25) + 65,
    tier: 'strong' as const,
    signals: [
      {
        type: 'clinical_trials',
        title: trial.trial_title || 'Clinical Trial',
        description: `Phase: ${trial.phase || 'N/A'}`,
        date: trial.start_date,
      },
    ],
    matchReason: 'Active clinical trials indicate R&D investment and growth',
  }));
}

async function queryFederalContracts(
  supabase: ReturnType<typeof createClient>,
  criteria: SearchRequest['criteria']
): Promise<StrategicAlignment[]> {
  const { data: contracts } = await supabase
    .from('federal_contracts')
    .select('*')
    .limit(10);

  if (!contracts || contracts.length === 0) {
    return [];
  }

  return contracts.map((contract: any) => ({
    company: contract.vendor_name || 'Government Contractor',
    domain: contract.vendor_name?.toLowerCase().replace(/\s+/g, '') + '.com',
    score: Math.floor(Math.random() * 20) + 70,
    tier: 'premier' as const,
    signals: [
      {
        type: 'federal_contracts',
        title: contract.contract_description || 'Federal Contract',
        description: `Value: ${contract.contract_value ? '$' + contract.contract_value.toLocaleString() : 'N/A'}`,
        date: contract.award_date,
        amount: contract.contract_value,
      },
    ],
    matchReason: 'Federal contract awards indicate stable revenue and growth potential',
  }));
}

async function queryFundedStartups(
  supabase: ReturnType<typeof createClient>,
  criteria: SearchRequest['criteria']
): Promise<StrategicAlignment[]> {
  const { data: startups } = await supabase
    .from('funded_startups')
    .select('*')
    .limit(10);

  if (!startups || startups.length === 0) {
    return [];
  }

  return startups.map((startup: any) => ({
    company: startup.company_name || 'Funded Startup',
    domain: startup.domain || startup.company_name?.toLowerCase().replace(/\s+/g, '') + '.com',
    score: Math.floor(Math.random() * 25) + 65,
    tier: 'strong' as const,
    signals: [
      {
        type: 'funded_startups',
        title: `${startup.funding_round || 'Funding'} Round`,
        description: `Raised: ${startup.funding_amount ? '$' + startup.funding_amount.toLocaleString() : 'N/A'}`,
        date: startup.funding_date,
        amount: startup.funding_amount,
      },
    ],
    matchReason: 'Recent funding indicates growth trajectory and hiring needs',
  }));
}

async function queryJobSignals(
  supabase: ReturnType<typeof createClient>,
  criteria: SearchRequest['criteria']
): Promise<StrategicAlignment[]> {
  const { data: jobs } = await supabase
    .from('job_signals')
    .select('*')
    .limit(10);

  if (!jobs || jobs.length === 0) {
    return [];
  }

  return jobs.map((job: any) => ({
    company: job.company_name || 'Hiring Company',
    domain: job.domain || job.company_name?.toLowerCase().replace(/\s+/g, '') + '.com',
    score: Math.floor(Math.random() * 30) + 55,
    tier: 'good' as const,
    signals: [
      {
        type: 'job_signals',
        title: job.job_title || 'Open Position',
        description: `Location: ${job.location || 'Remote'}`,
        date: job.posted_date,
      },
    ],
    matchReason: 'Active hiring signals indicate growth and expansion',
  }));
}

// =============================================================================
// HANDLER
// =============================================================================

export default withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests allowed', 405);
  }

  const body = await parseJsonBody<SearchRequest>(req);

  if (!body) {
    return errorResponse('INVALID_BODY', 'Request body must be valid JSON', 400);
  }

  const { source, criteria, userId } = body;

  if (!source || !criteria || !userId) {
    return errorResponse('MISSING_FIELDS', 'source, criteria, and userId are required', 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify SSM access
    const hasAccess = await verifySSMAccess(supabase, userId);
    if (!hasAccess) {
      return errorResponse('SSM_ACCESS_REQUIRED', 'SSM membership required for this feature', 403);
    }

    // Get user's platform config (for analytics)
    const { data: config } = await supabase
      .from('platform_configs')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    // Query the appropriate signal source
    let alignments: StrategicAlignment[] = [];

    switch (source) {
      case 'nih_grants':
        alignments = await queryNIHGrants(supabase, criteria);
        break;
      case 'clinical_trials':
        alignments = await queryClinicalTrials(supabase, criteria);
        break;
      case 'federal_contracts':
        alignments = await queryFederalContracts(supabase, criteria);
        break;
      case 'funded_startups':
        alignments = await queryFundedStartups(supabase, criteria);
        break;
      case 'job_signals':
        alignments = await queryJobSignals(supabase, criteria);
        break;
      default:
        return errorResponse('INVALID_SOURCE', `Unknown signal source: ${source}`, 400);
    }

    // Track search (fire and forget)
    trackSearch(supabase, config?.id || null, source, criteria, alignments.length);

    return jsonResponse({
      alignments,
      meta: {
        source,
        count: alignments.length,
      },
    });
  } catch (error) {
    console.error('[platform-simulate] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
