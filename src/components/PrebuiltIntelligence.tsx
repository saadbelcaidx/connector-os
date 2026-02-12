/**
 * PrebuiltIntelligence.tsx — Pre-built Data Sources UI
 *
 * Shows available pre-built intelligence sources (NIH, USASpending, etc.)
 * with modals explaining demand/supply and filter configuration.
 *
 * DESIGN: Apple x Vercel x Linear aesthetic
 */

import { useState, useRef, useEffect } from 'react';
import { X, HelpCircle, FlaskConical, Building2, DollarSign, Clock, MapPin, Users, ArrowRight, Loader2, Check, Stethoscope, ChevronDown, Zap, ExternalLink } from 'lucide-react';
import { fetchNihDemand, getNihInstitutes, DEFAULT_NIH_KEYWORDS } from '../services/NihService';
import { fetchUsaSpendingSupply, DEFAULT_CRO_KEYWORDS, FUNDING_AGENCIES } from '../services/UsaSpendingService';
import { fetchClinicalTrials } from '../services/PublicDatabaseClient';
import { storeCsvData } from '../services/SignalsClient';
import { searchMarkets, enrichCompanies, normalizeToRecord, storeAsdemand, storeAsSupply } from '../services/MarketsService';
import type { NormalizedRecord } from '../schemas';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { getCsvData } from '../services/SignalsClient';

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
  {
    id: 'markets',
    name: 'Markets',
    icon: <Zap className="w-6 h-6" />,
    tagline: 'Real-time hiring, funding & growth signals',
    status: 'active',
    gptPrompt: `MARKETS - Universal Signal Intelligence

This is a real-time signal database covering 9M+ contacts.

SIGNALS YOU CAN SEARCH:
- Hiring: Companies posting specific roles (case-sensitive titles)
- Funding: Companies that just raised (pre-seed to Series D+)
- Headcount Growth: Companies expanding teams
- Product Launches: Companies shipping new products
- Partnerships: Companies announcing deals
- Acquisitions: Companies buying other companies

HOW TO USE:
1. Pick a signal (e.g., "Hiring Software Engineers")
2. Pick an industry (e.g., "Software & Internet")
3. System returns 50 decision-maker contacts at those companies
4. Flow enriches their emails and you route intros

The signal tells you WHEN to reach out. The industry tells you WHO to reach.

Answer any questions about this market.`,
    demand: {
      description: 'Companies with active signals',
      examples: [
        'Companies hiring specific roles (Software Engineer, Account Executive)',
        'Companies that just raised funding (Series A, B, C)',
        'Companies expanding headcount',
      ],
      signals: ['Hiring activity', 'Funding raised', 'Headcount growth', 'Partnerships'],
    },
    supply: {
      description: 'Service providers who fulfill the need',
      examples: [
        'Recruiting agencies for the hired roles',
        'Consultants for the funded verticals',
        'Growth partners for expanding companies',
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
// MARKETS MODAL
// =============================================================================

const NEWS_SIGNALS = [
  { value: 'hires', label: 'Hiring' },
  { value: 'receives_financing', label: 'Funding raised' },
  { value: 'increases_headcount_by', label: 'Headcount growth' },
  { value: 'launches', label: 'Product launch' },
  { value: 'partners_with', label: 'New partnership' },
  { value: 'acquires', label: 'Acquisition' },
];

const INDUSTRY_GROUPS: { category: string; subs: string[] }[] = [
  { category: 'Software & Internet', subs: ['Computer & Network Security', 'Computer Software', 'Information Technology and Services', 'Internet'] },
  { category: 'Business Services', subs: ['Alternative Dispute Resolution', 'Animation', 'Business Supplies and Equipment', 'Design', 'Environmental Services', 'Events Services', 'Executive Office', 'Facilities Services', 'Fund-Raising', 'Graphic Design', 'Human Resources', 'Import and Export', 'Individual & Family Services', 'Information Services', 'International Trade and Development', 'Law Practice', 'Legal Services', 'Management Consulting', 'Market Research', 'Marketing and Advertising', 'Outsourcing/Offshoring', 'Professional Training & Coaching', 'Program Development', 'Public Relations and Communications', 'Public Safety', 'Security and Investigations', 'Staffing and Recruiting', 'Think Tanks', 'Translation and Localization', 'Writing and Editing'] },
  { category: 'Financial Services', subs: ['Accounting', 'Banking', 'Capital Markets', 'Financial Services', 'Insurance', 'Investment Banking', 'Investment Management', 'Venture Capital & Private Equity'] },
  { category: 'Healthcare', subs: ['Alternative Medicine', 'Biotechnology', 'Health, Wellness and Fitness', 'Hospital & Health Care', 'Medical Devices', 'Medical Practice', 'Mental Health Care', 'Pharmaceuticals', 'Veterinary'] },
  { category: 'Manufacturing', subs: ['Automotive', 'Aviation & Aerospace', 'Chemicals', 'Electrical/Electronic Manufacturing', 'Furniture', 'Industrial Automation', 'Machinery', 'Mechanical or Industrial Engineering', 'Plastics', 'Railroad Manufacture', 'Shipbuilding', 'Textiles'] },
  { category: 'Education', subs: ['Education Management', 'E-Learning', 'Higher Education', 'Primary/Secondary Education', 'Research'] },
  { category: 'Energy & Utilities', subs: ['Oil & Energy', 'Renewables & Environment', 'Utilities'] },
  { category: 'Government', subs: ['Defense & Space', 'Government Administration', 'Government Relations', 'International Affairs', 'Judiciary', 'Law Enforcement', 'Legislative Office', 'Military', 'Museums and Institutions', 'Public Policy'] },
  { category: 'Real Estate & Construction', subs: ['Architecture & Planning', 'Building Materials', 'Civil Engineering', 'Commercial Real Estate', 'Construction', 'Glass, Ceramics & Concrete', 'Real Estate'] },
  { category: 'Retail', subs: ['Apparel & Fashion', 'Cosmetics', 'Luxury Goods & Jewelry', 'Retail', 'Supermarkets'] },
  { category: 'Media & Entertainment', subs: ['Broadcast Media', 'Media Production', 'Motion Pictures and Film', 'Music', 'Newspapers', 'Online Media', 'Printing', 'Publishing'] },
  { category: 'Telecommunications', subs: ['Telecommunications', 'Wireless'] },
  { category: 'Transportation & Storage', subs: ['Airlines/Aviation', 'Logistics and Supply Chain', 'Maritime', 'Package/Freight Delivery', 'Packaging and Containers', 'Warehousing', 'Transportation/Trucking/Railroad'] },
  { category: 'Agriculture & Mining', subs: ['Dairy', 'Farming', 'Fishery', 'Food & Beverages', 'Food Production', 'Mining & Metals', 'Paper & Forest Products', 'Ranching', 'Tobacco'] },
  { category: 'Computer & Electronics', subs: ['Computer Games', 'Computer Hardware', 'Computer Networking', 'Consumer Electronics', 'Semiconductors'] },
  { category: 'Consumer Services', subs: ['Consumer Goods', 'Consumer Services'] },
  { category: 'Non-Profit', subs: ['Civic & Social Organization', 'Libraries', 'Non-Profit Organization Management', 'Philanthropy', 'Political Organization', 'Religious Institutions'] },
  { category: 'Travel & Leisure', subs: ['Entertainment', 'Fine Art', 'Gambling & Casinos', 'Hospitality', 'Leisure, Travel & Tourism', 'Performing Arts', 'Photography', 'Recreational Facilities and Services', 'Restaurants', 'Sporting Goods', 'Sports', 'Wine and Spirits'] },
  { category: 'Wholesale & Distribution', subs: ['Wholesale'] },
  { category: 'Other', subs: ['Arts and Crafts', 'Nanotechnology'] },
];

const FUNDING_OPTIONS = [
  { value: 'pre_seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series_a', label: 'Series A' },
  { value: 'series_b', label: 'Series B' },
  { value: 'series_c', label: 'Series C' },
  { value: 'series_d', label: 'Series D+' },
];

function MarketsModal({ source, onClose, onUse }: ModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'searching' | 'preview'>('config');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Preview state
  const [previewLeads, setPreviewLeads] = useState<any[]>([]);
  const [enrichedRecords, setEnrichedRecords] = useState<NormalizedRecord[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState(5000);

  // Running counters — read from localStorage on mount
  const [demandCount, setDemandCount] = useState(0);
  const [supplyCount, setSupplyCount] = useState(0);

  useEffect(() => {
    const d = getCsvData('demand');
    const s = getCsvData('supply');
    setDemandCount(d?.length || 0);
    setSupplyCount(s?.length || 0);
  }, []);

  // Filters
  const [selectedSignals, setSelectedSignals] = useState<string[]>(['hires']);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [industrySearch, setIndustrySearch] = useState('');
  const [jobListingFilter, setJobListingFilter] = useState('');
  const [selectedFunding, setSelectedFunding] = useState<string[]>([]);

  // Get outreach API key from settings (checks all storage locations)
  const getOutreachApiKey = (): string => {
    try {
      const dedicated = localStorage.getItem('outreach_api_key');
      if (dedicated) return dedicated;
      const cached = localStorage.getItem('guest_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed?.settings?.instantlyApiKey || '';
      }
    } catch { /* ignore */ }
    return '';
  };

  const toggleChip = (list: string[], value: string, setter: (v: string[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const openGPT = () => {
    const prompt = encodeURIComponent(source.gptPrompt);
    window.open(`https://chatgpt.com/?prompt=${prompt}`, '_blank');
  };

  const handleJobFilterChange = (value: string) => {
    const capitalized = value.replace(/\b\w/g, c => c.toUpperCase());
    setJobListingFilter(capitalized);
  };

  // Search → Preview (no storage yet)
  const handleSearch = async () => {
    const apiKey = getOutreachApiKey();
    if (!apiKey) {
      setError('Outreach API key required. Add it in Settings → Outreach.');
      return;
    }

    if (selectedSignals.length === 0 && selectedIndustries.length === 0) {
      setError('Select at least one signal or industry.');
      return;
    }

    setError('');
    setStep('searching');
    setProgress(10);
    setProgressStage('Searching leads');

    try {
      const jobFilters = jobListingFilter
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const result = await searchMarkets({
        apiKey,
        news: selectedSignals,
        subIndustry: selectedIndustries.length > 0 ? { include: selectedIndustries, exclude: [] } : undefined,
        jobListingFilter: jobFilters.length > 0 ? jobFilters : undefined,
        fundingType: selectedFunding.length > 0 ? selectedFunding : undefined,
        showOneLeadPerCompany: true,
      });

      if (result.error) {
        setError(result.error);
        setStep('config');
        setProgress(0);
        return;
      }

      if (typeof result.dailyRemaining === 'number') {
        setDailyRemaining(result.dailyRemaining);
      }

      setProgress(50);
      setProgressStage('Enriching companies');

      const companyIds = [
        ...new Set(
          result.records
            .map(r => (r.raw as any)?.lead?.companyId)
            .filter((id): id is string => !!id)
        ),
      ];

      let companyMap = new Map<string, any>();
      if (companyIds.length > 0) {
        setProgress(60);
        companyMap = await enrichCompanies(companyIds);
        setProgress(80);
      }

      const signalLabel = buildSignalLabelFromFilters(selectedSignals, jobFilters);
      const records = result.records.map(r => {
        const lead = (r.raw as any)?.lead;
        const companyId = lead?.companyId;
        const company = companyId ? companyMap.get(companyId) || null : null;
        return normalizeToRecord(lead, company, signalLabel, selectedIndustries[0] || null);
      });

      // Store in state for preview — NOT in localStorage yet
      setPreviewLeads(result.records.map(r => (r.raw as any)?.lead).filter(Boolean));
      setEnrichedRecords(records);
      setTotalFound(result.totalFound);
      setProgress(100);
      setStep('preview');
    } catch (err: any) {
      console.log(`[Markets] Modal error: ${err.message}`);
      setError(err.message || 'Search failed');
      setStep('config');
      setProgress(0);
    }
  };

  // Accumulate as demand
  const handleAddAsDemand = () => {
    const existing = getCsvData('demand') || [];
    const combined = [...existing, ...enrichedRecords];
    storeAsdemand(combined);
    setDemandCount(combined.length);
    setStep('config');
    setPreviewLeads([]);
    setEnrichedRecords([]);
    onUse(combined, getCsvData('supply') || []);
  };

  // Accumulate as supply (filtered — only service providers pass)
  const handleAddAsSupply = () => {
    const existing = getCsvData('supply') || [];
    const combined = [...existing, ...enrichedRecords];
    const keptCount = storeAsSupply(combined);
    setSupplyCount(keptCount);
    setStep('config');
    setPreviewLeads([]);
    setEnrichedRecords([]);
    onUse(getCsvData('demand') || [], getCsvData('supply') || []);
  };

  // New search — clear preview, keep filters
  const handleNewSearch = () => {
    setStep('config');
    setPreviewLeads([]);
    setEnrichedRecords([]);
    setProgress(0);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[#0C0C0C] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden">
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

        {/* Running counters bar */}
        <div className="px-6 py-2.5 border-b border-white/[0.06] flex items-center gap-4 text-[12px]">
          <span className="text-white/50">
            Demand: <span className={demandCount > 0 ? 'text-white/90 font-medium' : 'text-white/30'}>{demandCount.toLocaleString()}</span>
          </span>
          <span className="text-white/[0.1]">|</span>
          <span className="text-white/50">
            Supply: <span className={supplyCount > 0 ? 'text-white/90 font-medium' : 'text-white/30'}>{supplyCount.toLocaleString()}</span>
          </span>
          <span className="text-white/[0.1]">|</span>
          <span className="text-white/30 font-mono">{dailyRemaining.toLocaleString()} remaining today</span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          {step === 'config' && (
            <>
              {/* Error */}
              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15] text-[13px] text-red-400">
                  {error}
                </div>
              )}

              {/* Signal selector */}
              <div>
                <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                  Signal
                </label>
                <div className="flex flex-wrap gap-2">
                  {NEWS_SIGNALS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => toggleChip(selectedSignals, s.value, setSelectedSignals)}
                      className={`
                        px-3 py-1.5 rounded-lg text-[12px] border transition-all duration-150
                        ${selectedSignals.includes(s.value)
                          ? 'bg-white text-black border-white font-medium'
                          : 'bg-transparent text-white/60 border-white/[0.12] hover:border-white/30'
                        }
                      `}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Industry selector — searchable grouped */}
              <div>
                <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                  Industry
                  <span className="text-white/30 normal-case ml-1">(optional — search to find your niche)</span>
                </label>
                {selectedIndustries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedIndustries.map(ind => (
                      <button
                        key={ind}
                        onClick={() => toggleChip(selectedIndustries, ind, setSelectedIndustries)}
                        className="px-2.5 py-1 rounded-md text-[11px] border bg-white text-black border-white font-medium transition-all duration-150"
                      >
                        {ind} ×
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={industrySearch}
                  onChange={(e) => setIndustrySearch(e.target.value)}
                  placeholder="Search industries... (e.g. Recruiting, Legal, Biotech)"
                  className="w-full h-9 px-3 text-[12px] bg-[#141414] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20 transition-colors hover:border-white/[0.12] hover:bg-[#181818] placeholder:text-white/30 mb-2"
                />
                <div className="max-h-[200px] overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0f0f0f]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                  {INDUSTRY_GROUPS
                    .map(group => {
                      const q = industrySearch.toLowerCase();
                      const matchingSubs = q
                        ? group.subs.filter(s => s.toLowerCase().includes(q) || group.category.toLowerCase().includes(q))
                        : group.subs;
                      if (matchingSubs.length === 0) return null;
                      return (
                        <div key={group.category} className="px-2 py-1.5">
                          <div className="text-[10px] text-white/30 font-medium uppercase tracking-wider mb-1">{group.category}</div>
                          <div className="flex flex-wrap gap-1">
                            {matchingSubs.map(sub => (
                              <button
                                key={sub}
                                onClick={() => toggleChip(selectedIndustries, sub, setSelectedIndustries)}
                                className={`
                                  px-2 py-0.5 rounded text-[11px] border transition-all duration-150
                                  ${selectedIndustries.includes(sub)
                                    ? 'bg-white text-black border-white font-medium'
                                    : 'bg-transparent text-white/50 border-white/[0.06] hover:border-white/20'
                                  }
                                `}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean)}
                  {INDUSTRY_GROUPS.every(g => {
                    const q = industrySearch.toLowerCase();
                    return g.subs.filter(s => s.toLowerCase().includes(q) || g.category.toLowerCase().includes(q)).length === 0;
                  }) && (
                    <div className="px-3 py-4 text-center text-[11px] text-white/30">No industries match "{industrySearch}"</div>
                  )}
                </div>
              </div>

              {/* Job listing filter */}
              <div>
                <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                  Job title filter
                  <span className="text-white/30 normal-case ml-1">(case sensitive — capitalize role names)</span>
                </label>
                <input
                  type="text"
                  value={jobListingFilter}
                  onChange={(e) => handleJobFilterChange(e.target.value)}
                  placeholder="Software Engineer, Account Executive..."
                  className="w-full h-10 px-3 text-[13px] bg-[#141414] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20 transition-colors hover:border-white/[0.12] hover:bg-[#181818] placeholder:text-white/30"
                />
              </div>

              {/* Funding filter */}
              <div>
                <label className="text-[11px] text-white/50 mb-2 block font-medium uppercase tracking-wide">
                  Funding stage
                  <span className="text-white/30 normal-case ml-1">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {FUNDING_OPTIONS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => toggleChip(selectedFunding, f.value, setSelectedFunding)}
                      className={`
                        px-3 py-1.5 rounded-lg text-[12px] border transition-all duration-150
                        ${selectedFunding.includes(f.value)
                          ? 'bg-white text-black border-white font-medium'
                          : 'bg-transparent text-white/60 border-white/[0.12] hover:border-white/30'
                        }
                      `}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'searching' && (
            <div className="py-10 px-2">
              <div className="mb-6">
                <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/40 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-white/70 mb-1">{progressStage}</p>
                <p className="text-[11px] text-white/40 font-mono">{progress}%</p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <>
              {/* Result badge */}
              <div className="flex items-center gap-2 text-[12px] text-white/50">
                <span className="text-white/90 font-medium">{totalFound.toLocaleString()} matching</span>
                <span className="text-white/20">&middot;</span>
                <span>{enrichedRecords.length} loaded</span>
              </div>

              {/* Preview table */}
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="text-left px-3 py-2 text-white/40 font-medium">Name</th>
                      <th className="text-left px-3 py-2 text-white/40 font-medium">Title</th>
                      <th className="text-left px-3 py-2 text-white/40 font-medium">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedRecords.slice(0, 10).map((r, i) => (
                      <tr
                        key={r.recordKey}
                        className="border-b border-white/[0.03] last:border-0"
                        style={{ animation: `rowFadeIn 0.3s ease ${i * 0.03}s both` }}
                      >
                        <td className="px-3 py-2 text-white/80">{r.fullName || '—'}</td>
                        <td className="px-3 py-2 text-white/50 truncate max-w-[180px]">{r.title || '—'}</td>
                        <td className="px-3 py-2 text-white/50">{r.company || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {enrichedRecords.length > 10 && (
                  <div className="px-3 py-2 text-[11px] text-white/30 text-center border-t border-white/[0.04]">
                    +{enrichedRecords.length - 10} more
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'config' && (
          <div className="px-6 py-4 border-t border-white/[0.06] bg-[#0A0A0A] flex items-center justify-between">
            <div>
              {(demandCount > 0 && supplyCount > 0) && (
                <button
                  onClick={() => { onClose(); navigate('/flow'); }}
                  className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[13px] text-white/70 hover:text-white transition-all flex items-center gap-2"
                >
                  Start Flow <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              className="px-5 py-2 rounded-lg bg-white text-[#0A0A0A] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Search
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div className="px-6 py-4 border-t border-white/[0.06] bg-[#0A0A0A] flex items-center justify-between">
            <button
              onClick={handleNewSearch}
              className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[13px] text-white/60 hover:text-white transition-all"
            >
              ← New search
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddAsDemand}
                className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-[13px] text-white/80 hover:text-white transition-all font-medium"
              >
                + Demand ({enrichedRecords.length})
              </button>
              <button
                onClick={handleAddAsSupply}
                className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-[13px] text-white/80 hover:text-white transition-all font-medium"
              >
                + Supply ({enrichedRecords.length})
              </button>
              {(demandCount > 0 && supplyCount > 0) && (
                <button
                  onClick={() => { onClose(); navigate('/flow'); }}
                  className="px-4 py-2 rounded-lg bg-white text-[#0A0A0A] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all flex items-center gap-2"
                >
                  Start Flow <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row fade-in animation */}
      <style>{`
        @keyframes rowFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function buildSignalLabelFromFilters(signals: string[], jobFilters: string[]): string {
  const signalNames: Record<string, string> = {
    hires: 'Hiring',
    receives_financing: 'Funding raised',
    increases_headcount_by: 'Headcount growth',
    launches: 'Product launch',
    partners_with: 'New partnership',
    acquires: 'Acquisition',
  };
  const parts = signals.map(f => signalNames[f] || f);
  if (jobFilters.length > 0) {
    parts.push(jobFilters.join(', '));
  }
  return parts.join(' — ') || 'Market signal';
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface PrebuiltIntelligenceProps {
  onDataLoaded?: (demand: NormalizedRecord[], supply: NormalizedRecord[]) => void;
}

export default function PrebuiltIntelligence({ onDataLoaded }: PrebuiltIntelligenceProps) {
  const [selectedSource, setSelectedSource] = useState<PrebuiltSource | null>(null);
  const { user, loading: authLoading } = useAuth();
  const [ssmStatus, setSsmStatus] = useState<'loading' | 'approved' | 'needs_ssm'>('loading');

  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  // SSM access check
  useEffect(() => {
    if (isDev) {
      setSsmStatus('approved');
      return;
    }
    if (authLoading) return;
    if (!user?.email) {
      setSsmStatus('needs_ssm');
      return;
    }

    const checkAccess = async () => {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/ssm-access/check?email=${encodeURIComponent(user.email!.toLowerCase().trim())}`
        );
        if (!response.ok) {
          setSsmStatus('needs_ssm');
          return;
        }
        const data = await response.json();
        setSsmStatus(data.status === 'approved' ? 'approved' : 'needs_ssm');
      } catch {
        setSsmStatus('needs_ssm');
      }
    };

    checkAccess();
  }, [user, authLoading, isDev, SUPABASE_URL]);

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
      case 'markets':
        return (
          <MarketsModal
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

      {/* SSM Gate */}
      {ssmStatus === 'loading' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      )}

      {ssmStatus === 'needs_ssm' && (
        <div className="relative">
          {/* Blurred cards preview */}
          <div className="blur-[6px] pointer-events-none select-none opacity-40">
            <div className="space-y-2">
              {PREBUILT_SOURCES.filter(s => s.status === 'active').map((source) => (
                <div
                  key={source.id}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/70">
                    {source.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-medium text-white/90">{source.name}</h4>
                    <p className="text-[12px] text-white/40">{source.tagline}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SSM CTA overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-6 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] max-w-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <img src="/ssm-logo.png" alt="SSM" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-medium text-white/90 mb-1">SSM membership required</h3>
                  <p className="text-[13px] text-white/50 mb-4">
                    Pre-built data sources are exclusive to community members. Join to unlock hiring signals, funding data, and more.
                  </p>
                  <a
                    href="https://www.skool.com/ssmasters"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white/[0.08] text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/[0.12] transition-all"
                  >
                    Join the community
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ssmStatus === 'approved' && (
        <>
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
        </>
      )}
    </div>
  );
}
