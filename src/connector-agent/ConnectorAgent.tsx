/**
 * Connector Agent — Premium Email Finder & Verifier
 *
 * Sleek operator animations with Framer Motion.
 * Linear-style UI, consistent with Connector OS design system.
 */

declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;
const BUILD_VERSION = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
const BUILD_TIMESTAMP = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { FEATURES } from '../config/features';
import ComingSoon from '../components/ComingSoon';
import SSMGate from '../SSMGate';
import {
  Copy,
  Check,
  Search,
  ShieldCheck,
  Key,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Trash2,
  Code2,
  ExternalLink,
  Sparkles,
  Globe,
  Mail,
  Activity,
  Eye,
  Zap,
  Upload,
  X
} from 'lucide-react';
import Papa from 'papaparse';

// ============================================================
// TYPES
// ============================================================

interface QuotaData {
  remaining: number;
  used: number;
  limit: number;
  percentage_used: number;
}

interface ApiKeyData {
  key_id: string;
  key_prefix: string;
  status: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface FindResult {
  email: string | null;
}

interface VerifyResult {
  email: string | null;
}

// Bulk Source Adapter (CSV / Google Sheets)
type BulkSourceAdapter = {
  load(): Promise<{ headers: string[]; rows: any[] }>;
};

// Google Sheets config
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// ============================================================
// BATCH PERSISTENCE (Zero-waste recovery system)
// ============================================================

interface ConnectorAgentBatch {
  id: string;
  type: 'find' | 'verify';
  createdAt: string;
  status: 'in_progress' | 'completed';
  inputCount: number;
  completedCount: number;
  // Original inputs for resume (slice from completedCount)
  originalInputs: Array<{
    input: string;        // "firstName lastName domain" for find, email for verify
    firstName?: string;
    lastName?: string;
    domain?: string;
    email?: string;
  }>;
  results: Array<{
    input: string;        // original input
    email: string | null; // null = not found / invalid
  }>;
}

const BATCH_INDEX_KEY = 'connector_agent_batch_index';
const BATCH_PREFIX = 'connector_agent_batch_';
const MAX_BATCHES = 20;

// Generate UUID
function generateBatchId(): string {
  return 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// Get all batch IDs (ordered newest first)
function getBatchIndex(): string[] {
  try {
    const stored = localStorage.getItem(BATCH_INDEX_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save batch index
function saveBatchIndex(ids: string[]): void {
  localStorage.setItem(BATCH_INDEX_KEY, JSON.stringify(ids));
}

// Get a single batch
function getBatch(id: string): ConnectorAgentBatch | null {
  try {
    const stored = localStorage.getItem(BATCH_PREFIX + id);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// Save a batch (handles FIFO pruning)
function saveBatch(batch: ConnectorAgentBatch): void {
  const index = getBatchIndex();

  // Add to index if new
  if (!index.includes(batch.id)) {
    index.unshift(batch.id);
  }

  // FIFO prune if over limit
  while (index.length > MAX_BATCHES) {
    const oldId = index.pop();
    if (oldId) localStorage.removeItem(BATCH_PREFIX + oldId);
  }

  saveBatchIndex(index);
  localStorage.setItem(BATCH_PREFIX + batch.id, JSON.stringify(batch));
}

// Delete a batch
function deleteBatch(id: string): void {
  const index = getBatchIndex().filter(i => i !== id);
  saveBatchIndex(index);
  localStorage.removeItem(BATCH_PREFIX + id);
}

// Get all batches (newest first)
function getAllBatches(): ConnectorAgentBatch[] {
  return getBatchIndex()
    .map(id => getBatch(id))
    .filter((b): b is ConnectorAgentBatch => b !== null);
}

// Find in-progress batch (auto-clears stale ones older than 2 hours)
function getInProgressBatch(): ConnectorAgentBatch | null {
  const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();
  for (const id of getBatchIndex()) {
    const batch = getBatch(id);
    if (batch?.status === 'in_progress') {
      const age = now - new Date(batch.createdAt).getTime();
      if (age > STALE_THRESHOLD_MS) {
        console.warn(`[ConnectorAgent] Auto-clearing stale batch ${id} (age: ${Math.round(age / 60000)}min, completed: ${batch.completedCount}/${batch.inputCount})`);
        batch.status = 'completed';
        saveBatch(batch);
        continue;
      }
      return batch;
    }
  }
  return null;
}

// Generate CSV from batch
function batchToCSV(batch: ConnectorAgentBatch): string {
  if (batch.type === 'find') {
    let csv = 'input,email\n';
    for (const r of batch.results) {
      const input = r.input.replace(/"/g, '""');
      const email = r.email ? r.email.replace(/"/g, '""') : '';
      csv += `"${input}","${email}"\n`;
    }
    return csv;
  }
  // Verify: input,status — binary, no "unknown"
  let csv = 'input,status\n';
  for (const r of batch.results) {
    const input = r.input.replace(/"/g, '""');
    csv += `"${input}","${r.email ? 'valid' : 'invalid'}"\n`;
  }
  return csv;
}

// ============================================================
// VERIFY RESULT NORMALIZER — SINGLE SOURCE OF TRUTH
// Backend returns { email: "x@y.com" } (valid) or { email: null } (invalid).
// This normalizer enforces the contract: email is string|null, status is "valid"|"invalid".
// ============================================================

interface NormalizedVerifyResult {
  _input: string;     // Original email that was verified
  email: string | null; // string = valid, null = invalid
  status: 'valid' | 'invalid';
  _row?: number;      // Original row index for sorting
}

function normalizeVerifyResult(inputEmail: string, apiResult: any, rowIndex?: number): NormalizedVerifyResult {
  const email = (apiResult?.email && typeof apiResult.email === 'string') ? apiResult.email : null;
  return {
    _input: inputEmail,
    email,
    status: email ? 'valid' : 'invalid',
    _row: rowIndex,
  };
}

function normalizeVerifyChunk(chunk: Array<{ email?: string; _row?: number; [k: string]: any }>, inputEmails: string[]): NormalizedVerifyResult[] {
  return chunk.map((r, i) => normalizeVerifyResult(inputEmails[i] || '', r, r._row ?? i));
}

// Runtime contract guard — called after every verify batch completes
function assertVerifyContract(results: any[]): string | null {
  const violations: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'valid' && r.status !== 'invalid') {
      violations.push(`Row ${i}: status="${r.status}" (expected valid|invalid)`);
    }
    if (r.email === undefined) {
      violations.push(`Row ${i}: email is undefined (expected string|null)`);
    }
  }
  if (violations.length > 0) {
    const sample = violations.slice(0, 3).join('; ');
    console.error(`[ConnectorAgent] CONTRACT VIOLATION: ${violations.length} rows failed. Sample: ${sample}`);
    return `Internal contract mismatch (${violations.length} rows) — report to Saad`;
  }
  return null;
}

// ============================================================
// CONFIG & ANIMATIONS
// ============================================================

const API_BASE = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
};

const slideIn = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};


// ============================================================
// API SERVICE
// ============================================================

class ConnectorAgentAPI {
  private apiKey: string | null = null;
  private userId: string;
  private userEmail: string;

  constructor(userId: string, userEmail: string) {
    this.userId = userId;
    this.userEmail = userEmail;
    this.apiKey = localStorage.getItem(`connector_api_key`);
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': this.userId,
      'x-user-email': this.userEmail,
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Timeout: 30s for single calls, 90s for bulk endpoints
    const isBulk = endpoint.includes('bulk');
    const timeoutMs = isBulk ? 90000 : 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await response.text();

      // Handle HTML error pages (500s, etc)
      if (text.startsWith('<!') || text.startsWith('<html')) {
        console.error(`[ConnectorAgent] Server error (HTML response): ${endpoint}`);
        return { success: false, error: `Server error: ${response.status}` };
      }

      try {
        return JSON.parse(text);
      } catch {
        console.error(`[ConnectorAgent] Invalid JSON: ${endpoint}`);
        return { success: false, error: 'Invalid response from server' };
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      // Detect abort (timeout)
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.error(`[ConnectorAgent] Request timeout (${timeoutMs}ms): ${endpoint}`);
        return {
          success: false,
          error: 'NETWORK_ERROR',
          errorMessage: `Request timed out after ${timeoutMs / 1000}s`,
        };
      }

      // Detect network errors - TypeError with fetch failure messages
      const isNetworkError = err instanceof TypeError && (
        (err.message || '').includes('Failed to fetch') ||
        (err.message || '').includes('NetworkError') ||
        (err.message || '').includes('CORS')
      );

      if (isNetworkError) {
        console.error(`[ConnectorAgent] Network error: ${endpoint}`, {
          origin: window.location.origin,
          apiBase: API_BASE,
          error: err,
        });
        return {
          success: false,
          error: 'NETWORK_ERROR',
          errorMessage: 'Connection interrupted — retrying may help',
          debug: {
            origin: window.location.origin,
            apiBase: API_BASE,
            endpoint,
          },
        };
      }

      console.warn(`[ConnectorAgent] Backend unavailable: ${endpoint}`, err);
      return { success: false, error: 'Backend unavailable' };
    }
  }

  setApiKey(key: string) {
    this.apiKey = key;
    localStorage.setItem(`connector_api_key`, key);
  }

  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem(`connector_api_key`);
  }

  hasApiKey() { return !!this.apiKey; }
  getApiKey() { return this.apiKey; }

  async generateKey() { return this.fetchWithAuth('/api/keys/generate', { method: 'POST' }); }
  async getActiveKey() { return this.fetchWithAuth('/api/keys/active'); }
  async revokeKey(keyId: string) { return this.fetchWithAuth(`/api/keys/${keyId}`, { method: 'DELETE' }); }

  async getQuota() {
    // Quota works with user headers even without API key
    return this.fetchWithAuth('/api/email/v2/quota');
  }

  async findEmail(firstName: string, lastName: string, domain: string): Promise<FindResult> {
    // API key optional - backend accepts x-user-id header
    return this.fetchWithAuth('/api/email/v2/find', {
      method: 'POST',
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), domain: domain.trim().toLowerCase() }),
    });
  }

  async verifyEmail(email: string): Promise<VerifyResult> {
    // Quota works with user headers even without API key
    return this.fetchWithAuth('/api/email/v2/verify', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async findBulk(items: { firstName: string; lastName: string; domain: string }[]) {
    return this.fetchWithAuth('/api/email/v2/find-bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async verifyBulk(emails: string[]) {
    return this.fetchWithAuth('/api/email/v2/verify-bulk', {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
  }
}

// ============================================================
// PROGRESS BAR COMPONENT
// ============================================================

function AnimatedProgressBar({ value, max, color = 'blue' }: { value: number; max: number; color?: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  const remaining = 100 - percentage;

  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-cyan-400',
    emerald: 'from-emerald-500 to-teal-400',
    amber: 'from-amber-500 to-orange-400',
    red: 'from-red-500 to-rose-400',
  };

  return (
    <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${remaining}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colorMap[color]} rounded-full`}
      />
      {/* Shimmer effect */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: '200%' }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: 'linear' }}
        className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
    </div>
  );
}

// ============================================================
// ANIMATED COUNTER
// ============================================================

function AnimatedCounter({ value, duration = 1 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);

      // Ease out expo
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(eased * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <>{displayValue.toLocaleString()}</>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function ConnectorAgentInner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY (Rules of Hooks)
  // api can be null when user is not authenticated
  const api = useMemo(
    () => (user ? new ConnectorAgentAPI(user.id, user.email!) : null),
    [user?.id, user?.email]
  );
  const [activeKey, setActiveKey] = useState<ApiKeyData | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeTab, setActiveTab] = useState<'find' | 'verify' | 'integrate' | 'bulk'>('find');
  const [result, setResult] = useState<any>(null);
  const [integratePlatform, setIntegratePlatform] = useState<'make' | 'n8n' | 'zapier'>('make');
  const [integrateEndpoint, setIntegrateEndpoint] = useState<'find' | 'verify'>('find');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [corsBlocked, setCorsBlocked] = useState<{ message: string; debug: any } | null>(null);

  // Bulk state
  const [bulkMode, setBulkMode] = useState<'find' | 'verify'>('find');
  const [bulkResults, setBulkResults] = useState<any[] | null>(null);
  const [bulkSummary, setBulkSummary] = useState<any>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFilter, setBulkFilter] = useState<'all' | 'found' | 'not_found' | 'valid' | 'invalid'>('all');

  // Pre-flight state
  const [bulkParsedData, setBulkParsedData] = useState<any[] | null>(null);
  const [bulkRawHeaders, setBulkRawHeaders] = useState<string[]>([]);
  const [bulkValidCount, setBulkValidCount] = useState(0);
  const [bulkRemovedCount, setBulkRemovedCount] = useState(0);
  const [bulkNeedsMapping, setBulkNeedsMapping] = useState(false);
  const [bulkColumnMap, setBulkColumnMap] = useState<Record<string, string>>({});

  // Chunking state
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotalRows, setBulkTotalRows] = useState(0);
  const [bulkCurrentBatch, setBulkCurrentBatch] = useState(0);
  const [bulkTotalBatches, setBulkTotalBatches] = useState(0);
  const [bulkProcessedCount, setBulkProcessedCount] = useState(0);
  const [bulkStreamingResults, setBulkStreamingResults] = useState<any[]>([]);

  // Bulk Source state (CSV / Google Sheets)
  const [bulkSource, setBulkSource] = useState<'csv' | 'sheets'>('csv');
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsTab, setSheetsTab] = useState('');
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  const [findFirstName, setFindFirstName] = useState('');
  const [findLastName, setFindLastName] = useState('');
  const [findDomain, setFindDomain] = useState('');
  const [verifyEmailInput, setVerifyEmailInput] = useState('');

  // Batch persistence state
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingResumeBatch, setPendingResumeBatch] = useState<ConnectorAgentBatch | null>(null);
  const [batchHistory, setBatchHistory] = useState<ConnectorAgentBatch[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Version stamp — proves which build the user is running
  useEffect(() => {
    console.log(`[ConnectorAgent] build ${BUILD_VERSION} ${BUILD_TIMESTAMP}`);
  }, []);

  // Load batch history on mount
  useEffect(() => {
    setBatchHistory(getAllBatches());
  }, []);

  // Check for in-progress batch on mount (resume detection)
  useEffect(() => {
    const inProgress = getInProgressBatch();
    if (inProgress) {
      setPendingResumeBatch(inProgress);
      setShowResumeModal(true);
    }
  }, []);

  useEffect(() => {
    if (!api) {
      setIsLoading(false);
      return;
    }
    const loadData = async () => {
      try {
        const keyResult = await api.getActiveKey();

        // Detect CORS blocked
        if (keyResult.error === 'NETWORK_ERROR') {
          setCorsBlocked({
            message: keyResult.errorMessage || 'Network blocked. Use app.connector-os.com',
            debug: keyResult.debug,
          });
          setIsLoading(false);
          return;
        }

        if (keyResult.success && keyResult.key) setActiveKey(keyResult.key);
        const quotaResult = await api.getQuota();

        // Detect CORS blocked on quota
        if (quotaResult.error === 'NETWORK_ERROR') {
          setCorsBlocked({
            message: quotaResult.errorMessage || 'Network blocked. Use app.connector-os.com',
            debug: quotaResult.debug,
          });
        } else if (quotaResult.success && quotaResult.quota) {
          setQuota(quotaResult.quota);
        }
      } catch (err) {
        console.error('[ConnectorAgent] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [api]);

  // Gate rendering AFTER all hooks are called
  if (!user || !api) {
    return (
      <div className="min-h-screen bg-black noise-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mx-auto mb-4 border border-white/[0.08]">
            <Eye className="w-7 h-7 text-white/60" />
          </div>
          <h1 className="text-[17px] font-semibold text-white/90 mb-2">Connector Agent</h1>
          <p className="text-[13px] text-white/50">Locate & confirm contacts</p>
        </div>
      </div>
    );
  }

  const handleGenerateKey = async () => {
    if (!api) return;
    setIsProcessing(true);
    setKeyError(null); // Clear previous errors
    try {
      const result = await api.generateKey();
      if (result.success && result.key) {
        api.setApiKey(result.key);
        setNewKey(result.key);
        const keyResult = await api.getActiveKey();
        if (keyResult.success && keyResult.key) setActiveKey(keyResult.key);
        const quotaResult = await api.getQuota();
        if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
      } else {
        // Show error to user - this must be impossible to miss
        const errorMessage = result.error || 'API key generation failed. Contact support.';
        setKeyError(errorMessage);
        console.error('[ConnectorAgent] Key generation failed:', result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'API key generation failed. Contact support.';
      setKeyError(errorMessage);
      console.error('[ConnectorAgent] Key generation exception:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!api) return;
    setShowRevokeConfirm(false);
    setIsProcessing(true);
    try {
      // Try to revoke on backend if we have a key_id
      if (activeKey?.key_id) {
        await api.revokeKey(activeKey.key_id);
      }
    } catch (err) {
      // Ignore errors - we'll clear local state anyway
    } finally {
      // Always clear local state so user can generate fresh
      api.clearApiKey();
      setActiveKey(null);
      setNewKey(null);
      setQuota(null);
      setIsProcessing(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFind = async () => {
    if (!api) return;
    if (!findFirstName || !findLastName || !findDomain) return;
    if (!findDomain.includes('.')) {
      alert('Domain must include TLD (e.g. company.com)');
      return;
    }
    setIsProcessing(true);
    setResult(null);
    try {
      const res = await api.findEmail(findFirstName, findLastName, findDomain);
      setResult({ type: 'find', ...res });

      // Save single lookup to history (treated as batch of 1)
      const inputString = `${findFirstName} ${findLastName} @ ${findDomain}`;
      const singleBatch: ConnectorAgentBatch = {
        id: generateBatchId(),
        type: 'find',
        createdAt: new Date().toISOString(),
        status: 'completed',
        inputCount: 1,
        completedCount: 1,
        originalInputs: [{
          input: inputString,
          firstName: findFirstName,
          lastName: findLastName,
          domain: findDomain,
        }],
        results: [{
          input: inputString,
          email: res.email || null,
        }],
      };
      saveBatch(singleBatch);
      setBatchHistory(getAllBatches());

      const quotaResult = await api.getQuota();
      if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerify = async () => {
    if (!api) return;
    if (!verifyEmailInput) return;
    setIsProcessing(true);
    setResult(null);
    try {
      const res = await api.verifyEmail(verifyEmailInput);
      setResult({ type: 'verify', ...res });

      // Save single lookup to history (treated as batch of 1)
      const singleBatch: ConnectorAgentBatch = {
        id: generateBatchId(),
        type: 'verify',
        createdAt: new Date().toISOString(),
        status: 'completed',
        inputCount: 1,
        completedCount: 1,
        originalInputs: [{
          input: verifyEmailInput,
          email: verifyEmailInput,
        }],
        results: [{
          input: verifyEmailInput,
          email: res.email || null,
        }],
      };
      saveBatch(singleBatch);
      setBatchHistory(getAllBatches());

      const quotaResult = await api.getQuota();
      if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================
  // GOOGLE SHEETS ADAPTER
  // ============================================================

  // Extract spreadsheet ID from Google Sheets URL
  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  // Normalize Google API errors to human-readable messages
  const normalizeGoogleError = (status: number, errorBody?: any): string => {
    if (status === 400) return 'Tab not found. Check the sheet/tab name.';
    if (status === 401) return 'Session expired. Please try again.';
    if (status === 403) return 'Access denied. Make sure the sheet is shared with you.';
    if (status === 404) return 'Spreadsheet not found. Check the URL.';
    if (status === 429) return 'Too many requests. Wait a moment and try again.';
    if (status >= 500) return 'Google Sheets is temporarily unavailable. Try again later.';
    return 'Failed to load sheet. Please try again.';
  };

  // Fetch sheet data with token (used for retry on expiration)
  const fetchSheetData = async (spreadsheetId: string, accessToken: string): Promise<{ success: boolean; data?: any; status?: number }> => {
    const range = sheetsTab ? `'${sheetsTab}'` : 'Sheet1';
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      return { success: false, status: res.status };
    }

    const data = await res.json();
    return { success: true, data };
  };

  // Initiate Google OAuth and load sheet data
  const loadGoogleSheet = async () => {
    if (!sheetsUrl) {
      setSheetsError('Please enter a Google Sheets URL');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(sheetsUrl);
    if (!spreadsheetId) {
      setSheetsError('Invalid Google Sheets URL. Expected format: docs.google.com/spreadsheets/d/...');
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      setSheetsError('Google OAuth not configured. Set VITE_GOOGLE_CLIENT_ID.');
      return;
    }

    setSheetsLoading(true);
    setSheetsError(null);

    try {
      // Load Google Identity Services if not already loaded
      if (!(window as any).google?.accounts?.oauth2) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Google sign-in. Check your internet connection.'));
          document.head.appendChild(script);
        });
      }

      // Process sheet data after auth
      const processSheetData = async (accessToken: string, isRetry = false) => {
        try {
          const result = await fetchSheetData(spreadsheetId, accessToken);

          // Handle token expiration - retry auth once
          if (result.status === 401 && !isRetry) {
            setGoogleAccessToken(null);
            // Re-request token
            tokenClient.requestAccessToken();
            return;
          }

          if (!result.success) {
            setSheetsError(normalizeGoogleError(result.status || 0));
            setSheetsLoading(false);
            return;
          }

          const values = result.data?.values || [];

          // Handle empty sheet
          if (values.length === 0) {
            setSheetsError('Sheet is empty. Add data and try again.');
            setSheetsLoading(false);
            return;
          }

          if (values.length === 1) {
            setSheetsError('Sheet has headers but no data rows.');
            setSheetsLoading(false);
            return;
          }

          // Extract headers and rows
          const headers = values[0] as string[];
          const rows = values.slice(1);

          // Enforce row limits with clear error
          const rowLimit = bulkMode === 'find' ? 1000 : 2000;
          const totalRows = rows.length;
          const exceededLimit = totalRows > rowLimit;
          const limitedRows = rows.slice(0, rowLimit);

          // Convert to objects (same format as Papa Parse)
          const parsedRows = limitedRows.map((row: any[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] || '';
            });
            return obj;
          });

          // Feed into existing pipeline
          setBulkRawHeaders(headers);
          setBulkParsedData(parsedRows);

          // Show warning if rows were truncated
          if (exceededLimit) {
            setBulkError(`Sheet has ${totalRows} rows. Truncated to ${rowLimit} (max for ${bulkMode}).`);
          }

          // Check if column mapping is needed
          const expectedCols = bulkMode === 'find'
            ? ['first_name', 'last_name', 'domain']
            : ['email'];
          const lowerHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));
          const needsMapping = !expectedCols.every(col => lowerHeaders.includes(col));

          if (needsMapping) {
            setBulkNeedsMapping(true);
            // Auto-map if possible
            const autoMap: Record<string, string> = {};
            expectedCols.forEach(col => {
              const match = headers.find(h => h.toLowerCase().replace(/\s+/g, '_') === col);
              if (match) autoMap[col] = match;
            });
            setBulkColumnMap(autoMap);
          } else {
            setBulkNeedsMapping(false);
            // Direct mapping
            const directMap: Record<string, string> = {};
            expectedCols.forEach(col => {
              const match = headers.find(h => h.toLowerCase().replace(/\s+/g, '_') === col);
              if (match) directMap[col] = match;
            });
            setBulkColumnMap(directMap);
          }

          setSheetsLoading(false);
        } catch (err: any) {
          setSheetsError('Failed to process sheet data. Please try again.');
          setSheetsLoading(false);
        }
      };

      // Get access token via OAuth popup
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SHEETS_SCOPE,
        callback: async (response: any) => {
          if (response.error) {
            // Normalize OAuth errors
            let errorMsg = 'Sign-in was cancelled or failed.';
            if (response.error === 'access_denied') errorMsg = 'Access denied. Please grant permission to read sheets.';
            if (response.error === 'popup_closed_by_user') errorMsg = 'Sign-in popup was closed. Please try again.';
            setSheetsError(errorMsg);
            setSheetsLoading(false);
            return;
          }

          const accessToken = response.access_token;
          setGoogleAccessToken(accessToken); // Memory only, never localStorage

          await processSheetData(accessToken, false);
        }
      });

      tokenClient.requestAccessToken();
    } catch (err: any) {
      setSheetsError('Failed to initialize Google sign-in. Please try again.');
      setSheetsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-5 h-5 text-white/40" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black noise-bg">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] bg-blue-500/[0.03] rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 50, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-1/2 -right-1/4 w-[800px] h-[800px] bg-violet-500/[0.03] rounded-full blur-3xl"
        />
      </div>

      {/* CORS BLOCKED BANNER — Enterprise fail-safe */}
      {corsBlocked && (
        <div className="fixed inset-x-0 top-0 z-50 p-4">
          <div className="max-w-2xl mx-auto p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-red-400 text-lg font-bold">!</span>
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-red-300 mb-1">Network blocked by browser security</p>
                <p className="text-[13px] text-red-200/80 mb-3">
                  This domain cannot access the API. Please use the canonical app URL.
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href="https://app.connector-os.com/connector-agent"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[13px] font-medium transition-colors"
                  >
                    Open app.connector-os.com
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button
                    onClick={() => {
                      const debugInfo = JSON.stringify(corsBlocked.debug, null, 2);
                      navigator.clipboard.writeText(debugInfo);
                    }}
                    className="text-[12px] text-red-400/60 hover:text-red-400/80 underline"
                  >
                    Copy debug info
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-4xl mx-auto px-6 py-10"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-white/50" />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-white/[0.08]">
                  <Eye className="w-5 h-5 text-white/80" />
                </div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-violet-500 rounded-full border-2 border-black"
                />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold text-white/90 tracking-tight">Connector Agent</h1>
                <p className="text-[11px] text-white/40">Locate & confirm contacts</p>
              </div>
            </div>
          </div>

          {/* Active indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.1] border border-violet-500/[0.2]">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-violet-500"
            />
            <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Active</span>
          </div>
        </motion.div>

        {/* Quota Card */}
        {quota && (
          <motion.div variants={itemVariants} className="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-white/40" />
                <span className="text-[12px] font-medium text-white/60 uppercase tracking-wider">Token Usage</span>
              </div>
              <div className="text-right">
                <span className="text-[13px] font-semibold text-white/90">
                  <AnimatedCounter value={quota.remaining} />
                </span>
                <span className="text-[11px] text-white/40 ml-1">/ {quota.limit.toLocaleString()}</span>
              </div>
            </div>
            <AnimatedProgressBar
              value={quota.used}
              max={quota.limit}
              color={quota.percentage_used > 80 ? 'red' : quota.percentage_used > 50 ? 'amber' : 'blue'}
            />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-white/30">{quota.used.toLocaleString()} used</span>
              <span className="text-[10px] text-white/30">{100 - quota.percentage_used}% remaining</span>
            </div>
          </motion.div>
        )}

        {/* API Key Card */}
        <motion.div variants={itemVariants} className="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-white/40" />
              <span className="text-[12px] font-medium text-white/60 uppercase tracking-wider">API Key</span>
            </div>
            {api.getApiKey() && (
              <button
                onClick={() => setShowRevokeConfirm(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/[0.08] text-red-400 hover:bg-red-500/[0.15] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" />
                Revoke
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!api.getApiKey() ? (
              <motion.button
                key="generate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={handleGenerateKey}
                disabled={isProcessing}
                className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Loader2 className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate API Key
                  </>
                )}
              </motion.button>
            ) : (
              <motion.div
                key="keyDisplay"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-500/[0.15] flex items-center justify-center">
                      <Key className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <code className="text-[11px] text-white/80 font-mono truncate max-w-[280px] block">
                        {api.getApiKey()}
                      </code>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(api.getApiKey()!, 'apikey')}
                    className="h-9 w-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors flex-shrink-0 ml-3"
                  >
                    {copied === 'apikey' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error display - impossible to miss */}
          {keyError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-xl bg-red-500/[0.1] border border-red-500/[0.3]"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/[0.2] flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-red-400 mb-1">Failed to generate API key</p>
                  <p className="text-[12px] text-red-400/70">{keyError}</p>
                </div>
                <button
                  onClick={() => setKeyError(null)}
                  className="text-red-400/50 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Tabs & Content */}
        {api.getApiKey() && (
          <>
            <motion.div variants={itemVariants} className="flex gap-1 mb-5 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] w-fit">
              {[
                { id: 'find', label: 'Find', icon: Search },
                { id: 'verify', label: 'Verify', icon: ShieldCheck },
                { id: 'bulk', label: 'Bulk', icon: Upload },
                { id: 'integrate', label: 'Integrate', icon: Code2 },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as any); setResult(null); }}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
                    activeTab === tab.id ? 'text-white/90' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white/[0.08] rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <tab.icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </motion.div>

            <motion.div variants={itemVariants} className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <AnimatePresence mode="wait">
                {activeTab === 'find' && (
                  <motion.div
                    key="find"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'First Name', value: findFirstName, onChange: setFindFirstName, placeholder: 'John' },
                        { label: 'Last Name', value: findLastName, onChange: setFindLastName, placeholder: 'Doe' },
                        { label: 'Domain', value: findDomain, onChange: setFindDomain, placeholder: 'company.com' },
                      ].map((field, i) => (
                        <div key={field.label}>
                          <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">{field.label}</label>
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] transition-all"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleFind}
                      disabled={isProcessing || !findFirstName || !findLastName || !findDomain}
                      className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          Find Contact
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'verify' && (
                  <motion.div
                    key="verify"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">Email Address</label>
                      <input
                        type="email"
                        value={verifyEmailInput}
                        onChange={(e) => setVerifyEmailInput(e.target.value)}
                        placeholder="john@company.com"
                        className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] transition-all"
                      />
                    </div>
                    <button
                      onClick={handleVerify}
                      disabled={isProcessing || !verifyEmailInput}
                      className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          Verify Contact
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'bulk' && (
                  <motion.div
                    key="bulk"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {/* Mode toggle */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      {[
                        { id: 'find' as const, label: 'Bulk Find' },
                        { id: 'verify' as const, label: 'Bulk Verify' },
                      ].map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => {
                            setBulkMode(mode.id);
                            setBulkResults(null);
                            setBulkSummary(null);
                            setBulkError(null);
                            setBulkFilter('all');
                            setBulkParsedData(null);
                            setBulkNeedsMapping(false);
                            setBulkColumnMap({});
                            // Reset sheets state
                            setSheetsUrl('');
                            setSheetsTab('');
                            setSheetsError(null);
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
                            bulkMode === mode.id
                              ? 'bg-white/[0.08] text-white/90'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {/* Source Selector (CSV / Google Sheets) — disabled while processing */}
                    {!bulkParsedData && (
                      <div className={`flex gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.06] w-fit ${(isProcessing || sheetsLoading) ? 'opacity-50 pointer-events-none' : ''}`}>
                        {[
                          { id: 'csv' as const, label: 'CSV Upload' },
                          { id: 'sheets' as const, label: 'Google Sheets' },
                        ].map(src => (
                          <button
                            key={src.id}
                            disabled={isProcessing || sheetsLoading}
                            onClick={() => {
                              setBulkSource(src.id);
                              setSheetsError(null);
                              setBulkError(null);
                            }}
                            className={`px-3 py-1 rounded text-[10px] font-medium transition-all ${
                              bulkSource === src.id ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/60'
                            } disabled:cursor-not-allowed`}
                          >
                            {src.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* CSV Upload (only if no pending data and CSV source selected) */}
                    {!bulkParsedData && bulkSource === 'csv' && (
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">
                          {bulkMode === 'find' ? 'CSV (first_name, last_name, domain) — max 5MB' : 'CSV (contact) — max 5MB'}
                        </label>
                        {/* Drop Zone Wrapper */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isProcessing) setIsDragging(true);
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isProcessing) setIsDragging(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                            if (isProcessing) return;

                            const file = e.dataTransfer.files?.[0];
                            if (!file) return;
                            if (!file.name.endsWith('.csv')) {
                              setBulkError('Please drop a CSV file');
                              return;
                            }

                            // File size check (5MB)
                            if (file.size > 5 * 1024 * 1024) {
                              setBulkError('File too large. Max 5MB.');
                              return;
                            }

                            // Process dropped file (same logic as onChange)
                            Papa.parse(file, {
                              header: true,
                              skipEmptyLines: true,
                              complete: (results) => {
                                setBulkError(null);
                                setBulkResults(null);
                                setBulkSummary(null);
                                setBulkProgress(0);
                                setBulkCurrentBatch(0);
                                setBulkTotalBatches(0);

                                const headers = results.meta.fields || [];
                                setBulkRawHeaders(headers);
                                setBulkParsedData(results.data as any[]);

                                const headersLower = headers.map(h => h.toLowerCase().trim());
                                if (bulkMode === 'find') {
                                  const hasFirstName = headersLower.some(h => h === 'first_name' || h === 'firstname');
                                  const hasLastName = headersLower.some(h => h === 'last_name' || h === 'lastname');
                                  const hasDomain = headersLower.includes('domain');
                                  if (!hasFirstName || !hasLastName || !hasDomain) {
                                    setBulkNeedsMapping(true);
                                    setBulkColumnMap({});
                                  } else {
                                    setBulkNeedsMapping(false);
                                    const map: Record<string, string> = {};
                                    headers.forEach(h => {
                                      const hl = h.toLowerCase().trim();
                                      if (hl === 'first_name' || hl === 'firstname') map['first_name'] = h;
                                      if (hl === 'last_name' || hl === 'lastname') map['last_name'] = h;
                                      if (hl === 'domain') map['domain'] = h;
                                    });
                                    setBulkColumnMap(map);
                                  }
                                } else {
                                  const hasEmail = headersLower.includes('email');
                                  if (!hasEmail) {
                                    setBulkNeedsMapping(true);
                                    setBulkColumnMap({});
                                  } else {
                                    setBulkNeedsMapping(false);
                                    const emailHeader = headers.find(h => h.toLowerCase().trim() === 'email');
                                    setBulkColumnMap({ email: emailHeader || '' });
                                  }
                                }
                              }
                            });
                          }}
                          className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${
                            isDragging
                              ? 'border-white/40 bg-white/[0.04]'
                              : 'border-transparent'
                          }`}
                        >
                          {/* Drag overlay */}
                          {isDragging && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.02] pointer-events-none z-10">
                              <div className="flex items-center gap-2 text-white/60 text-sm">
                                <Upload size={16} />
                                <span>Drop CSV here</span>
                              </div>
                            </div>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              // File size check (5MB)
                              if (file.size > 5 * 1024 * 1024) {
                                setBulkError('File too large. Max 5MB.');
                                e.target.value = '';
                                return;
                              }

                              Papa.parse(file, {
                                header: true,
                                skipEmptyLines: true,
                                complete: (results) => {
                                  setBulkError(null);
                                  setBulkResults(null);
                                  setBulkSummary(null);
                                  setBulkProgress(0);
                                  setBulkCurrentBatch(0);
                                  setBulkTotalBatches(0);

                                  const headers = results.meta.fields || [];
                                  setBulkRawHeaders(headers);
                                  setBulkParsedData(results.data as any[]);

                                  // Check if mapping needed
                                  const headersLower = headers.map(h => h.toLowerCase().trim());
                                  if (bulkMode === 'find') {
                                    const hasFirstName = headersLower.some(h => h === 'first_name' || h === 'firstname');
                                    const hasLastName = headersLower.some(h => h === 'last_name' || h === 'lastname');
                                    const hasDomain = headersLower.includes('domain');
                                    if (!hasFirstName || !hasLastName || !hasDomain) {
                                      setBulkNeedsMapping(true);
                                      setBulkColumnMap({});
                                    } else {
                                      setBulkNeedsMapping(false);
                                      // Auto-map
                                      const map: Record<string, string> = {};
                                      headers.forEach(h => {
                                        const hl = h.toLowerCase().trim();
                                        if (hl === 'first_name' || hl === 'firstname') map['first_name'] = h;
                                        if (hl === 'last_name' || hl === 'lastname') map['last_name'] = h;
                                        if (hl === 'domain') map['domain'] = h;
                                      });
                                      setBulkColumnMap(map);
                                    }
                                  } else {
                                    const hasEmail = headersLower.includes('email');
                                    if (!hasEmail) {
                                      setBulkNeedsMapping(true);
                                      setBulkColumnMap({});
                                    } else {
                                      setBulkNeedsMapping(false);
                                      const emailHeader = headers.find(h => h.toLowerCase().trim() === 'email');
                                      setBulkColumnMap({ email: emailHeader || '' });
                                    }
                                  }
                                }
                              });

                              e.target.value = '';
                            }}
                            disabled={isProcessing}
                            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-medium file:bg-white/[0.08] file:text-white/70 hover:file:bg-white/[0.12] disabled:opacity-40"
                        />
                        </div>
                      </div>
                    )}

                    {/* Google Sheets Input (only if no pending data and Sheets source selected) */}
                    {!bulkParsedData && bulkSource === 'sheets' && (
                      <div className="space-y-3">
                        {/* Agent Sheets Integration — Founder note with animations */}
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent cursor-default"
                        >
                          {/* Animated gradient drift */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.04] via-transparent to-blue-500/[0.04]"
                            animate={{
                              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                            }}
                            transition={{
                              duration: 8,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                            style={{ backgroundSize: '200% 200%' }}
                          />
                          <div className="relative p-4">
                            <div className="flex items-start gap-3">
                              {/* Avatar with glow pulse */}
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, duration: 0.4, type: 'spring', stiffness: 200 }}
                                className="relative flex-shrink-0"
                              >
                                <motion.div
                                  className="absolute -inset-1 rounded-full bg-gradient-to-r from-violet-500/20 to-blue-500/20 blur-sm"
                                  animate={{
                                    opacity: [0.3, 0.6, 0.3],
                                    scale: [1, 1.1, 1],
                                  }}
                                  transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                  }}
                                />
                                <img
                                  src="/saad.jpg"
                                  alt="Saad"
                                  className="relative w-8 h-8 rounded-full object-cover object-[center_20%] border border-white/[0.12]"
                                />
                              </motion.div>
                              <div className="space-y-1.5">
                                {/* Title with stagger */}
                                <motion.p
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.2, duration: 0.4 }}
                                  className="text-[10px] font-medium text-white/70 uppercase tracking-wider"
                                >
                                  Why Sheets?
                                </motion.p>
                                {/* Paragraphs with staggered reveal */}
                                <div className="text-[11px] text-white/40 leading-[1.6] space-y-2">
                                  <motion.p
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, duration: 0.4 }}
                                  >
                                    Quick note on why this exists.
                                  </motion.p>
                                  <motion.p
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45, duration: 0.4 }}
                                  >
                                    When Saad was building this, he knew most people already live in Google Sheets. That's where the data is.
                                  </motion.p>
                                  <motion.p
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6, duration: 0.4 }}
                                  >
                                    So instead of making you export files or learn a new dashboard, the agent just comes to you.
                                  </motion.p>
                                  <motion.p
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.75, duration: 0.4 }}
                                  >
                                    Paste a Sheet, run it, and keep working like you normally would.
                                  </motion.p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                        <div>
                          <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">
                            Google Sheets URL
                          </label>
                          <input
                            type="url"
                            value={sheetsUrl}
                            onChange={(e) => setSheetsUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            disabled={sheetsLoading}
                            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/30 disabled:opacity-40"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">
                            Sheet / Tab Name (optional)
                          </label>
                          <input
                            type="text"
                            value={sheetsTab}
                            onChange={(e) => setSheetsTab(e.target.value)}
                            placeholder="Sheet1"
                            disabled={sheetsLoading}
                            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/30 disabled:opacity-40"
                          />
                        </div>
                        {sheetsError && (
                          <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12] text-[11px] text-red-400">
                            {sheetsError}
                          </div>
                        )}
                        <button
                          onClick={loadGoogleSheet}
                          disabled={sheetsLoading || !sheetsUrl}
                          className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[12px] font-medium text-white/80 hover:bg-white/[0.1] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {sheetsLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Globe className="w-4 h-4" />
                              Load Preview
                            </>
                          )}
                        </button>
                        {/* Schema hint — sexy chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] text-white/30 uppercase tracking-wider">Columns</span>
                          {(bulkMode === 'find'
                            ? ['first_name', 'last_name', 'domain']
                            : ['email']
                          ).map(col => (
                            <span
                              key={col}
                              className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/50 font-mono"
                            >
                              {col}
                            </span>
                          ))}
                          <span className="text-[9px] text-white/20">•</span>
                          <span className="text-[9px] text-white/30">
                            max {bulkMode === 'find' ? '1,000' : '2,000'} rows
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Column Mapper (if needed) */}
                    {bulkParsedData && bulkNeedsMapping && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                          <p className="text-[11px] text-white/60 font-medium tracking-tight">Map columns</p>
                        </div>
                        <div className="space-y-2">
                          {bulkMode === 'find' ? (
                            <>
                              {['first_name', 'last_name', 'domain'].map(field => (
                                <div key={field} className="flex items-center gap-3">
                                  <span className="text-[10px] text-white/40 w-20 font-mono">{field}</span>
                                  <div className="flex-1 relative group">
                                    <select
                                      value={bulkColumnMap[field] || ''}
                                      onChange={(e) => setBulkColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                                      className="w-full h-8 px-3 pr-8 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-white/80 text-[11px] font-medium appearance-none cursor-pointer hover:border-white/[0.15] focus:border-white/[0.20] focus:outline-none transition-colors"
                                      style={{ colorScheme: 'dark' }}
                                    >
                                      <option value="" className="bg-[#0a0a0a] text-white/40">Select column</option>
                                      {bulkRawHeaders.map(h => (
                                        <option key={h} value={h} className="bg-[#0a0a0a] text-white/80">{h}</option>
                                      ))}
                                    </select>
                                    <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                  {bulkColumnMap[field] && (
                                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                      <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-white/40 w-20 font-mono">contact</span>
                              <div className="flex-1 relative group">
                                <select
                                  value={bulkColumnMap['email'] || ''}
                                  onChange={(e) => setBulkColumnMap(prev => ({ ...prev, email: e.target.value }))}
                                  className="w-full h-8 px-3 pr-8 rounded-lg bg-[#0a0a0a] border border-white/[0.08] text-white/80 text-[11px] font-medium appearance-none cursor-pointer hover:border-white/[0.15] focus:border-white/[0.20] focus:outline-none transition-colors"
                                  style={{ colorScheme: 'dark' }}
                                >
                                  <option value="" className="bg-[#0a0a0a] text-white/40">Select column</option>
                                  {bulkRawHeaders.map(h => (
                                    <option key={h} value={h} className="bg-[#0a0a0a] text-white/80">{h}</option>
                                  ))}
                                </select>
                                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                              {bulkColumnMap['email'] && (
                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pre-flight Summary */}
                    {bulkParsedData && (() => {
                      const FIND_CHUNK = 10;
                      const VERIFY_CHUNK = 10;
                      const map = bulkColumnMap;
                      const isMapped = bulkMode === 'find'
                        ? map['first_name'] && map['last_name'] && map['domain']
                        : map['email'];

                      if (!isMapped) return null;

                      // Calculate valid/removed
                      const seen = new Set<string>();
                      let validCount = 0;
                      let totalRaw = bulkParsedData.length;

                      if (bulkMode === 'find') {
                        bulkParsedData.forEach((row: any) => {
                          const fn = (row[map['first_name']] || '').trim();
                          const ln = (row[map['last_name']] || '').trim();
                          const d = (row[map['domain']] || '').trim().toLowerCase();
                          if (!fn || !ln || !d) return;
                          const key = `${fn.toLowerCase()}|${ln.toLowerCase()}|${d}`;
                          if (seen.has(key)) return;
                          seen.add(key);
                          validCount++;
                        });
                      } else {
                        bulkParsedData.forEach((row: any) => {
                          const email = (row[map['email']] || '').trim().toLowerCase();
                          if (!email || !email.includes('@')) return;
                          if (seen.has(email)) return;
                          seen.add(email);
                          validCount++;
                        });
                      }

                      const removedCount = totalRaw - validCount;
                      const chunkSize = bulkMode === 'find' ? FIND_CHUNK : VERIFY_CHUNK;
                      const numBatches = Math.ceil(validCount / chunkSize);
                      const estimatedCredits = validCount;
                      const availableCredits = quota?.remaining ?? 0;
                      const insufficientCredits = estimatedCredits > availableCredits;

                      return (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-white/50">Rows to process</span>
                            <span className="text-white/90 font-medium">{validCount}</span>
                          </div>
                          {removedCount > 0 && (
                            <div className="flex items-center justify-between text-[12px]">
                              <span className="text-white/40">Removed (invalid/duplicates)</span>
                              <span className="text-white/50">{removedCount}</span>
                            </div>
                          )}
                          {numBatches > 1 && (
                            <div className="flex items-center justify-between text-[12px]">
                              <span className="text-white/40">Batches</span>
                              <span className="text-white/50">{numBatches}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-white/40">Est. credits</span>
                            <span className={insufficientCredits ? 'text-red-400' : 'text-white/50'}>~{estimatedCredits}</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-white/40">Available credits</span>
                            <span className="text-white/50">{availableCredits}</span>
                          </div>
                          {insufficientCredits && (
                            <div className="text-[11px] text-red-400">
                              Insufficient credits. Need ~{estimatedCredits}, have {availableCredits}.
                            </div>
                          )}
                          {validCount === 0 && (
                            <div className="text-[11px] text-red-400">
                              No valid rows found after validation.
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => {
                                setBulkParsedData(null);
                                setBulkNeedsMapping(false);
                                setBulkColumnMap({});
                                // Reset sheets state on cancel
                                setSheetsUrl('');
                                setSheetsTab('');
                                setSheetsError(null);
                              }}
                              className="flex-1 h-[36px] rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/60 hover:bg-white/[0.08]"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={insufficientCredits || validCount === 0 || isProcessing}
                              onClick={async () => {
                                if (!api || !bulkParsedData) return;
                                setIsProcessing(true);
                                setBulkError(null);
                                setBulkResults(null);
                                setBulkSummary(null);
                                setBulkProcessedCount(0);
                                setBulkStreamingResults([]);

                                try {
                                  // Build items array
                                  const seenSet = new Set<string>();
                                  let items: any[] = [];

                                  if (bulkMode === 'find') {
                                    bulkParsedData.forEach((row: any, idx: number) => {
                                      const firstName = (row[map['first_name']] || '').trim();
                                      const lastName = (row[map['last_name']] || '').trim();
                                      const domain = (row[map['domain']] || '').trim().toLowerCase();
                                      if (!firstName || !lastName || !domain) return;
                                      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${domain}`;
                                      if (seenSet.has(key)) return;
                                      seenSet.add(key);
                                      items.push({ firstName, lastName, domain, _row: idx });
                                    });
                                  } else {
                                    bulkParsedData.forEach((row: any, idx: number) => {
                                      const email = (row[map['email']] || '').trim().toLowerCase();
                                      if (!email || !email.includes('@')) return;
                                      if (seenSet.has(email)) return;
                                      seenSet.add(email);
                                      items.push({ email, _row: idx });
                                    });
                                  }

                                  // Chunk and execute
                                  const totalItems = items.length;
                                  const batches = Math.ceil(totalItems / chunkSize);
                                  setBulkTotalRows(totalItems);
                                  setBulkTotalBatches(batches);

                                  // === BATCH PERSISTENCE: Create batch record ===
                                  const batchId = generateBatchId();
                                  setCurrentBatchId(batchId);
                                  const originalInputs = items.map(item =>
                                    bulkMode === 'find'
                                      ? { input: `${item.firstName} ${item.lastName} ${item.domain}`, firstName: item.firstName, lastName: item.lastName, domain: item.domain }
                                      : { input: item.email, email: item.email }
                                  );
                                  let persistedResults: Array<{ input: string; email: string | null }> = [];
                                  const batchRecord: ConnectorAgentBatch = {
                                    id: batchId,
                                    type: bulkMode,
                                    createdAt: new Date().toISOString(),
                                    status: 'in_progress',
                                    inputCount: totalItems,
                                    completedCount: 0,
                                    originalInputs,
                                    results: [],
                                  };
                                  saveBatch(batchRecord);

                                  // Clear parsed data early so progress UI shows
                                  setBulkParsedData(null);
                                  setBulkNeedsMapping(false);
                                  setBulkColumnMap({});

                                  let allResults: any[] = [];
                                  let stopped = false;

                                  for (let b = 0; b < batches && !stopped; b++) {
                                    setBulkCurrentBatch(b + 1);
                                    const chunk = items.slice(b * chunkSize, (b + 1) * chunkSize);

                                    // Retry logic: up to 2 retries per chunk on transient failure
                                    let res: any = null;
                                    let chunkRetries = 0;
                                    for (let attempt = 0; attempt < 3; attempt++) {
                                      try {
                                        if (bulkMode === 'find') {
                                          res = await api.findBulk(chunk.map(({ _row, ...rest }: any) => rest));
                                        } else {
                                          res = await api.verifyBulk(chunk.map((i: any) => i.email));
                                        }
                                        // If we got a response (even error), break retry loop
                                        if (res && !res.error?.includes('NETWORK_ERROR')) break;
                                        // Network error — wait and retry
                                        chunkRetries++;
                                        console.warn(`[BulkProcess] Chunk ${b + 1}/${batches} attempt ${attempt + 1} failed (NETWORK_ERROR), retrying in ${2 * (attempt + 1)}s...`);
                                        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                                      } catch (chunkErr) {
                                        chunkRetries++;
                                        console.warn(`[BulkProcess] Chunk ${b + 1}/${batches} attempt ${attempt + 1} threw:`, chunkErr);
                                        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                                        else res = { error: 'Network error after 3 attempts' };
                                      }
                                    }
                                    if (chunkRetries > 0) {
                                      console.log(`[BulkProcess] Chunk ${b + 1}/${batches} completed after ${chunkRetries} retries`);
                                    }

                                    // Check for hard-stop errors (quota, auth, rate limit)
                                    if (res?.error) {
                                      const err = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
                                      const errLower = err.toLowerCase();
                                      console.error(`[BulkProcess] Chunk ${b + 1}/${batches} error: ${err}`);
                                      if (errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('authentication') || errLower.includes('invalid') || errLower.includes('api key')) {
                                        setBulkError('Authentication failed — check your API key');
                                        stopped = true;
                                      } else if (errLower.includes('402') || errLower.includes('insufficient') || errLower.includes('quota') || errLower.includes('credit') || errLower.includes('payment')) {
                                        setBulkError('Insufficient credits — processed ' + allResults.length + '/' + totalItems + ' before quota hit');
                                        stopped = true;
                                      } else if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many')) {
                                        setBulkError('Rate limited — processed ' + allResults.length + '/' + totalItems + '. Try again in a few minutes.');
                                        stopped = true;
                                      } else if (err.includes('Network error after 3 attempts') || err.includes('NETWORK_ERROR')) {
                                        setBulkError('Network error — processed ' + allResults.length + '/' + totalItems + '. Check your connection and resume.');
                                        stopped = true;
                                      }
                                      // Unknown errors — continue to next chunk
                                    }

                                    // Normalize response: verify-bulk returns flat array, find-bulk returns { results: [...] }
                                    const chunkResults = res?.results || (Array.isArray(res) ? res : null);

                                    // Accumulate results and stream to UI
                                    if (chunkResults) {
                                      let resultsWithRow: any[];
                                      if (bulkMode === 'verify') {
                                        const inputEmails = chunk.map((c: any) => c.email || '');
                                        resultsWithRow = normalizeVerifyChunk(chunkResults, inputEmails).map((r, i) => ({
                                          ...r,
                                          _row: chunk[i]?._row ?? i,
                                        }));
                                      } else {
                                        resultsWithRow = chunkResults.map((r: any, i: number) => ({
                                          ...r,
                                          _row: chunk[i]?._row ?? i,
                                          _input: chunk[i]?.email || chunk[i]?.input || '',
                                        }));
                                      }
                                      allResults = [...allResults, ...resultsWithRow];

                                      // Stream results to UI incrementally
                                      setBulkStreamingResults([...allResults]);

                                      // === BATCH PERSISTENCE: Save after each chunk ===
                                      const chunkPersisted = chunkResults.map((r: any, i: number) => ({
                                        input: originalInputs[b * chunkSize + i]?.input || '',
                                        email: (r?.email && typeof r.email === 'string') ? r.email : null,
                                      }));
                                      persistedResults = [...persistedResults, ...chunkPersisted];
                                      batchRecord.results = persistedResults;
                                      batchRecord.completedCount = persistedResults.length;
                                      saveBatch(batchRecord);
                                    }

                                    // Update progress with actual count
                                    const completed = Math.min((b + 1) * chunkSize, totalItems);
                                    setBulkProcessedCount(completed);
                                    setBulkProgress(Math.round((completed / totalItems) * 100));
                                  }

                                  // Sort and set final results
                                  allResults.sort((a: any, b: any) => a._row - b._row);
                                  setBulkResults(allResults);
                                  setBulkStreamingResults([]);

                                  // Runtime contract guard (verify mode only)
                                  if (bulkMode === 'verify') {
                                    const violation = assertVerifyContract(allResults);
                                    if (violation) setBulkError(violation);
                                  }

                                  // === BATCH PERSISTENCE: Mark completed ===
                                  batchRecord.status = 'completed';
                                  batchRecord.completedCount = persistedResults.length;
                                  saveBatch(batchRecord);
                                  setBatchHistory(getAllBatches());
                                  setCurrentBatchId(null);

                                  // Calculate summary
                                  if (bulkMode === 'find') {
                                    setBulkSummary({
                                      total: allResults.length,
                                      found: allResults.filter((r: any) => r.email).length,
                                      not_found: allResults.filter((r: any) => !r.email).length,
                                    });
                                  } else {
                                    setBulkSummary({
                                      total: allResults.length,
                                      valid: allResults.filter((r: any) => r.status === 'valid').length,
                                      invalid: allResults.filter((r: any) => r.status === 'invalid' || r.status !== 'valid').length,
                                    });
                                  }

                                  const quotaResult = await api.getQuota();
                                  if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
                                } finally {
                                  setIsProcessing(false);
                                  setBulkCurrentBatch(0);
                                  setBulkTotalBatches(0);
                                  // Ensure batch is never left as in_progress on exception
                                  if (batchRecord.status === 'in_progress') {
                                    batchRecord.status = 'completed';
                                    saveBatch(batchRecord);
                                    setBatchHistory(getAllBatches());
                                    console.warn(`[BulkProcess] Batch ${batchRecord.id} force-completed in finally (${batchRecord.completedCount}/${batchRecord.inputCount})`);
                                  }
                                }
                              }}
                              className="flex-1 h-[36px] rounded-lg bg-white/[0.08] border border-white/[0.1] text-[11px] font-medium text-white/90 hover:bg-white/[0.12] disabled:opacity-40"
                            >
                              {isProcessing ? 'Processing...' : 'Confirm & Run'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Error */}
                    {bulkError && (
                      <div className="p-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.15] text-[12px] text-red-400">
                        {bulkError}
                      </div>
                    )}

                    {isProcessing && (
                      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                        {/* Progress Header */}
                        <div className="p-4 space-y-3 border-b border-white/[0.04]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500/80 border-2 border-[#0a0a0a]" />
                              </div>
                              <div>
                                <p className="text-[12px] text-white/80 font-medium">
                                  {bulkMode === 'find' ? 'Resolving contacts' : 'Verifying contacts'}
                                </p>
                                <p className="text-[10px] text-white/40">
                                  {bulkTotalBatches > 1 ? `Batch ${bulkCurrentBatch} of ${bulkTotalBatches}` : 'Processing'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[14px] font-mono text-white/90 tabular-nums">
                                {bulkProcessedCount.toLocaleString()} <span className="text-white/30">/</span> {bulkTotalRows.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-white/40">{bulkProgress}% complete</p>
                            </div>
                          </div>
                          {/* Progress Bar */}
                          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-white/60 to-white/40 rounded-full transition-all duration-300"
                              style={{ width: `${bulkProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Streaming Results */}
                        {bulkStreamingResults.length > 0 && (
                          <div className="max-h-[200px] overflow-y-auto">
                            <div className="divide-y divide-white/[0.04]">
                              {bulkStreamingResults.slice(-10).map((result, i) => (
                                <div
                                  key={i}
                                  className="px-4 py-2 flex items-center justify-between text-[11px]"
                                  style={{
                                    animation: `fadeSlideIn 0.3s ease ${i * 0.05}s both`,
                                  }}
                                >
                                  <span className="font-mono text-white/50 truncate max-w-[200px]">
                                    {result.email || result._input || `${result.firstName} ${result.lastName}`}
                                  </span>
                                  {bulkMode === 'find' ? (
                                    <span className={result.email ? 'text-violet-400' : 'text-white/30'}>
                                      {result.email ? 'resolved' : 'pending'}
                                    </span>
                                  ) : (
                                    <span className={result.status === 'valid' ? 'text-emerald-400' : 'text-red-400/60'}>
                                      {result.status || (result.email ? 'valid' : 'invalid')}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <style>{`
                      @keyframes fadeSlideIn {
                        from { opacity: 0; transform: translateY(-8px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>

                    {/* Summary */}
                    {bulkSummary && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <div className="flex items-center gap-4 text-[12px]">
                          <span className="text-white/50">Total: <span className="text-white/90 font-medium">{bulkSummary.total}</span></span>
                          {bulkMode === 'find' ? (
                            <>
                              <span className="text-violet-400">Resolved: <span className="font-medium">{bulkSummary.found}</span></span>
                              <span className="text-white/40">Pending: <span className="font-medium">{bulkSummary.not_found}</span></span>
                            </>
                          ) : (
                            <>
                              <span className="text-emerald-400">Valid: <span className="font-medium">{bulkSummary.valid || 0}</span></span>
                              <span className="text-red-400/60">Invalid: <span className="font-medium">{bulkSummary.invalid || 0}</span></span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Result Filters — Sticky with counts */}
                    {bulkResults && bulkResults.length > 0 && (() => {
                      // Compute counts
                      const counts = {
                        all: bulkResults.length,
                        found: bulkResults.filter(r => !!r.email).length,
                        not_found: bulkResults.filter(r => !r.email).length,
                        valid: bulkResults.filter(r => r.status === 'valid').length,
                        invalid: bulkResults.filter(r => r.status === 'invalid' || r.status !== 'valid').length,
                      };
                      return (
                        <div className="sticky top-0 z-10 bg-[#09090b] py-2">
                          <div className="flex gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.06] w-fit">
                            {bulkMode === 'find' ? (
                              <>
                                {[
                                  { id: 'all' as const, label: 'All', count: counts.all },
                                  { id: 'found' as const, label: 'Found', count: counts.found },
                                  { id: 'not_found' as const, label: 'Not Found', count: counts.not_found },
                                ].map(f => (
                                  <button
                                    key={f.id}
                                    onClick={() => setBulkFilter(f.id)}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-all ${
                                      bulkFilter === f.id ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/60'
                                    }`}
                                  >
                                    {f.label} ({f.count})
                                  </button>
                                ))}
                              </>
                            ) : (
                              <>
                                {[
                                  { id: 'all' as const, label: 'All', count: counts.all },
                                  { id: 'valid' as const, label: 'Valid', count: counts.valid },
                                  { id: 'invalid' as const, label: 'Invalid', count: counts.invalid },
                                ].map(f => (
                                  <button
                                    key={f.id}
                                    onClick={() => setBulkFilter(f.id)}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-all ${
                                      bulkFilter === f.id ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/60'
                                    }`}
                                  >
                                    {f.label} ({f.count})
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Results Table */}
                    {bulkResults && bulkResults.length > 0 && (() => {
                      const filtered = bulkResults.filter(row => {
                        if (bulkFilter === 'all') return true;
                        if (bulkMode === 'find') {
                          if (bulkFilter === 'found') return !!row.email;
                          if (bulkFilter === 'not_found') return !row.email;
                        } else {
                          if (bulkFilter === 'valid') return row.status === 'valid';
                          if (bulkFilter === 'invalid') return row.status !== 'valid';
                        }
                        return true;
                      });

                      return (
                        <>
                          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                            <div className="max-h-[300px] overflow-y-auto">
                              <table className="w-full text-[11px]">
                                <thead className="bg-white/[0.02] sticky top-0">
                                  <tr>
                                    {bulkMode === 'find' ? (
                                      <>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Name</th>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Domain</th>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Contact</th>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Status</th>
                                      </>
                                    ) : (
                                      <>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Contact</th>
                                        <th className="text-left px-3 py-2 text-white/40 font-medium">Status</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {filtered.map((row, i) => (
                                    <tr key={i} className="border-t border-white/[0.04]">
                                      {bulkMode === 'find' ? (
                                        <>
                                          <td className="px-3 py-2 text-white/70">{row.firstName} {row.lastName}</td>
                                          <td className="px-3 py-2 text-white/50">{row.domain}</td>
                                          <td className="px-3 py-2">
                                            {row.email ? (
                                              <span className="text-emerald-400 font-mono">{row.email}</span>
                                            ) : (
                                              <span className="text-white/30">—</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                              row.email ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-white/[0.06] text-white/40'
                                            }`}>
                                              {row.email ? 'found' : 'not_found'}
                                            </span>
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td className="px-3 py-2 text-white/70 font-mono">{row._input || row.email || ''}</td>
                                          <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                              row.status === 'valid' ? 'bg-emerald-500/[0.15] text-emerald-400' :
                                              'bg-red-500/[0.15] text-red-400'
                                            }`}>
                                              {row.status || 'invalid'}
                                            </span>
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Download CSV */}
                          <button
                            onClick={() => {
                              if (!bulkResults) return;
                              let csv = '';
                              if (bulkMode === 'find') {
                                csv = 'first_name,last_name,domain,email,status\n';
                                bulkResults.forEach(row => {
                                  csv += `"${row.firstName || ''}","${row.lastName || ''}","${row.domain || ''}","${row.email || ''}","${row.email ? 'found' : 'not_found'}"\n`;
                                });
                              } else {
                                csv = 'input,status\n';
                                bulkResults.forEach(row => {
                                  csv += `"${row._input || row.email || ''}","${row.status || 'invalid'}"\n`;
                                });
                              }
                              const blob = new Blob([csv], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `bulk_${bulkMode}_results.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="w-full h-[40px] rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12px] font-medium text-white/70 hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Download CSV
                          </button>
                        </>
                      );
                    })()}

                    {/* === HISTORY SECTION === */}
                    {batchHistory.length > 0 && !isProcessing && (
                      <div className="mt-6 pt-6 border-t border-white/[0.06]">
                        <button
                          onClick={() => setShowHistory(!showHistory)}
                          className="w-full flex items-center justify-between text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors"
                        >
                          <span>History ({batchHistory.length})</span>
                          <span className="text-[10px]">{showHistory ? '▲' : '▼'}</span>
                        </button>

                        {showHistory && (
                          <div className="mt-3 space-y-2">
                            {batchHistory.slice(0, 20).map((batch) => (
                              <div
                                key={batch.id}
                                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${batch.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    <div>
                                      <div className="text-[12px] text-white/70">
                                        {batch.type === 'find' ? 'Find' : 'Verify'} · {batch.completedCount}/{batch.inputCount}
                                      </div>
                                      <div className="text-[10px] text-white/30">
                                        {new Date(batch.createdAt).toLocaleDateString()} {new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {batch.status === 'in_progress' && (
                                      <button
                                        onClick={() => {
                                          setPendingResumeBatch(batch);
                                          setShowResumeModal(true);
                                        }}
                                        className="px-2 py-1 rounded-lg bg-amber-500/[0.1] border border-amber-500/[0.2] text-[10px] font-medium text-amber-400 hover:bg-amber-500/[0.2] transition-colors"
                                      >
                                        Resume
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        const csv = batchToCSV(batch);
                                        const blob = new Blob([csv], { type: 'text/csv' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `${batch.type}_${batch.id}.csv`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      }}
                                      className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] font-medium text-white/50 hover:bg-white/[0.08] transition-colors"
                                    >
                                      CSV
                                    </button>
                                    <button
                                      onClick={() => {
                                        deleteBatch(batch.id);
                                        setBatchHistory(getAllBatches());
                                      }}
                                      className="px-2 py-1 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[10px] text-white/30 hover:text-red-400 hover:border-red-500/[0.2] transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'integrate' && (
                  <motion.div
                    key="integrate"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-5"
                  >
                    {/* Your API Key - Prominent */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/[0.08] to-fuchsia-500/[0.04] border border-violet-500/[0.15]">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-4 h-4 text-violet-400" />
                        <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">Your API Key</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-[12px] font-mono text-white/90 truncate">
                          {api.getApiKey() || 'Generate a key above'}
                        </code>
                        <button
                          onClick={() => {
                            const key = api.getApiKey();
                            if (key) handleCopy(key, 'integrate-key');
                          }}
                          disabled={!api.getApiKey()}
                          className="h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 flex items-center gap-2 transition-colors"
                        >
                          {copied === 'integrate-key' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                          <span className="text-[11px] text-white/60">{copied === 'integrate-key' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Endpoint Sub-tabs (Find / Verify) */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
                      {[
                        { id: 'find' as const, label: 'Find Email', icon: Search },
                        { id: 'verify' as const, label: 'Verify Email', icon: ShieldCheck },
                      ].map(endpoint => (
                        <button
                          key={endpoint.id}
                          onClick={() => setIntegrateEndpoint(endpoint.id)}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
                            integrateEndpoint === endpoint.id
                              ? 'bg-violet-500/[0.15] text-violet-300 border border-violet-500/[0.2]'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          <endpoint.icon className="w-3.5 h-3.5" />
                          {endpoint.label}
                        </button>
                      ))}
                    </div>

                    {/* Platform Tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      {[
                        { id: 'make' as const, label: 'Make.com', icon: Globe },
                        { id: 'n8n' as const, label: 'n8n', icon: Zap },
                        { id: 'zapier' as const, label: 'Zapier', icon: Zap },
                      ].map(platform => (
                        <button
                          key={platform.id}
                          onClick={() => setIntegratePlatform(platform.id)}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
                            integratePlatform === platform.id
                              ? 'bg-white/[0.08] text-white/90'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          <platform.icon className="w-3.5 h-3.5" />
                          {platform.label}
                        </button>
                      ))}
                    </div>

                    {/* Platform-specific instructions */}
                    <div className="space-y-4">
                      {integratePlatform === 'make' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to Make.com using the HTTP module.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add HTTP Module</span>
                            </div>
                            <p className="text-[11px] text-white/50 mb-3">Add "HTTP - Make a request" module to your scenario</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure Request</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/{integrateEndpoint}</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/${integrateEndpoint}`, 'make-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'make-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Headers (Content-Type removed - Make adds it automatically) */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">3</span>
                              <span className="text-[12px] font-medium text-white/80">Set Headers</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Authorization</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 12) || 'YOUR_KEY'}...</code>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'make-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'make-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 4 - Body */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">4</span>
                                <span className="text-[12px] font-medium text-white/80">Request Body (JSON)</span>
                              </div>
                              <button
                                onClick={() => handleCopy(
                                  integrateEndpoint === 'find'
                                    ? '{"firstName": "John", "lastName": "Doe", "domain": "company.com"}'
                                    : '{"email": "john.doe@company.com"}',
                                  'make-body'
                                )}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'make-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{integrateEndpoint === 'find' ? `{
  "firstName": "John",
  "lastName": "Doe",
  "domain": "company.com"
}` : `{
  "email": "john.doe@company.com"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{integrateEndpoint === 'find'
  ? `{ "email": "john.doe@company.com" }`
  : `{ "email": "john.doe@company.com", "status": "valid" }`}
                            </pre>
                            <p className="text-[10px] text-white/40 mt-2">
                              {integrateEndpoint === 'find'
                                ? <>Returns <code className="text-white/60">null</code> if no email found</>
                                : <>Returns <code className="text-white/60">status: "invalid"</code> if email is invalid</>}
                            </p>
                          </div>
                        </div>
                      )}

                      {integratePlatform === 'n8n' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to n8n using the HTTP Request node.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add HTTP Request Node</span>
                            </div>
                            <p className="text-[11px] text-white/50">Add an "HTTP Request" node to your workflow</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/{integrateEndpoint}</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/${integrateEndpoint}`, 'n8n-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'n8n-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Authentication</span>
                                <span className="text-[10px] text-white/70">Generic Credential Type → Header Auth</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Header Name</span>
                                <code className="text-[10px] text-white/70 font-mono">Authorization</code>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Header Value</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 8) || 'YOUR'}...</code>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'n8n-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'n8n-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Body */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">3</span>
                                <span className="text-[12px] font-medium text-white/80">Body Parameters</span>
                              </div>
                              <button
                                onClick={() => handleCopy(
                                  integrateEndpoint === 'find'
                                    ? '{"firstName": "{{$json.firstName}}", "lastName": "{{$json.lastName}}", "domain": "{{$json.domain}}"}'
                                    : '{"email": "{{$json.email}}"}',
                                  'n8n-body'
                                )}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'n8n-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{integrateEndpoint === 'find' ? `{
  "firstName": "{{$json.firstName}}",
  "lastName": "{{$json.lastName}}",
  "domain": "{{$json.domain}}"
}` : `{
  "email": "{{$json.email}}"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{integrateEndpoint === 'find'
  ? `{ "email": "john.doe@company.com" }`
  : `{ "email": "john.doe@company.com", "status": "valid" }`}
                            </pre>
                            <p className="text-[10px] text-white/40 mt-2">
                              {integrateEndpoint === 'find'
                                ? <>Returns <code className="text-white/60">null</code> if no email found</>
                                : <>Returns <code className="text-white/60">status: "invalid"</code> if email is invalid</>}
                            </p>
                          </div>
                        </div>
                      )}

                      {integratePlatform === 'zapier' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to Zapier using Webhooks by Zapier.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add Webhooks Action</span>
                            </div>
                            <p className="text-[11px] text-white/50">Search for "Webhooks by Zapier" and select "Custom Request"</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure Request</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/{integrateEndpoint}</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/${integrateEndpoint}`, 'zap-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'zap-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Headers (Content-Type removed - Zapier adds it automatically) */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">3</span>
                              <span className="text-[12px] font-medium text-white/80">Headers</span>
                            </div>
                            <div className="space-y-2">
                              <div className="p-2 rounded-lg bg-black/40">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-white/40">Authorization</span>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'zap-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'zap-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                                <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 12) || 'YOUR_KEY'}...</code>
                              </div>
                            </div>
                          </div>

                          {/* Step 4 - Data */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">4</span>
                                <span className="text-[12px] font-medium text-white/80">Data (Raw JSON)</span>
                              </div>
                              <button
                                onClick={() => handleCopy(
                                  integrateEndpoint === 'find'
                                    ? '{"firstName": "John", "lastName": "Doe", "domain": "company.com"}'
                                    : '{"email": "john.doe@company.com"}',
                                  'zap-body'
                                )}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'zap-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{integrateEndpoint === 'find' ? `{
  "firstName": "John",
  "lastName": "Doe",
  "domain": "company.com"
}` : `{
  "email": "john.doe@company.com"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{integrateEndpoint === 'find'
  ? `{ "email": "john.doe@company.com" }`
  : `{ "email": "john.doe@company.com", "status": "valid" }`}
                            </pre>
                            <p className="text-[10px] text-white/40 mt-2">
                              {integrateEndpoint === 'find'
                                ? <>Returns <code className="text-white/60">null</code> if no email found</>
                                : <>Returns <code className="text-white/60">status: "invalid"</code> if email is invalid</>}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Result */}
              <AnimatePresence>
                {result && (activeTab === 'find' || activeTab === 'verify') && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`mt-5 p-4 rounded-xl border ${
                      result.email && result.status !== 'risky' && result.status !== 'invalid'
                        ? 'bg-emerald-500/[0.04] border-emerald-500/[0.1]'
                        : result.status === 'risky'
                          ? 'bg-amber-500/[0.04] border-amber-500/[0.1]'
                          : 'bg-white/[0.02] border-white/[0.06]'
                    }`}
                  >
                    {result.email && result.status === 'valid' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/[0.15]"
                          >
                            <Mail className="w-5 h-5 text-emerald-400" />
                          </motion.div>
                          <div>
                            <code className="text-[13px] font-mono text-white/90">{result.email}</code>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/[0.15] text-emerald-400">
                                Valid
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(result.email!, 'result-email')}
                          className="h-9 w-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                        >
                          {copied === 'result-email' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                        </button>
                      </div>
                    ) : result.email && result.status === 'risky' ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/[0.1] flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-amber-400" />
                          </div>
                          <div>
                            <code className="text-[13px] font-mono text-white/90">{result.email}</code>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-500/[0.15] text-amber-400">
                                Risky
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(result.email!, 'result-email')}
                          className="h-9 w-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                        >
                          {copied === 'result-email' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-white/30" />
                        </div>
                        <div>
                          <p className="text-[13px] text-white/70">{result.status === 'invalid' ? 'Invalid email' : 'No email found'}</p>
                          <p className="text-[11px] text-white/40 mt-0.5">{result.status === 'invalid' ? 'This email does not exist or is undeliverable' : 'Could not find a valid email'}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}

      </motion.div>

      {/* Revoke Confirmation Modal */}
      <AnimatePresence>
        {showRevokeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRevokeConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-[#111] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-red-500/[0.1] border border-red-500/[0.15] flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-white/90 text-center mb-2">Revoke API Key?</h3>
              <p className="text-[13px] text-white/50 text-center mb-6">
                This action cannot be undone. You'll need to generate a new key to continue using the API.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRevokeConfirm(false)}
                  className="flex-1 h-[42px] rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] font-medium text-white/70 hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokeKey}
                  className="flex-1 h-[42px] rounded-xl bg-red-500/[0.15] border border-red-500/[0.2] text-[13px] font-medium text-red-400 hover:bg-red-500/[0.25] transition-colors"
                >
                  Revoke Key
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* === RESUME MODAL === */}
        {showResumeModal && pendingResumeBatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowResumeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-[#111] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/[0.1] border border-amber-500/[0.15] flex items-center justify-center mx-auto mb-4">
                <Activity className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-[15px] font-semibold text-white/90 text-center mb-2">Resume Batch?</h3>
              <p className="text-[13px] text-white/50 text-center mb-2">
                {pendingResumeBatch.type === 'find' ? 'Find' : 'Verify'} · {pendingResumeBatch.completedCount}/{pendingResumeBatch.inputCount} completed
              </p>
              <p className="text-[11px] text-white/30 text-center mb-6">
                Started {new Date(pendingResumeBatch.createdAt).toLocaleDateString()} {new Date(pendingResumeBatch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Discard batch
                    deleteBatch(pendingResumeBatch.id);
                    setBatchHistory(getAllBatches());
                    setShowResumeModal(false);
                    setPendingResumeBatch(null);
                  }}
                  className="flex-1 h-[42px] rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] font-medium text-white/70 hover:bg-white/[0.08] transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={async () => {
                    if (!api || !pendingResumeBatch) return;

                    // Switch to bulk tab and set mode
                    setActiveTab('bulk');
                    setBulkMode(pendingResumeBatch.type);
                    setShowResumeModal(false);

                    // Calculate remaining items
                    const remainingInputs = pendingResumeBatch.originalInputs.slice(pendingResumeBatch.completedCount);
                    if (remainingInputs.length === 0) {
                      // Already complete, just mark it
                      const batch = getBatch(pendingResumeBatch.id);
                      if (batch) {
                        batch.status = 'completed';
                        saveBatch(batch);
                        setBatchHistory(getAllBatches());
                      }
                      setPendingResumeBatch(null);
                      return;
                    }

                    // Start processing
                    setIsProcessing(true);
                    setBulkError(null);
                    setBulkResults(null);
                    setBulkSummary(null);
                    setBulkProcessedCount(pendingResumeBatch.completedCount);
                    setBulkStreamingResults([]);

                    const CHUNK_SIZE = 10;
                    const totalItems = pendingResumeBatch.inputCount;
                    const batches = Math.ceil(remainingInputs.length / CHUNK_SIZE);
                    setBulkTotalRows(totalItems);
                    setBulkTotalBatches(batches);
                    setCurrentBatchId(pendingResumeBatch.id);

                    let batchRecord = pendingResumeBatch;
                    let persistedResults = [...batchRecord.results];
                    let allResults: any[] = [];
                    let stopped = false;

                    try {
                      for (let b = 0; b < batches && !stopped; b++) {
                        setBulkCurrentBatch(b + 1);
                        const chunk = remainingInputs.slice(b * CHUNK_SIZE, (b + 1) * CHUNK_SIZE);

                        // Retry logic: up to 2 retries per chunk on transient failure
                        let res: any = null;
                        let chunkRetries = 0;
                        for (let attempt = 0; attempt < 3; attempt++) {
                          try {
                            if (batchRecord.type === 'find') {
                              res = await api.findBulk(chunk.map(item => ({
                                firstName: item.firstName!,
                                lastName: item.lastName!,
                                domain: item.domain!,
                              })));
                            } else {
                              res = await api.verifyBulk(chunk.map(item => item.email!));
                            }
                            if (res && !res.error?.includes('NETWORK_ERROR')) break;
                            chunkRetries++;
                            console.warn(`[BulkResume] Chunk ${b + 1}/${batches} attempt ${attempt + 1} failed (NETWORK_ERROR), retrying in ${2 * (attempt + 1)}s...`);
                            if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                          } catch (chunkErr) {
                            chunkRetries++;
                            console.warn(`[BulkResume] Chunk ${b + 1}/${batches} attempt ${attempt + 1} threw:`, chunkErr);
                            if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                            else res = { error: 'Network error after 3 attempts' };
                          }
                        }
                        if (chunkRetries > 0) {
                          console.log(`[BulkResume] Chunk ${b + 1}/${batches} completed after ${chunkRetries} retries`);
                        }

                        // Check for hard-stop errors (quota, auth, rate limit)
                        if (res?.error) {
                          const err = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
                          const errLower = err.toLowerCase();
                          console.error(`[BulkResume] Chunk ${b + 1}/${batches} error: ${err}`);
                          if (errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('authentication') || errLower.includes('invalid') || errLower.includes('api key')) {
                            setBulkError('Authentication failed — check your API key');
                            stopped = true;
                          } else if (errLower.includes('402') || errLower.includes('insufficient') || errLower.includes('quota') || errLower.includes('credit') || errLower.includes('payment')) {
                            setBulkError('Insufficient credits — processed ' + (pendingResumeBatch.completedCount + allResults.length) + '/' + totalItems + ' before quota hit');
                            stopped = true;
                          } else if (errLower.includes('429') || errLower.includes('rate limit') || errLower.includes('too many')) {
                            setBulkError('Rate limited — processed ' + (pendingResumeBatch.completedCount + allResults.length) + '/' + totalItems + '. Try again in a few minutes.');
                            stopped = true;
                          } else if (err.includes('Network error after 3 attempts') || err.includes('NETWORK_ERROR')) {
                            setBulkError('Network error — processed ' + (pendingResumeBatch.completedCount + allResults.length) + '/' + totalItems + '. Check your connection and resume.');
                            stopped = true;
                          }
                        }

                        // Normalize response: verify-bulk returns flat array, find-bulk returns { results: [...] }
                        const chunkResults = res?.results || (Array.isArray(res) ? res : null);

                        if (chunkResults) {
                          let normalizedChunk: any[];
                          if (batchRecord.type === 'verify') {
                            const inputEmails = chunk.map((c: any) => c.email || c.input || '');
                            normalizedChunk = normalizeVerifyChunk(chunkResults, inputEmails);
                          } else {
                            normalizedChunk = chunkResults.map((r: any, i: number) => ({
                              ...r,
                              _input: chunk[i]?.input || '',
                            }));
                          }
                          allResults = [...allResults, ...normalizedChunk];
                          setBulkStreamingResults([...allResults]);

                          // Persist
                          const chunkPersisted = chunkResults.map((r: any, i: number) => ({
                            input: chunk[i]?.input || '',
                            email: (r?.email && typeof r.email === 'string') ? r.email : null,
                          }));
                          persistedResults = [...persistedResults, ...chunkPersisted];
                          batchRecord.results = persistedResults;
                          batchRecord.completedCount = persistedResults.length;
                          saveBatch(batchRecord);
                        }

                        const completed = pendingResumeBatch.completedCount + Math.min((b + 1) * CHUNK_SIZE, remainingInputs.length);
                        setBulkProcessedCount(completed);
                        setBulkProgress(Math.round((completed / totalItems) * 100));
                      }

                      // Mark completed
                      batchRecord.status = 'completed';
                      saveBatch(batchRecord);
                      setBatchHistory(getAllBatches());
                      setCurrentBatchId(null);

                      // Set final results
                      setBulkResults(allResults);
                      setBulkStreamingResults([]);

                      // Runtime contract guard (verify mode only)
                      if (batchRecord.type === 'verify') {
                        const violation = assertVerifyContract(allResults);
                        if (violation) setBulkError(violation);
                      }

                      // Calculate summary
                      if (batchRecord.type === 'find') {
                        setBulkSummary({
                          total: allResults.length,
                          found: allResults.filter((r: any) => r.email).length,
                          not_found: allResults.filter((r: any) => !r.email).length,
                        });
                      } else {
                        setBulkSummary({
                          total: allResults.length,
                          valid: allResults.filter((r: any) => r.status === 'valid').length,
                          invalid: allResults.filter((r: any) => r.status === 'invalid' || r.status !== 'valid').length,
                        });
                      }

                      const quotaResult = await api.getQuota();
                      if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
                    } finally {
                      setIsProcessing(false);
                      setBulkCurrentBatch(0);
                      setBulkTotalBatches(0);
                      // Ensure batch is never left as in_progress on exception
                      if (batchRecord.status === 'in_progress') {
                        batchRecord.status = 'completed';
                        saveBatch(batchRecord);
                        setBatchHistory(getAllBatches());
                        console.warn(`[BulkResume] Batch ${batchRecord.id} force-completed in finally (${batchRecord.completedCount}/${batchRecord.inputCount})`);
                      }
                      setPendingResumeBatch(null);
                    }
                  }}
                  className="flex-1 h-[42px] rounded-xl bg-amber-500/[0.15] border border-amber-500/[0.2] text-[13px] font-medium text-amber-400 hover:bg-amber-500/[0.25] transition-colors"
                >
                  Resume
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="text-[9px] text-white/10 text-center mt-8 select-none">{BUILD_VERSION}</div>
    </div>
  );
}

// ============================================================
// EXPORT
// ============================================================

export default function ConnectorAgent() {
  if (!FEATURES.CONNECTOR_AGENT_ENABLED) {
    return (
      <ComingSoon
        title="Connector Agent"
        description="Locate & confirm contacts. Coming soon."
      />
    );
  }

  return (
    <SSMGate featureName="Connector Agent">
      <ConnectorAgentInner />
    </SSMGate>
  );
}
