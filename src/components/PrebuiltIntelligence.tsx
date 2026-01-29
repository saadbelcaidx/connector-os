/**
 * PrebuiltIntelligence.tsx — Pre-built Data Sources UI
 *
 * Shows available pre-built intelligence sources (NIH, USASpending, etc.)
 * with modals explaining demand/supply and filter configuration.
 *
 * DESIGN: Apple x Vercel x Linear aesthetic
 */

import { useState, useRef, useEffect } from 'react';
import { X, HelpCircle, FlaskConical, Building2, DollarSign, Clock, MapPin, Users, ArrowRight, Loader2, Check, Stethoscope, ChevronDown } from 'lucide-react';
import { fetchNihDemand, getNihInstitutes, DEFAULT_NIH_KEYWORDS } from '../services/NihService';
import { fetchUsaSpendingSupply, DEFAULT_CRO_KEYWORDS, FUNDING_AGENCIES } from '../services/UsaSpendingService';
import { fetchClinicalTrials } from '../services/PublicDatabaseClient';
import { storeCsvData } from '../services/SignalsClient';
import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES
// =============================================================================

interface PrebuiltSource {
  id: string;
  name: string;
  icon: React.ReactNode;
  tagline: string;
  status: 'active' | 'coming_soon';
  gptPrompt: string; // Reptile brain prompt for ChatGPT

  demand: {
    description: string;
    examples: string[];
    signals: string[];
  };

  supply: {
    description: string;
    examples: string[];
  };
}

// =============================================================================
// OPENAI ICON
// =============================================================================

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  );
}

interface ModalProps {
  source: PrebuiltSource;
  onClose: () => void;
  onUse: (demand: NormalizedRecord[], supply: NormalizedRecord[]) => void;
}

// =============================================================================
// DATA
// =============================================================================

const PREBUILT_SOURCES: PrebuiltSource[] = [
  {
    id: 'biotech',
    name: 'Biotech',
    icon: <FlaskConical className="w-6 h-6" />,
    tagline: 'NIH grants and federal contracts',
    status: 'active',
    gptPrompt: `BIOTECH MARKET - The Money Flow

WHO HAS MONEY (Demand):
- Biotech companies that just got NIH grants
- Small biotechs with SBIR/STTR funding (they outsource EVERYTHING)
- Labs moving from research to clinical trials

They just got federal money. They MUST spend it. Clock is ticking.

WHO GETS PAID (Supply):
- CROs (run their clinical trials)
- Life sciences recruiters (hire their scientists)
- Regulatory consultants (get FDA approval)
- Lab equipment vendors

WHY THIS IS GOLD:
Fresh government money = urgent buying. These companies have budget NOW and deadlines to spend it. They need outside help because they're small teams with big grants.

You connect the funded biotech to the service provider. You get paid when they work together.

Answer any questions about this market.`,
    demand: {
      description: 'Who needs help',
      examples: [
        'Biotech companies with fresh NIH grants',
        'SBIR/STTR small biotechs (outsource everything)',
        'Academic labs going from bench to clinic',
      ],
      signals: ['Funding amount', 'Therapeutic area', 'Grant recency', 'Outsource likelihood'],
    },
    supply: {
      description: 'Who fulfills the need',
      examples: [
        'CROs (contract research organizations)',
        'Life sciences recruiters',
        'Regulatory consultants (FDA, EMA)',
        'Lab equipment & services vendors',
      ],
    },
  },
  {
    id: 'finra',
    name: 'FINRA',
    icon: <DollarSign className="w-6 h-6" />,
    tagline: 'Broker-dealer and RIA data',
    status: 'coming_soon',
    gptPrompt: `WEALTH MANAGEMENT MARKET - The Money Flow

WHO HAS MONEY (Demand):
- RIAs (registered investment advisors) managing $50M-500M
- Aging advisors looking to sell or merge
- Small broker-dealers wanting to grow

They manage other people's money. They need infrastructure.

WHO GETS PAID (Supply):
- RIA aggregators (buy their practices)
- Wealth tech platforms (software they need)
- Compliance consultants (keep them legal)

WHY THIS IS GOLD:
Wealth advisors are getting old. They need exit plans. Or they need tech to compete with big firms. Either way, they're buying.

Answer any questions about this market.`,
    demand: {
      description: 'Who needs help',
      examples: [
        'RIAs with succession needs',
        'Broker-dealers expanding',
        'Wealth managers seeking partnerships',
      ],
      signals: ['AUM', 'Firm size', 'Registration status'],
    },
    supply: {
      description: 'Who fulfills the need',
      examples: [
        'RIA aggregators',
        'Wealth tech providers',
        'Compliance consultants',
      ],
    },
  },
  {
    id: 'clinical_trials',
    name: 'Clinical Trials',
    icon: <Stethoscope className="w-6 h-6" />,
    tagline: 'Active clinical trials',
    status: 'active',
    gptPrompt: `CLINICAL TRIALS MARKET - The Money Flow

WHO HAS MONEY (Demand):
- Pharma companies running trials (recruiting patients NOW)
- Biotechs in Phase 2/3 (most expensive phase, most urgent)
- Academic medical centers with active studies

They're burning $50K-500K per DAY on trials. Every delay costs millions.

WHO GETS PAID (Supply):
- Patient recruitment firms (find patients fast)
- Site management organizations (run trial sites)
- CROs (manage the whole trial)

WHY THIS IS GOLD:
Active recruiting = desperate for help. Trial delays cost them millions. 93% of trials have direct contact info. These people answer emails because they NEED solutions now.

Status "RECRUITING" = active buying signal. They're spending money TODAY.

Answer any questions about this market.`,
    demand: {
      description: 'Who needs help',
      examples: [
        'Pharma companies with recruiting trials',
        'Biotechs in Phase 2/3',
        'Academic medical centers',
      ],
      signals: ['Trial status', 'Sponsor type', 'Therapeutic area', 'Direct contact'],
    },
    supply: {
      description: 'Who fulfills the need',
      examples: [
        'Patient recruitment firms',
        'Site management organizations',
        'CROs',
      ],
    },
  },
];

// =============================================================================
// TOOLTIP COMPONENT
// =============================================================================

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <HelpCircle
        className="w-3.5 h-3.5 text-white/30 hover:text-white/50 cursor-help transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white/90 bg-black/90 border border-white/10 rounded-lg shadow-xl whitespace-nowrap">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90" />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CUSTOM SELECT COMPONENT — Stripe/Linear Quality
// =============================================================================

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  placeholder?: string;
}

function Select({ value, onChange, options, placeholder = 'Select...' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find current label
  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, options.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, highlightedIndex, options, onChange]);

  // Reset highlighted on open
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  // Scroll highlighted into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full h-10 px-3 text-left text-[13px]
          bg-[#141414] border rounded-lg
          flex items-center justify-between gap-2
          transition-all duration-150 ease-out
          ${isOpen
            ? 'border-white/20 bg-[#1A1A1A] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]'
            : 'border-white/[0.08] hover:border-white/[0.12] hover:bg-[#181818]'
          }
        `}
      >
        <span className={selectedOption ? 'text-white/90' : 'text-white/40'}>
          {displayLabel}
        </span>
        <ChevronDown
          className={`
            w-4 h-4 text-white/40 flex-shrink-0
            transition-transform duration-200 ease-out
            ${isOpen ? 'rotate-180' : ''}
          `}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="
            absolute z-[100] w-full mt-1
            bg-[#1A1A1A] border border-white/[0.1] rounded-lg
            shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]
            overflow-hidden
            animate-in fade-in slide-in-from-top-1 duration-150
            max-h-[240px] overflow-y-auto
          "
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`
                w-full px-3 py-2.5 text-left text-[13px]
                transition-colors duration-75
                flex items-center justify-between
                ${option.value === value
                  ? 'text-white bg-white/[0.06]'
                  : 'text-white/70 hover:text-white/90'
                }
                ${highlightedIndex === index && option.value !== value
                  ? 'bg-white/[0.04]'
                  : ''
                }
              `}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <Check className="w-3.5 h-3.5 text-white/60" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// BIOTECH MODAL
// =============================================================================

function BiotechModal({ source, onClose, onUse }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'config' | 'loading' | 'done'>('config');
  const [demandCount, setDemandCount] = useState(0);
  const [supplyCount, setSupplyCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Filters
  const [daysBack, setDaysBack] = useState(90);
  const [minAmount, setMinAmount] = useState(500000);
  const [limit, setLimit] = useState(100);
  const [nihInstitute, setNihInstitute] = useState('');

  const institutes = getNihInstitutes();

  const openGPT = () => {
    const prompt = encodeURIComponent(source.gptPrompt);
    window.open(`https://chatgpt.com/?prompt=${prompt}`, '_blank');
  };

  const handleFetch = async () => {
    setLoading(true);
    setStep('loading');
    setProgress(0);
    setProgressStage('Connecting');

    try {
      // Stage 1: Fetch demand
      setProgress(15);
      setProgressStage('Preparing demand');

      const demandResult = await fetchNihDemand({
        daysBack,
        minAmount,
        limit,
        nihInstitute: nihInstitute || undefined,
        keywords: DEFAULT_NIH_KEYWORDS,
      });

      setProgress(45);
      setDemandCount(demandResult.records.length);

      // Stage 2: Fetch supply
      setProgress(55);
      setProgressStage('Preparing supply');

      const supplyResult = await fetchUsaSpendingSupply({
        fundingAgency: 'Department of Health and Human Services',
        minAmount: 1000000,
        limit: Math.min(limit, 50),
        keywords: DEFAULT_CRO_KEYWORDS,
      });

      setProgress(80);
      setSupplyCount(supplyResult.records.length);

      // Stage 3: Store data
      setProgress(90);
      setProgressStage('Finalizing');

      if (demandResult.records.length > 0) {
        storeCsvData('demand', demandResult.records);
      }
      if (supplyResult.records.length > 0) {
        storeCsvData('supply', supplyResult.records);
      }

      setProgress(100);
      setProgressStage('Complete');
      setStep('done');

      // Notify parent
      setTimeout(() => {
        onUse(demandResult.records, supplyResult.records);
      }, 1500);
    } catch (error) {
      console.error('[PrebuiltIntelligence] Fetch error:', error);
      setStep('config');
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-[#0C0C0C] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/70">
              {source.icon}
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-white tracking-tight">{source.name}</h2>
              <p className="text-[13px] text-white/50">{source.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openGPT}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center gap-2 transition-all text-white/60 hover:text-white/80"
            >
              <OpenAIIcon className="w-3.5 h-3.5" />
              <span className="text-[12px]">Ask GPT</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {step === 'config' && (
            <>
              {/* Filters */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Therapeutic Area */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Institute
                    </label>
                    <Select
                      value={nihInstitute}
                      onChange={(v) => setNihInstitute(String(v))}
                      options={[
                        { value: '', label: 'All' },
                        ...institutes.map((inst) => ({
                          value: inst.code,
                          label: `${inst.code} — ${inst.therapeuticArea}`,
                        })),
                      ]}
                      placeholder="All"
                    />
                  </div>

                  {/* Min Amount */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Min Grant
                    </label>
                    <Select
                      value={minAmount}
                      onChange={(v) => setMinAmount(Number(v))}
                      options={[
                        { value: 250000, label: '$250K+' },
                        { value: 500000, label: '$500K+' },
                        { value: 1000000, label: '$1M+' },
                        { value: 2000000, label: '$2M+' },
                        { value: 5000000, label: '$5M+' },
                      ]}
                    />
                  </div>

                  {/* Days Back */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Recency
                    </label>
                    <Select
                      value={daysBack}
                      onChange={(v) => setDaysBack(Number(v))}
                      options={[
                        { value: 30, label: '30 days' },
                        { value: 60, label: '60 days' },
                        { value: 90, label: '90 days' },
                        { value: 180, label: '6 months' },
                        { value: 365, label: '1 year' },
                      ]}
                    />
                  </div>

                  {/* Limit */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Records
                    </label>
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 100))}
                      placeholder="100"
                      className="w-full h-10 px-3 text-[13px] bg-[#141414] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20 transition-colors hover:border-white/[0.12] hover:bg-[#181818]"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'loading' && (
            <div className="py-10 px-2">
              {/* Progress bar */}
              <div className="mb-6">
                <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/40 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Stage indicator */}
              <div className="text-center">
                <p className="text-[13px] text-white/70 mb-1">{progressStage}</p>
                <p className="text-[11px] text-white/40 font-mono">{progress}%</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-white/70" />
              </div>
              <p className="text-sm text-white/90 font-medium mb-2">Data loaded</p>
              <p className="text-xs text-white/50">
                {demandCount} demand · {supplyCount} supply
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'config' && (
          <div className="px-6 py-4 border-t border-white/[0.06] bg-[#0A0A0A] flex justify-end">
            <button
              onClick={handleFetch}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-white text-[#0A0A0A] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CLINICAL TRIALS MODAL
// =============================================================================

const TRIAL_STATUSES = [
  { value: 'RECRUITING', label: 'Recruiting', description: 'Actively seeking participants' },
  { value: 'NOT_YET_RECRUITING', label: 'Not Yet Recruiting', description: 'Approved but not started' },
  { value: 'ACTIVE_NOT_RECRUITING', label: 'Active, Not Recruiting', description: 'Ongoing but enrollment closed' },
  { value: 'COMPLETED', label: 'Completed', description: 'Trial finished' },
  { value: 'ENROLLING_BY_INVITATION', label: 'Enrolling by Invitation', description: 'Invitation-only enrollment' },
];

const COMMON_CONDITIONS = [
  { value: '', label: 'All Conditions' },
  { value: 'cancer', label: 'Oncology' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'cardiovascular', label: 'Cardiovascular' },
  { value: 'alzheimer', label: "Alzheimer's / Neurology" },
  { value: 'autoimmune', label: 'Autoimmune' },
  { value: 'infectious disease', label: 'Infectious Disease' },
  { value: 'rare disease', label: 'Rare Disease' },
];

function ClinicalTrialsModal({ source, onClose, onUse }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'config' | 'loading' | 'done'>('config');
  const [demandCount, setDemandCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Filters
  const [status, setStatus] = useState('RECRUITING');
  const [condition, setCondition] = useState('');
  const [pageSize, setPageSize] = useState(100);

  const openGPT = () => {
    const prompt = encodeURIComponent(source.gptPrompt);
    window.open(`https://chatgpt.com/?prompt=${prompt}`, '_blank');
  };

  const handleFetch = async () => {
    setLoading(true);
    setStep('loading');
    setProgress(0);
    setProgressStage('Connecting');

    try {
      setProgress(20);
      setProgressStage('Preparing demand');

      const result = await fetchClinicalTrials({
        status,
        condition: condition || undefined,
        pageSize,
      });

      setProgress(70);
      setDemandCount(result.records.length);

      setProgress(85);
      setProgressStage('Finalizing');

      // Store in localStorage as demand (clinical trials = companies that need services)
      if (result.records.length > 0) {
        storeCsvData('demand', result.records);
      }

      setProgress(100);
      setProgressStage('Complete');
      setStep('done');

      // Notify parent (demand only, no supply from this source)
      setTimeout(() => {
        onUse(result.records, []);
      }, 1500);
    } catch (error) {
      console.error('[PrebuiltIntelligence] Clinical Trials fetch error:', error);
      setStep('config');
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-[#0C0C0C] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/70">
              {source.icon}
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-white tracking-tight">{source.name}</h2>
              <p className="text-[13px] text-white/50">{source.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openGPT}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center gap-2 transition-all text-white/60 hover:text-white/80"
            >
              <OpenAIIcon className="w-3.5 h-3.5" />
              <span className="text-[12px]">Ask GPT</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {step === 'config' && (
            <>
              {/* Filters */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* Trial Status */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Status
                    </label>
                    <Select
                      value={status}
                      onChange={(v) => setStatus(String(v))}
                      options={TRIAL_STATUSES.map((s) => ({
                        value: s.value,
                        label: s.label,
                      }))}
                    />
                  </div>

                  {/* Condition */}
                  <div>
                    <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                      Therapeutic Area
                    </label>
                    <Select
                      value={condition}
                      onChange={(v) => setCondition(String(v))}
                      options={COMMON_CONDITIONS.map((c) => ({
                        value: c.value,
                        label: c.label,
                      }))}
                      placeholder="All conditions"
                    />
                  </div>
                </div>

                {/* Records - Input instead of dropdown for unlimited */}
                <div>
                  <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                    Records
                  </label>
                  <input
                    type="number"
                    value={pageSize}
                    onChange={(e) => setPageSize(Math.max(1, parseInt(e.target.value) || 100))}
                    placeholder="100"
                    className="w-full h-10 px-3 text-[13px] bg-[#141414] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20 transition-colors hover:border-white/[0.12] hover:bg-[#181818]"
                  />
                </div>
              </div>
            </>
          )}

          {step === 'loading' && (
            <div className="py-10 px-2">
              {/* Progress bar */}
              <div className="mb-6">
                <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/40 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Stage indicator */}
              <div className="text-center">
                <p className="text-[13px] text-white/70 mb-1">{progressStage}</p>
                <p className="text-[11px] text-white/40 font-mono">{progress}%</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-white/70" />
              </div>
              <p className="text-sm text-white/90 font-medium mb-2">Data loaded</p>
              <p className="text-xs text-white/50">{demandCount} records</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'config' && (
          <div className="px-6 py-4 border-t border-white/[0.06] bg-[#0A0A0A] flex justify-end">
            <button
              onClick={handleFetch}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-white text-[#0A0A0A] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface PrebuiltIntelligenceProps {
  onDataLoaded?: (demand: NormalizedRecord[], supply: NormalizedRecord[]) => void;
}

export default function PrebuiltIntelligence({ onDataLoaded }: PrebuiltIntelligenceProps) {
  const [selectedSource, setSelectedSource] = useState<PrebuiltSource | null>(null);

  const handleUse = (demand: NormalizedRecord[], supply: NormalizedRecord[]) => {
    setSelectedSource(null);
    onDataLoaded?.(demand, supply);
  };

  // Render appropriate modal based on source type
  const renderModal = () => {
    if (!selectedSource) return null;

    switch (selectedSource.id) {
      case 'clinical_trials':
        return (
          <ClinicalTrialsModal
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
            onUse={handleUse}
          />
        );
      case 'biotech':
      default:
        return (
          <BiotechModal
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
            onUse={handleUse}
          />
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-[13px] font-medium text-white/70 uppercase tracking-wide">
          Data Sources
        </h3>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {PREBUILT_SOURCES.map((source) => (
          <button
            key={source.id}
            onClick={() => source.status === 'active' && setSelectedSource(source)}
            disabled={source.status === 'coming_soon'}
            className={`
              w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-150
              ${source.status === 'active'
                ? 'bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] cursor-pointer'
                : 'bg-white/[0.01] border border-white/[0.04] cursor-not-allowed opacity-40'
              }
            `}
          >
            <div className={`
              w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
              ${source.status === 'active' ? 'bg-white/[0.06] text-white/70' : 'bg-white/[0.03] text-white/30'}
            `}>
              {source.icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-medium text-white/90">{source.name}</h4>
                {source.status === 'coming_soon' && (
                  <span className="text-[10px] text-white/30">Soon</span>
                )}
              </div>
              <p className="text-[12px] text-white/40 truncate">{source.tagline}</p>
            </div>

            {source.status === 'active' && (
              <ArrowRight className="w-4 h-4 text-white/20 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}
