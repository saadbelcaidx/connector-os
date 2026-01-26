/**
 * FlowStateStore — IndexedDB-based persistence for Flow progress
 *
 * PERSIST-2: IndexedDB engine with TTL and versioning
 *
 * IndexedDB provides ~50MB+ storage (vs 5MB localStorage)
 * No size limits, no degraded states, no user-facing errors
 *
 * Stripe-level: System either works or it doesn't. Users never see storage internals.
 */

// =============================================================================
// TYPES
// =============================================================================

export type FlowStage = 'matching' | 'enrichment' | 'routing' | 'introGeneration';

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface StageError {
  code: string;
  message: string;
  at: string; // ISO timestamp
}

export interface StageSummary {
  found?: number;
  total?: number;
  skipped?: number;
  failed?: number;
  message?: string;
}

export interface StageState {
  status: StageStatus;
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  summary?: StageSummary;
  results?: any;
  error?: StageError;
}

export interface FlowMeta {
  name?: string;
  demandSource?: string;
  supplySource?: string;
}

export interface FlowState {
  version: 1;
  flowId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  meta: FlowMeta;
  stages: {
    matching: StageState;
    enrichment: StageState;
    routing: StageState;
    introGeneration: StageState;
  };
}

export interface FlowIndexEntry {
  flowId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  name?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DB_NAME = 'ConnectorOS_FlowStore';
const DB_VERSION = 1;
const FLOWS_STORE = 'flows';
const INDEX_STORE = 'index';
const TTL_DAYS = 7;
const MAX_FLOWS = 10;

// =============================================================================
// INDEXEDDB SETUP
// =============================================================================

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('[FlowStateStore] IndexedDB not available, persistence disabled');
        resolve(null);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Flows store - keyed by flowId
        if (!db.objectStoreNames.contains(FLOWS_STORE)) {
          db.createObjectStore(FLOWS_STORE, { keyPath: 'flowId' });
        }

        // Index store - single key 'index' holding array
        if (!db.objectStoreNames.contains(INDEX_STORE)) {
          db.createObjectStore(INDEX_STORE);
        }
      };
    } catch (e) {
      console.warn('[FlowStateStore] IndexedDB not available:', e);
      resolve(null);
    }
  });

  return dbInitPromise;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateFlowId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getExpiresAt(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + TTL_DAYS);
  return expires.toISOString();
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function createEmptyStageState(): StageState {
  return {
    status: 'pending',
    progress: 0,
  };
}

function createEmptyFlowState(flowId: string, meta?: Partial<FlowMeta>): FlowState {
  const now = new Date().toISOString();
  return {
    version: 1,
    flowId,
    createdAt: now,
    updatedAt: now,
    expiresAt: getExpiresAt(),
    meta: meta || {},
    stages: {
      matching: createEmptyStageState(),
      enrichment: createEmptyStageState(),
      routing: createEmptyStageState(),
      introGeneration: createEmptyStageState(),
    },
  };
}

// =============================================================================
// INDEX OPERATIONS (async internally, sync API via cache)
// =============================================================================

let indexCache: FlowIndexEntry[] = [];
let indexLoaded = false;

async function loadIndexAsync(): Promise<FlowIndexEntry[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(INDEX_STORE, 'readonly');
      const store = tx.objectStore(INDEX_STORE);
      const request = store.get('index');

      request.onsuccess = () => {
        const index = (request.result as FlowIndexEntry[]) || [];
        // Filter expired
        const valid = index.filter(entry => !isExpired(entry.expiresAt));
        indexCache = valid;
        indexLoaded = true;
        resolve(valid);
      };

      request.onerror = () => {
        resolve([]);
      };
    } catch (e) {
      resolve([]);
    }
  });
}

async function saveIndexAsync(index: FlowIndexEntry[]): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(INDEX_STORE, 'readwrite');
      const store = tx.objectStore(INDEX_STORE);
      const request = store.put(index, 'index');

      // Swallow ALL errors — Stripe doctrine
      request.onerror = (e) => {
        console.warn('[FlowStateStore] Index request error (swallowed)');
        e.preventDefault();
        e.stopPropagation();
        resolve();
      };
      tx.onerror = (e) => {
        console.warn('[FlowStateStore] Index transaction error (swallowed)');
        e.preventDefault();
        e.stopPropagation();
        resolve();
      };
      tx.onabort = (e) => {
        console.warn('[FlowStateStore] Index transaction aborted (swallowed)');
        e.preventDefault();
        e.stopPropagation();
        resolve();
      };
      tx.oncomplete = () => {
        indexCache = index;
        resolve();
      };
    } catch (e) {
      resolve();
    }
  });
}

function loadIndex(): FlowIndexEntry[] {
  // Return cache, trigger async load if needed
  if (!indexLoaded) {
    loadIndexAsync(); // Fire and forget
  }
  return indexCache.filter(entry => !isExpired(entry.expiresAt));
}

function saveIndex(index: FlowIndexEntry[]): void {
  indexCache = index;
  saveIndexAsync(index); // Fire and forget
}

function addToIndex(entry: FlowIndexEntry): void {
  const index = loadIndex();
  const filtered = index.filter(e => e.flowId !== entry.flowId);
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, MAX_FLOWS);
  saveIndex(trimmed);
}

function removeFromIndex(flowId: string): void {
  const index = loadIndex();
  const filtered = index.filter(e => e.flowId !== flowId);
  saveIndex(filtered);
}

// =============================================================================
// FLOW OPERATIONS
// =============================================================================

/**
 * Create a new flow and persist it
 */
export function createFlow(meta?: Partial<FlowMeta>): FlowState {
  const flowId = generateFlowId();
  const flowState = createEmptyFlowState(flowId, meta);
  saveFlow(flowState);
  console.log(`[FlowStateStore] Created flow: ${flowId}`);
  return flowState;
}

/**
 * Save a flow state to IndexedDB
 * Always succeeds from caller perspective (silent fail)
 */
export function saveFlow(flowState: FlowState): { success: boolean } {
  flowState.updatedAt = new Date().toISOString();

  // Fire async save — MUST be bulletproof (Stripe doctrine: never surface storage errors)
  (async () => {
    const db = await openDB();
    if (!db) return;

    try {
      const tx = db.transaction(FLOWS_STORE, 'readwrite');
      const store = tx.objectStore(FLOWS_STORE);
      const request = store.put(flowState);

      // Swallow ALL transaction/request errors — disk full, quota exceeded, etc.
      request.onerror = (e) => {
        console.warn('[FlowStateStore] Request error (swallowed):', (e.target as IDBRequest)?.error?.message);
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onerror = (e) => {
        console.warn('[FlowStateStore] Transaction error (swallowed):', (e.target as IDBTransaction)?.error?.message);
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onabort = (e) => {
        console.warn('[FlowStateStore] Transaction aborted (swallowed)');
        e.preventDefault();
        e.stopPropagation();
      };
    } catch (e) {
      console.warn('[FlowStateStore] Save failed silently:', e);
    }
  })();

  // Update index synchronously (from cache)
  addToIndex({
    flowId: flowState.flowId,
    createdAt: flowState.createdAt,
    updatedAt: flowState.updatedAt,
    expiresAt: flowState.expiresAt,
    name: flowState.meta.name,
  });

  return { success: true };
}

/**
 * Load a flow by ID (async)
 */
export async function loadFlowAsync(flowId: string): Promise<FlowState | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FLOWS_STORE, 'readonly');
      const store = tx.objectStore(FLOWS_STORE);
      const request = store.get(flowId);

      request.onsuccess = () => {
        const flowState = request.result as FlowState | undefined;
        if (!flowState) {
          resolve(null);
          return;
        }

        if (isExpired(flowState.expiresAt)) {
          console.log(`[FlowStateStore] Flow expired: ${flowId}`);
          deleteFlow(flowId);
          resolve(null);
          return;
        }

        resolve(flowState);
      };

      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Load a flow by ID (sync wrapper - returns null, use loadFlowAsync for actual data)
 * Kept for API compatibility - callers should migrate to loadFlowAsync
 */
export function loadFlow(flowId: string): FlowState | null {
  // For sync API, we can't return data from IndexedDB
  // Trigger async load and return null
  // Callers should use loadFlowAsync
  console.warn('[FlowStateStore] loadFlow is deprecated, use loadFlowAsync');
  return null;
}

/**
 * Delete a flow
 */
export function deleteFlow(flowId: string): void {
  (async () => {
    const db = await openDB();
    if (!db) return;

    try {
      const tx = db.transaction(FLOWS_STORE, 'readwrite');
      const store = tx.objectStore(FLOWS_STORE);
      const request = store.delete(flowId);

      // Swallow ALL errors — Stripe doctrine
      request.onerror = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onerror = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onabort = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
    } catch (e) {
      console.warn('[FlowStateStore] Delete failed silently:', e);
    }
  })();

  removeFromIndex(flowId);
  console.log(`[FlowStateStore] Deleted flow: ${flowId}`);
}

/**
 * List all non-expired flows
 */
export function listFlows(): FlowIndexEntry[] {
  return loadIndex();
}

/**
 * List all non-expired flows (async version with fresh data)
 */
export async function listFlowsAsync(): Promise<FlowIndexEntry[]> {
  return loadIndexAsync();
}

/**
 * Delete the oldest flow
 */
export function deleteOldestFlow(): boolean {
  const index = loadIndex();
  if (index.length === 0) return false;

  const oldest = index.reduce((a, b) =>
    new Date(a.createdAt) < new Date(b.createdAt) ? a : b
  );

  deleteFlow(oldest.flowId);
  return true;
}

/**
 * Cleanup expired flows
 */
export async function cleanupExpired(): Promise<number> {
  const index = await loadIndexAsync();
  let cleaned = 0;

  for (const entry of index) {
    if (isExpired(entry.expiresAt)) {
      deleteFlow(entry.flowId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[FlowStateStore] Cleaned up ${cleaned} expired flows`);
  }

  return cleaned;
}

// =============================================================================
// STAGE LIFECYCLE HELPERS
// =============================================================================

/**
 * Mark a stage as started
 */
export async function onStageStart(flowId: string, stage: FlowStage): Promise<void> {
  const flow = await loadFlowAsync(flowId);
  if (!flow) return;

  flow.stages[stage] = {
    ...flow.stages[stage],
    status: 'running',
    progress: 0,
    startedAt: new Date().toISOString(),
    completedAt: undefined,
    error: undefined,
  };

  saveFlow(flow);
}

/**
 * Update stage progress
 */
export async function onStageProgress(
  flowId: string,
  stage: FlowStage,
  progress: number,
  summary?: StageSummary
): Promise<void> {
  const flow = await loadFlowAsync(flowId);
  if (!flow) return;

  flow.stages[stage] = {
    ...flow.stages[stage],
    progress: Math.min(100, Math.max(0, progress)),
    summary: summary || flow.stages[stage].summary,
  };

  saveFlow(flow);
}

/**
 * Mark a stage as complete
 */
export async function onStageComplete(
  flowId: string,
  stage: FlowStage,
  results?: any,
  summary?: StageSummary
): Promise<void> {
  const flow = await loadFlowAsync(flowId);
  if (!flow) {
    console.error(`[FlowStateStore] onStageComplete: flow ${flowId} not found`);
    return;
  }

  flow.stages[stage] = {
    ...flow.stages[stage],
    status: 'complete',
    progress: 100,
    completedAt: new Date().toISOString(),
    results,
    summary,
  };

  saveFlow(flow);
  console.log(`[FlowStateStore] onStageComplete(${stage}): Saved`);
}

/**
 * Mark a stage as failed
 */
export async function onStageFail(
  flowId: string,
  stage: FlowStage,
  error: { code: string; message: string }
): Promise<void> {
  const flow = await loadFlowAsync(flowId);
  if (!flow) return;

  flow.stages[stage] = {
    ...flow.stages[stage],
    status: 'failed',
    error: {
      code: error.code,
      message: error.message,
      at: new Date().toISOString(),
    },
  };

  saveFlow(flow);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize DB and cleanup on module load
(async () => {
  await openDB();
  await loadIndexAsync();
  await cleanupExpired();
})();

// =============================================================================
// GLOBAL ERROR HANDLER — Stripe doctrine: NEVER surface storage errors
// =============================================================================

// Catch any IndexedDB errors that slip through — FILE_ERROR_NO_SPACE, QuotaExceededError, etc.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason) || '';
    // Swallow IndexedDB/storage errors silently
    if (
      msg.includes('FILE_ERROR') ||
      msg.includes('QuotaExceededError') ||
      msg.includes('IDBDatabase') ||
      msg.includes('IndexedDB') ||
      msg.includes('.ldb:')
    ) {
      console.warn('[FlowStateStore] Storage error swallowed globally:', msg.slice(0, 100));
      event.preventDefault();
    }
  });
}
