/**
 * JobStorage — IndexedDB persistence for JobState (orchestration cursor only)
 *
 * Storage split (non-negotiable):
 *   IndexedDB = JobState only (cursor, stats, config)
 *   Supabase  = system truth (canonicals, evaluations, per-record results)
 *   Loss of IndexedDB never loses data
 *
 * Follows FlowStateStore.ts pattern: never throw, swallow all errors, fire-and-forget writes.
 */

// =============================================================================
// TYPES
// =============================================================================

export type JobStatus = 'idle' | 'running' | 'paused' | 'aborted' | 'completed' | 'failed';

export interface JobState {
  jobId: string;
  createdAt: number;
  status: JobStatus;
  cursor: {
    step: string;           // "dmcb-extract" | "mcp-evaluate" | future steps
    nextIndex: number;
  };
  stats: {
    total: number;
    processed: number;
    accepted: number;
    rejected: number;
    failed: number;
  };
  config: {
    batchSize: number;
    maxConcurrency: number;
    timeoutMs: number;
    promptVersion: string;
  };
  inputsHash: string;       // detect if inputs changed between sessions
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DB_NAME = 'ConnectorOS_JobStore';
const DB_VERSION = 1;
const JOBS_STORE = 'jobs';

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
        console.warn('[JobStorage] IndexedDB not available, persistence disabled');
        resolve(null);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(JOBS_STORE)) {
          db.createObjectStore(JOBS_STORE, { keyPath: 'jobId' });
        }
      };
    } catch (e) {
      console.warn('[JobStorage] IndexedDB not available:', e);
      resolve(null);
    }
  });

  return dbInitPromise;
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Save a job state to IndexedDB (fire-and-forget, put semantics)
 */
export function saveJob(job: JobState): void {
  (async () => {
    const db = await openDB();
    if (!db) return;

    try {
      const tx = db.transaction(JOBS_STORE, 'readwrite');
      const store = tx.objectStore(JOBS_STORE);
      const request = store.put(job);

      request.onerror = (e) => {
        console.warn('[JobStorage] Save request error (swallowed)');
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onerror = (e) => {
        console.warn('[JobStorage] Save transaction error (swallowed)');
        e.preventDefault();
        e.stopPropagation();
      };
      tx.onabort = (e) => {
        console.warn('[JobStorage] Save transaction aborted (swallowed)');
        e.preventDefault();
        e.stopPropagation();
      };
    } catch (e) {
      console.warn('[JobStorage] Save failed silently:', e);
    }
  })();
}

/**
 * Load a job state by ID (async read, null on failure)
 */
export async function loadJob(jobId: string): Promise<JobState | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(JOBS_STORE, 'readonly');
      const store = tx.objectStore(JOBS_STORE);
      const request = store.get(jobId);

      request.onsuccess = () => {
        resolve((request.result as JobState) || null);
      };

      request.onerror = (e) => {
        e.preventDefault();
        e.stopPropagation();
        resolve(null);
      };
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Update a job state (same as saveJob — put semantics)
 */
export function updateJob(job: JobState): void {
  saveJob(job);
}

/**
 * Delete a job by ID (fire-and-forget)
 */
export function deleteJob(jobId: string): void {
  (async () => {
    const db = await openDB();
    if (!db) return;

    try {
      const tx = db.transaction(JOBS_STORE, 'readwrite');
      const store = tx.objectStore(JOBS_STORE);
      const request = store.delete(jobId);

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
      console.warn('[JobStorage] Delete failed silently:', e);
    }
  })();

  console.log(`[JobStorage] Deleted job: ${jobId}`);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(async () => {
  await openDB();
})();
