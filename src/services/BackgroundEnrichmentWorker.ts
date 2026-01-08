/**
 * BackgroundEnrichmentWorker.ts
 *
 * BACKGROUND ENRICHMENT WORKER v0
 *
 * Fills PreEnrichedContactsPool ahead of time when demand pressure is detected.
 * Runs in background, sequential, paced for API safety.
 *
 * KEY PRINCIPLES:
 * - Fire-and-forget (doesn't block UI)
 * - Sequential enrichment (one at a time)
 * - Paced (respects API throughput)
 * - Only enriches domains from TrustedDemandPools
 * - Only adds contacts with verified email to pool
 *
 * LIFECYCLE:
 * 1. Pressure detected → demand companies in TrustedDemandPools
 * 2. Worker picks unenriched domains (not in PreEnrichedContactsPool)
 * 3. Worker enriches sequentially with delays
 * 4. Verified contacts added to PreEnrichedContactsPool
 * 5. Batch send consumes from pool (fast, deterministic)
 */

import type { RoleType } from '../pressure/InversionTable';
import type { PreEnrichedContactsPools, PreEnrichedContact, EmailSource, EmailVerificationStatus } from './PreEnrichedContactsPool';
import {
  createPreEnrichedContact,
  addToPreEnrichedPool,
  getDomainsNeedingEnrichment,
  getReadyCount
} from './PreEnrichedContactsPool';
import type { TrustedDemandPools } from './TrustedDemandPools';
import { getDomainsForRole } from './TrustedDemandPools';
import { verifyEmail as anymailVerifyEmail } from './AnymailFinderService';
import { ssmVerifyEmail } from './SSMVerifyService';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerProgress {
  roleType: RoleType;
  totalToEnrich: number;
  enriched: number;
  succeeded: number;
  failed: number;
  isRunning: boolean;
  startedAt?: string;
  lastActivityAt?: string;
}

export type WorkerProgressMap = Partial<Record<RoleType, WorkerProgress>>;

export interface EnrichmentResult {
  email?: string;
  name?: string;
  title?: string;
  linkedin?: string;
  companyName?: string;
  signalSummary?: string;
  signalStrength?: number;
  emailSource: EmailSource; // 'apollo' | 'anymailfinder' | 'apify'
}

export interface EnrichmentFunction {
  (domain: string, roleType: RoleType): Promise<EnrichmentResult | null>;
}

// Callback for when a contact is found (for live feed UI)
export interface ContactFoundCallback {
  (contact: {
    name: string;
    title: string;
    company: string;
    domain: string;
    email: string;
  }): void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Delay between enrichments (ms) - paced for API safety
const ENRICHMENT_DELAY_MS = 1000;

// Contacts to process per cycle - process ALL (no artificial limit)
const CONTACTS_PER_CYCLE = 500;

// Target pool capacity before pausing - match batch size
const TARGET_POOL_CAPACITY = 500;

// ============================================================================
// WORKER STATE
// ============================================================================

// Track running workers to prevent duplicates
const runningWorkers: Set<RoleType> = new Set();

// Progress tracking
let workerProgress: WorkerProgressMap = {};

// ============================================================================
// CORE WORKER
// ============================================================================

/**
 * Start background enrichment for a roleType.
 * Fire-and-forget - returns immediately, enrichment runs in background.
 *
 * @param roleType - Role to enrich for
 * @param demandPools - TrustedDemandPools (source of domains)
 * @param currentPools - Current PreEnrichedContactsPools
 * @param enrichFn - Function to call for enrichment
 * @param anymailfinderApiKey - API key for email verification (required for Apollo emails)
 * @param onPoolUpdate - Callback when pool is updated (for state sync)
 * @param onProgress - Callback for progress updates
 */
export function startBackgroundEnrichment(
  roleType: RoleType,
  demandPools: TrustedDemandPools,
  currentPools: PreEnrichedContactsPools,
  enrichFn: EnrichmentFunction,
  anymailfinderApiKey: string | undefined,
  ssmApiKey: string | undefined,
  onPoolUpdate: (pools: PreEnrichedContactsPools) => void,
  onProgress?: (progress: WorkerProgress) => void,
  onContactFound?: ContactFoundCallback
): void {
  // Don't start if already running
  if (runningWorkers.has(roleType)) {
    console.log(`[BackgroundEnrichment] Worker already running for ${roleType}`);
    return;
  }

  // Check if pool is already at target
  const currentCount = getReadyCount(currentPools, roleType);
  if (currentCount >= TARGET_POOL_CAPACITY) {
    console.log(`[BackgroundEnrichment] Pool for ${roleType} at capacity`);
    return;
  }

  // Get domains needing enrichment
  const demandDomains = getDomainsForRole(demandPools, roleType);
  const domainsToEnrich = getDomainsNeedingEnrichment(
    demandDomains,
    currentPools,
    roleType,
    CONTACTS_PER_CYCLE
  );

  if (domainsToEnrich.length === 0) {
    console.log(`[BackgroundEnrichment] No domains need enrichment for ${roleType}`);
    return;
  }

  console.log(`[BackgroundEnrichment] Starting worker for ${roleType}, ${domainsToEnrich.length} domains`);

  // Mark as running
  runningWorkers.add(roleType);

  // Initialize progress
  const progress: WorkerProgress = {
    roleType,
    totalToEnrich: domainsToEnrich.length,
    enriched: 0,
    succeeded: 0,
    failed: 0,
    isRunning: true,
    startedAt: new Date().toISOString()
  };
  workerProgress[roleType] = progress;

  // Fire and forget - run async
  runEnrichmentLoop(
    roleType,
    domainsToEnrich,
    currentPools,
    enrichFn,
    anymailfinderApiKey,
    ssmApiKey,
    onPoolUpdate,
    (p) => {
      workerProgress[roleType] = p;
      onProgress?.(p);
    },
    onContactFound
  ).catch(err => {
    console.error(`[BackgroundEnrichment] Worker error for ${roleType}:`, err);
  }).finally(() => {
    runningWorkers.delete(roleType);
    if (workerProgress[roleType]) {
      workerProgress[roleType]!.isRunning = false;
    }
  });
}

/**
 * Internal enrichment loop - runs sequentially with delays
 * Includes EMAIL VERIFICATION (SSM → Anymail order) for ALL emails.
 */
async function runEnrichmentLoop(
  roleType: RoleType,
  domains: string[],
  initialPools: PreEnrichedContactsPools,
  enrichFn: EnrichmentFunction,
  anymailfinderApiKey: string | undefined,
  ssmApiKey: string | undefined,
  onPoolUpdate: (pools: PreEnrichedContactsPools) => void,
  onProgress: (progress: WorkerProgress) => void,
  onContactFound?: ContactFoundCallback
): Promise<void> {
  let pools = initialPools;
  const progress = workerProgress[roleType]!;

  for (const domain of domains) {
    // Check if we should stop (pool at capacity)
    const currentCount = getReadyCount(pools, roleType);
    if (currentCount >= TARGET_POOL_CAPACITY) {
      console.log(`[BackgroundEnrichment] Pool at capacity for ${roleType}`);
      break;
    }

    // Check if worker was cancelled
    if (!runningWorkers.has(roleType)) {
      console.log(`[BackgroundEnrichment] Worker cancelled for ${roleType}`);
      break;
    }

    try {
      console.log(`[BackgroundEnrichment] Enriching ${domain} for ${roleType}...`);

      const result = await enrichFn(domain, roleType);

      if (result?.email) {
        const emailSource = result.emailSource;
        let verificationStatus: EmailVerificationStatus;

        // VERIFICATION DOCTRINE: SSM first → Anymail fallback
        // NO blind trust. NO regex-only. Every email must be verified.
        console.log(`[BackgroundEnrichment] Verifying ${result.email} (source: ${emailSource})`);

        // STEP 1: Try SSM verify first (if available)
        if (ssmApiKey) {
          try {
            console.log(`[BackgroundEnrichment] Trying SSM verify for: ${result.email}`);
            const ssmResult = await ssmVerifyEmail(ssmApiKey, result.email);
            if (ssmResult.success && ssmResult.status === 'verified') {
              verificationStatus = 'verified';
              console.log(`[BackgroundEnrichment] ✓ SSM verified: ${result.email}`);
            } else if (ssmResult.success) {
              console.log(`[BackgroundEnrichment] SSM rejected: ${result.email} (${ssmResult.status})`);
              // Don't set status yet - try Anymail fallback
              verificationStatus = 'risky'; // Will be overwritten if Anymail succeeds
            } else {
              verificationStatus = 'risky'; // SSM error - try Anymail
            }
          } catch (err) {
            console.error(`[BackgroundEnrichment] SSM verify error:`, err);
            verificationStatus = 'risky'; // Try Anymail fallback
          }
        } else {
          verificationStatus = 'risky'; // No SSM - will try Anymail
        }

        // STEP 2: Try Anymail verify if SSM didn't verify (and Anymail available)
        if (verificationStatus !== 'verified' && anymailfinderApiKey) {
          try {
            console.log(`[BackgroundEnrichment] Trying Anymail verify for: ${result.email}`);
            const anymailResult = await anymailVerifyEmail(anymailfinderApiKey, result.email);
            if (anymailResult.status === 'verified') {
              verificationStatus = 'verified';
              console.log(`[BackgroundEnrichment] ✓ Anymail verified: ${result.email}`);
            } else {
              verificationStatus = anymailResult.status === 'invalid' ? 'invalid' : 'risky';
              console.log(`[BackgroundEnrichment] Anymail rejected: ${result.email} (${anymailResult.status})`);
            }
          } catch (err) {
            console.error(`[BackgroundEnrichment] Anymail verify error:`, err);
            // Keep status from SSM or risky
          }
        }

        // STEP 3: No providers = fail
        if (!ssmApiKey && !anymailfinderApiKey) {
          console.log(`[BackgroundEnrichment] No verification provider, cannot verify: ${result.email}`);
          verificationStatus = 'invalid';
        }

        // Log final status
        if (verificationStatus === 'verified') {
          console.log(`[BackgroundEnrichment] ✓ Email verified: ${result.email}`);
        } else {
          console.log(`[BackgroundEnrichment] ✗ Email not verified: ${result.email} (${verificationStatus})`);
        }

        // Only add to pool if verified
        const contact = createPreEnrichedContact(
          domain,
          result.companyName || domain,
          roleType,
          {
            email: result.email,
            name: result.name || '',
            title: result.title || '',
            linkedin: result.linkedin
          },
          emailSource,
          verificationStatus,
          result.signalSummary,
          result.signalStrength
        );

        if (contact) {
          pools = addToPreEnrichedPool(pools, contact);
          onPoolUpdate(pools);
          progress.succeeded++;
          console.log(`[BackgroundEnrichment] ✓ Added ${domain} → ${result.email} (${verificationStatus})`);

          // Notify UI of found contact (for live feed)
          onContactFound?.({
            name: result.name || 'Unknown',
            title: result.title || '',
            company: result.companyName || domain,
            domain,
            email: result.email
          });
        } else {
          // Contact was rejected (not verified)
          progress.failed++;
          console.log(`[BackgroundEnrichment] ✗ Rejected ${domain} - email not verified (${verificationStatus})`);
        }
      } else {
        progress.failed++;
        console.log(`[BackgroundEnrichment] ✗ No email for ${domain}`);
      }
    } catch (err) {
      progress.failed++;
      console.error(`[BackgroundEnrichment] Error enriching ${domain}:`, err);
    }

    progress.enriched++;
    progress.lastActivityAt = new Date().toISOString();
    onProgress(progress);

    // Rate limit delay (except for last item)
    if (domains.indexOf(domain) < domains.length - 1) {
      await sleep(ENRICHMENT_DELAY_MS);
    }
  }

  console.log(`[BackgroundEnrichment] Worker complete for ${roleType}: ${progress.succeeded}/${progress.enriched} succeeded`);
}

// ============================================================================
// CONTROL
// ============================================================================

/**
 * Stop a running worker
 */
export function stopBackgroundEnrichment(roleType: RoleType): void {
  if (runningWorkers.has(roleType)) {
    console.log(`[BackgroundEnrichment] Stopping worker for ${roleType}`);
    runningWorkers.delete(roleType);
  }
}

/**
 * Stop all running workers
 */
export function stopAllBackgroundEnrichment(): void {
  for (const role of runningWorkers) {
    stopBackgroundEnrichment(role);
  }
}

/**
 * Check if a worker is running
 */
export function isWorkerRunning(roleType: RoleType): boolean {
  return runningWorkers.has(roleType);
}

/**
 * Get progress for a roleType
 */
export function getWorkerProgress(roleType: RoleType): WorkerProgress | null {
  return workerProgress[roleType] ?? null;
}

/**
 * Get all worker progress
 */
export function getAllWorkerProgress(): WorkerProgressMap {
  return { ...workerProgress };
}

// ============================================================================
// TRIGGER ON PRESSURE
// ============================================================================

/**
 * Called when pressure is detected for a roleType.
 * Starts background enrichment if needed.
 */
export function onPressureDetected(
  roleType: RoleType,
  demandPools: TrustedDemandPools,
  currentPools: PreEnrichedContactsPools,
  enrichFn: EnrichmentFunction,
  anymailfinderApiKey: string | undefined,
  ssmApiKey: string | undefined,
  onPoolUpdate: (pools: PreEnrichedContactsPools) => void
): void {
  // Check if we should enrich
  const currentCount = getReadyCount(currentPools, roleType);

  // Only start if pool is below threshold
  const TRIGGER_THRESHOLD = 50; // Start enriching when below 50
  if (currentCount < TRIGGER_THRESHOLD) {
    console.log(`[BackgroundEnrichment] Pressure detected for ${roleType}, pool at ${currentCount}, starting worker`);
    startBackgroundEnrichment(roleType, demandPools, currentPools, enrichFn, anymailfinderApiKey, ssmApiKey, onPoolUpdate);
  }
}

// ============================================================================
// SUPPLY ENRICHMENT (Separate from Demand)
// ============================================================================

export interface SupplyEnrichmentProgress {
  total: number;
  enriched: number;
  succeeded: number;
  failed: number;
  isRunning: boolean;
}

export interface SupplyContactResult {
  email: string;
  name: string;
  title: string;
  company: string;
  domain: string;
  linkedin?: string;
  confidence: number;
}

export type SupplyEnrichmentFunction = (
  domain: string,
  companyName: string
) => Promise<SupplyContactResult | null>;

// Track running supply worker
let supplyWorkerRunning = false;
let supplyWorkerProgress: SupplyEnrichmentProgress | null = null;

/**
 * Start background enrichment for SUPPLY companies.
 * Completely separate from demand enrichment.
 * Fire-and-forget - returns immediately.
 */
export function startBackgroundSupplyEnrichment(
  supplyCompanies: Array<{ domain: string; name: string }>,
  alreadyEnrichedDomains: Set<string>,
  enrichFn: SupplyEnrichmentFunction,
  onContactFound: (domain: string, contact: SupplyContactResult) => void,
  onProgress?: (progress: SupplyEnrichmentProgress) => void
): void {
  // Don't start if already running
  if (supplyWorkerRunning) {
    console.log('[BackgroundSupplyEnrichment] Worker already running');
    return;
  }

  // Filter to only companies needing enrichment
  const toEnrich = supplyCompanies.filter(c => !alreadyEnrichedDomains.has(c.domain));

  if (toEnrich.length === 0) {
    console.log('[BackgroundSupplyEnrichment] All supply companies already enriched');
    return;
  }

  console.log(`[BackgroundSupplyEnrichment] Starting worker for ${toEnrich.length} supply companies`);

  supplyWorkerRunning = true;
  supplyWorkerProgress = {
    total: toEnrich.length,
    enriched: 0,
    succeeded: 0,
    failed: 0,
    isRunning: true
  };

  // Fire and forget
  runSupplyEnrichmentLoop(toEnrich, enrichFn, onContactFound, (p) => {
    supplyWorkerProgress = p;
    onProgress?.(p);
  }).catch(err => {
    console.error('[BackgroundSupplyEnrichment] Worker error:', err);
  }).finally(() => {
    supplyWorkerRunning = false;
    if (supplyWorkerProgress) {
      supplyWorkerProgress.isRunning = false;
    }
  });
}

/**
 * Internal supply enrichment loop
 */
async function runSupplyEnrichmentLoop(
  companies: Array<{ domain: string; name: string }>,
  enrichFn: SupplyEnrichmentFunction,
  onContactFound: (domain: string, contact: SupplyContactResult) => void,
  onProgress: (progress: SupplyEnrichmentProgress) => void
): Promise<void> {
  const progress = supplyWorkerProgress!;

  for (const company of companies) {
    // Check if cancelled
    if (!supplyWorkerRunning) {
      console.log('[BackgroundSupplyEnrichment] Worker cancelled');
      break;
    }

    try {
      console.log(`[BackgroundSupplyEnrichment] Enriching ${company.name} (${company.domain})...`);

      const contact = await enrichFn(company.domain, company.name);

      if (contact?.email) {
        onContactFound(company.domain, contact);
        progress.succeeded++;
        console.log(`[BackgroundSupplyEnrichment] ✓ Found ${contact.name} at ${company.name}: ${contact.email}`);
      } else {
        progress.failed++;
        console.log(`[BackgroundSupplyEnrichment] ✗ No contact found at ${company.name}`);
      }
    } catch (err) {
      progress.failed++;
      console.error(`[BackgroundSupplyEnrichment] Error at ${company.name}:`, err);
    }

    progress.enriched++;
    onProgress(progress);

    // Rate limit delay (1s between calls)
    if (companies.indexOf(company) < companies.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`[BackgroundSupplyEnrichment] Complete: ${progress.succeeded}/${progress.enriched} succeeded`);
}

/**
 * Stop supply enrichment worker
 */
export function stopBackgroundSupplyEnrichment(): void {
  if (supplyWorkerRunning) {
    console.log('[BackgroundSupplyEnrichment] Stopping worker');
    supplyWorkerRunning = false;
  }
}

/**
 * Check if supply worker is running
 */
export function isSupplyWorkerRunning(): boolean {
  return supplyWorkerRunning;
}

/**
 * Get supply worker progress
 */
export function getSupplyWorkerProgress(): SupplyEnrichmentProgress | null {
  return supplyWorkerProgress;
}

// ============================================================================
// UTILS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

