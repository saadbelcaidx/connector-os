/**
 * PrebuiltMarkets.tsx — Standalone Markets Page
 *
 * Signal-based lead search. Extracted from MarketsModal in PrebuiltIntelligence.tsx.
 * Lives at /hub route. CSV is the canonical interface — Flow reads from localStorage.
 *
 * Data flow:
 *   searchMarkets() → enrichCompanies() → normalizeToRecord()
 *     → storeCsvData('demand' | 'supply') → localStorage
 *     → Flow.tsx reads via getCsvData()
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Search, Loader2, ChevronDown, ChevronRight, Radar,
  TrendingUp, Banknote, Rocket, Handshake, AlertTriangle, Tag, Check, X,
} from 'lucide-react';
import { searchMarkets, enrichCompanies, normalizeToRecord, storeAsdemand, storeAsSupply } from './services/MarketsService';
import { getCsvData } from './services/SignalsClient';
import type { NormalizedRecord } from './schemas';
import Dock from './Dock';

// =============================================================================
// CONSTANTS — exact API values from Instantly SuperSearch
// =============================================================================

// All 25 news signals from the API
const NEWS_SIGNALS = [
  { value: 'hires', label: 'Hiring' },
  { value: 'receives_financing', label: 'Funding raised' },
  { value: 'launches', label: 'Product launch' },
  { value: 'partners_with', label: 'Partnership' },
  { value: 'acquires', label: 'Acquisition' },
  { value: 'signs_new_client', label: 'New client' },
  { value: 'expands_offices_to', label: 'Expands to' },
  { value: 'expands_offices_in', label: 'Expands in' },
  { value: 'expands_facilities', label: 'Expands facilities' },
  { value: 'opens_new_location', label: 'New location' },
  { value: 'goes_public', label: 'IPO' },
  { value: 'invests_into', label: 'Invests' },
  { value: 'invests_into_assets', label: 'Asset investment' },
  { value: 'integrates_with', label: 'Integration' },
  { value: 'is_developing', label: 'Developing' },
  { value: 'recognized_as', label: 'Award/recognition' },
  { value: 'receives_award', label: 'Receives award' },
  { value: 'merges_with', label: 'Merger' },
  { value: 'sells_assets_to', label: 'Sells assets' },
  { value: 'leaves', label: 'Key departure' },
  { value: 'has_issues_with', label: 'Issues' },
  { value: 'closes_offices_in', label: 'Closes office' },
  { value: 'decreases_headcount_by', label: 'Layoffs' },
  { value: 'files_suit_against', label: 'Lawsuit' },
  { value: 'identified_as_competitor_of', label: 'Competitor ID' },
];

// Signal groups — same values, grouped by category with icons
const SIGNAL_GROUPS: { category: string; icon: typeof TrendingUp; signals: string[] }[] = [
  { category: 'Growth', icon: TrendingUp, signals: ['hires', 'expands_offices_to', 'expands_offices_in', 'expands_facilities', 'opens_new_location'] },
  { category: 'Capital', icon: Banknote, signals: ['receives_financing', 'goes_public', 'invests_into', 'invests_into_assets'] },
  { category: 'Product', icon: Rocket, signals: ['launches', 'is_developing', 'integrates_with'] },
  { category: 'Deals', icon: Handshake, signals: ['partners_with', 'acquires', 'signs_new_client', 'merges_with', 'sells_assets_to'] },
  { category: 'Risk', icon: AlertTriangle, signals: ['leaves', 'has_issues_with', 'closes_offices_in', 'decreases_headcount_by', 'files_suit_against'] },
  { category: 'Other', icon: Tag, signals: ['recognized_as', 'receives_award', 'identified_as_competitor_of'] },
];

// Signal value → category for dot colors in preview
const SIGNAL_CATEGORY_MAP: Record<string, string> = {};
SIGNAL_GROUPS.forEach(g => g.signals.forEach(s => { SIGNAL_CATEGORY_MAP[s] = g.category; }));

// Employee count — exact API shape: { op: "preset_between", min, max }
const EMPLOYEE_COUNT_OPTIONS = [
  { min: 1, max: 10, label: '1-10' },
  { min: 11, max: 25, label: '11-25' },
  { min: 26, max: 50, label: '26-50' },
  { min: 51, max: 100, label: '51-100' },
  { min: 101, max: 250, label: '101-250' },
  { min: 251, max: 500, label: '251-500' },
  { min: 501, max: 1000, label: '501-1K' },
  { min: 1001, max: 5000, label: '1K-5K' },
  { min: 5001, max: 10000, label: '5K-10K' },
];

// Revenue — exact API string values
const REVENUE_OPTIONS = [
  '$0 - 1M',
  '$1 - 10M',
  '$10 - 50M',
  '$50 - 100M',
  '$100 - 250M',
  '$250 - 500M',
  '$500M - 1B',
  '> $1B',
];

// Funding type — exact API string values (all 23)
const FUNDING_TYPE_OPTIONS = [
  { value: 'angel', label: 'Angel' },
  { value: 'pre_seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'pre_series_a', label: 'Pre-A' },
  { value: 'series_a', label: 'Series A' },
  { value: 'pre_series_b', label: 'Pre-B' },
  { value: 'series_b', label: 'Series B' },
  { value: 'pre_series_c', label: 'Pre-C' },
  { value: 'series_c', label: 'Series C' },
  { value: 'pre_series_d', label: 'Pre-D' },
  { value: 'series_d', label: 'Series D' },
  { value: 'pre_series_e', label: 'Pre-E' },
  { value: 'series_e', label: 'Series E' },
  { value: 'pre_series_f', label: 'Pre-F' },
  { value: 'series_f', label: 'Series F' },
  { value: 'pre_series_g', label: 'Pre-G' },
  { value: 'series_g', label: 'Series G' },
  { value: 'pre_series_h', label: 'Pre-H' },
  { value: 'series_h', label: 'Series H' },
  { value: 'pre_series_i', label: 'Pre-I' },
  { value: 'series_i', label: 'Series I' },
  { value: 'pre_series_j', label: 'Pre-J' },
  { value: 'series_j', label: 'Series J' },
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

// =============================================================================
// HELPERS
// =============================================================================

function buildSignalLabelFromFilters(signals: string[], jobFilters: string[]): string {
  const signalNames: Record<string, string> = {
    hires: 'Hiring', receives_financing: 'Funding', launches: 'Launch',
    partners_with: 'Partnership', acquires: 'Acquisition', signs_new_client: 'New client',
    goes_public: 'IPO', expands_offices_to: 'Expanding',
  };
  const parts = signals.map(f => signalNames[f] || f.replace(/_/g, ' '));
  if (jobFilters.length > 0) parts.push(jobFilters.join(', '));
  return parts.join(' — ') || 'Market signal';
}

// Signal label lookup
const SIGNAL_LABEL_MAP: Record<string, string> = {};
NEWS_SIGNALS.forEach(s => { SIGNAL_LABEL_MAP[s.value] = s.label; });

// Chip style helper — upgraded with subtle surface + check icon support
const chipClass = (selected: boolean) =>
  `h-7 px-3 rounded-md text-[11px] border transition-all duration-150 active:scale-[0.97] flex items-center gap-1.5 ${
    selected
      ? 'bg-white text-[#09090b] border-white font-medium shadow-[0_0_12px_rgba(255,255,255,0.04)]'
      : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-white/70'
  }`;

// Wider card style for Company Size + Revenue
const cardClass = (selected: boolean) =>
  `h-10 px-4 rounded-lg text-[12px] border transition-all duration-150 active:scale-[0.97] flex items-center gap-2 ${
    selected
      ? 'bg-white text-[#09090b] border-white font-medium shadow-[0_0_16px_rgba(255,255,255,0.06)]'
      : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-white/70'
  }`;

const inputClass = 'w-full h-9 px-3 text-[13px] bg-white/[0.03] border border-white/[0.06] rounded-md text-white/90 focus:outline-none focus:border-white/[0.15] transition-colors placeholder:text-white/20';

// Signal dot color for preview table
function getSignalDotColor(signalText: string): string {
  // Match signal text back to category
  for (const [value, label] of Object.entries(SIGNAL_LABEL_MAP)) {
    if (signalText.toLowerCase().includes(label.toLowerCase())) {
      const cat = SIGNAL_CATEGORY_MAP[value];
      if (cat === 'Growth') return 'bg-emerald-400';
      if (cat === 'Capital') return 'bg-amber-400';
      if (cat === 'Risk') return 'bg-red-400';
      if (cat === 'Product') return 'bg-blue-400';
      if (cat === 'Deals') return 'bg-violet-400';
    }
  }
  return 'bg-white/30';
}

// =============================================================================
// TOKEN INPUT — removable tags UI layer over comma-separated strings
// =============================================================================

function TokenInput({
  value, onChange, placeholder, autoCapitalize,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tokens = value.split(',').map(s => s.trim()).filter(Boolean);

  const addToken = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const final = autoCapitalize ? cleaned.replace(/\b\w/g, c => c.toUpperCase()) : cleaned;
    if (tokens.includes(final)) return;
    const next = [...tokens, final].join(', ');
    onChange(next);
    setInputValue('');
  };

  const removeToken = (index: number) => {
    const next = tokens.filter((_, i) => i !== index).join(', ');
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addToken(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && tokens.length > 0) {
      removeToken(tokens.length - 1);
    }
  };

  return (
    <div
      className="w-full max-w-md min-h-[36px] px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-md flex flex-wrap items-center gap-1.5 cursor-text focus-within:border-white/[0.15] transition-colors"
      onClick={() => inputRef.current?.focus()}
    >
      {tokens.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="h-6 px-2 rounded bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/70 flex items-center gap-1.5 shrink-0"
        >
          {t}
          <button
            onClick={(e) => { e.stopPropagation(); removeToken(i); }}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputValue.trim()) addToken(inputValue); }}
        placeholder={tokens.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] h-6 bg-transparent text-[13px] text-white/90 focus:outline-none placeholder:text-white/20"
      />
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function PrebuiltMarkets() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'searching' | 'preview'>('config');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Preview state
  const [enrichedRecords, setEnrichedRecords] = useState<NormalizedRecord[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState(5000);

  // Running counters
  const [demandCount, setDemandCount] = useState(0);
  const [supplyCount, setSupplyCount] = useState(0);

  // UI state
  const [showIndustries, setShowIndustries] = useState(false);
  const [showFunding, setShowFunding] = useState(false);

  useEffect(() => {
    const d = getCsvData('demand');
    const s = getCsvData('supply');
    setDemandCount(d?.length || 0);
    setSupplyCount(s?.length || 0);
  }, []);

  // --- All filter state ---
  const [selectedSignals, setSelectedSignals] = useState<string[]>(['hires']);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [excludeIndustries, setExcludeIndustries] = useState<string[]>([]);
  const [industrySearch, setIndustrySearch] = useState('');
  const [jobListingFilter, setJobListingFilter] = useState('');
  const [titleInclude, setTitleInclude] = useState('');
  const [titleExclude, setTitleExclude] = useState('');
  const [selectedEmployeeCount, setSelectedEmployeeCount] = useState<{ min: number; max: number }[]>([]);
  const [selectedRevenue, setSelectedRevenue] = useState<string[]>([]);
  const [selectedFunding, setSelectedFunding] = useState<string[]>([]);
  const [keywordInclude, setKeywordInclude] = useState('');
  const [keywordExclude, setKeywordExclude] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [technologiesInput, setTechnologiesInput] = useState('');

  // Get outreach API key
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

  const toggleEmployeeRange = (min: number, max: number) => {
    setSelectedEmployeeCount(prev => {
      const exists = prev.some(r => r.min === min && r.max === max);
      return exists ? prev.filter(r => !(r.min === min && r.max === max)) : [...prev, { min, max }];
    });
  };

  // Search → Preview
  const handleSearch = async () => {
    const apiKey = getOutreachApiKey();
    if (!apiKey) {
      setError('Outreach API key required. Add it in Settings.');
      return;
    }

    setError('');
    setStep('searching');
    setProgress(10);
    setProgressStage('Searching leads');

    try {
      const jobFilters = jobListingFilter.split(',').map(s => s.trim()).filter(Boolean);
      const titleInc = titleInclude.split(',').map(s => s.trim()).filter(Boolean);
      const titleExc = titleExclude.split(',').map(s => s.trim()).filter(Boolean);
      const techFilters = technologiesInput.split(',').map(s => s.trim()).filter(Boolean);

      // Build subIndustry — exact API shape: { include: [], exclude: [] }
      const subIndustry = (selectedIndustries.length > 0 || excludeIndustries.length > 0)
        ? { include: selectedIndustries, exclude: excludeIndustries }
        : undefined;

      // Build title — exact API shape: { include: [], exclude: [] }
      const title = titleInc.length > 0
        ? { include: titleInc, exclude: titleExc }
        : undefined;

      // Build employeeCount — exact API shape: [{ op: "preset_between", min, max }]
      const employeeCount = selectedEmployeeCount.length > 0
        ? selectedEmployeeCount.map(r => ({ op: 'preset_between' as const, min: r.min, max: r.max }))
        : undefined;

      // Build keywordFilter — exact API shape: { include: "str", exclude: "str" }
      const keywordFilter = (keywordInclude.trim() || keywordExclude.trim())
        ? { include: keywordInclude.trim(), exclude: keywordExclude.trim() }
        : undefined;

      // Build locations — exact API shape: { include: [{ place_id, label }] }
      const locationLabels = locationInput.split(',').map(s => s.trim()).filter(Boolean);
      const locations = locationLabels.length > 0
        ? { include: locationLabels.map(label => ({ place_id: '', label })) }
        : undefined;

      const result = await searchMarkets({
        apiKey,
        news: selectedSignals.length > 0 ? selectedSignals : undefined,
        subIndustry,
        jobListingFilter: jobFilters.length > 0 ? jobFilters : undefined,
        title,
        employeeCount,
        fundingType: selectedFunding.length > 0 ? selectedFunding : undefined,
        revenue: selectedRevenue.length > 0 ? selectedRevenue : undefined,
        keywordFilter,
        locations,
        technologies: techFilters.length > 0 ? techFilters : undefined,
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

      setEnrichedRecords(records);
      setTotalFound(result.totalFound);
      setProgress(100);
      setStep('preview');
    } catch (err: any) {
      console.log(`[Markets] Search error: ${err.message}`);
      setError(err.message || 'Search failed');
      setStep('config');
      setProgress(0);
    }
  };

  const handleAddAsDemand = () => {
    const existing = getCsvData('demand') || [];
    const combined = [...existing, ...enrichedRecords];
    storeAsdemand(combined);
    setDemandCount(combined.length);
    setStep('config');
    setEnrichedRecords([]);
  };

  const handleAddAsSupply = () => {
    const existing = getCsvData('supply') || [];
    const combined = [...existing, ...enrichedRecords];
    storeAsSupply(combined);
    setSupplyCount(combined.length);
    setStep('config');
    setEnrichedRecords([]);
  };

  const handleNewSearch = () => {
    setStep('config');
    setEnrichedRecords([]);
    setProgress(0);
  };

  const hasFilters = selectedSignals.length > 0 || selectedIndustries.length > 0 ||
    jobListingFilter.trim().length > 0 || titleInclude.trim().length > 0 ||
    selectedEmployeeCount.length > 0 || selectedRevenue.length > 0 ||
    selectedFunding.length > 0 || keywordInclude.trim().length > 0 ||
    locationInput.trim().length > 0 || technologiesInput.trim().length > 0;

  // Active filter count for summary bar
  const activeFilterCount = [
    selectedSignals.length > 0,
    selectedIndustries.length > 0,
    jobListingFilter.trim().length > 0,
    titleInclude.trim().length > 0,
    selectedEmployeeCount.length > 0,
    selectedRevenue.length > 0,
    selectedFunding.length > 0,
    keywordInclude.trim().length > 0,
    locationInput.trim().length > 0,
    technologiesInput.trim().length > 0,
  ].filter(Boolean).length;

  // Build active filter summary tags
  const activeFilterTags: { label: string; onRemove?: () => void }[] = [];
  if (selectedSignals.length > 0) {
    const labels = selectedSignals.map(s => SIGNAL_LABEL_MAP[s] || s).slice(0, 3);
    const suffix = selectedSignals.length > 3 ? ` +${selectedSignals.length - 3}` : '';
    activeFilterTags.push({ label: labels.join(', ') + suffix, onRemove: () => setSelectedSignals([]) });
  }
  if (selectedIndustries.length > 0) {
    activeFilterTags.push({ label: `${selectedIndustries.length} industries`, onRemove: () => setSelectedIndustries([]) });
  }
  if (selectedEmployeeCount.length > 0) {
    const labels = selectedEmployeeCount.map(r => EMPLOYEE_COUNT_OPTIONS.find(o => o.min === r.min && o.max === r.max)?.label || '').filter(Boolean);
    activeFilterTags.push({ label: labels.join(', '), onRemove: () => setSelectedEmployeeCount([]) });
  }
  if (selectedRevenue.length > 0) {
    activeFilterTags.push({ label: selectedRevenue.join(', '), onRemove: () => setSelectedRevenue([]) });
  }
  if (jobListingFilter.trim()) {
    activeFilterTags.push({ label: `"${jobListingFilter.trim()}"`, onRemove: () => setJobListingFilter('') });
  }
  if (titleInclude.trim()) {
    activeFilterTags.push({ label: `Title: ${titleInclude.trim()}`, onRemove: () => setTitleInclude('') });
  }
  if (keywordInclude.trim()) {
    activeFilterTags.push({ label: `"${keywordInclude.trim()}"`, onRemove: () => setKeywordInclude('') });
  }
  if (selectedFunding.length > 0) {
    activeFilterTags.push({ label: `${selectedFunding.length} funding`, onRemove: () => setSelectedFunding([]) });
  }
  if (locationInput.trim()) {
    activeFilterTags.push({ label: locationInput.trim(), onRemove: () => setLocationInput('') });
  }
  if (technologiesInput.trim()) {
    activeFilterTags.push({ label: `Tech: ${technologiesInput.trim()}`, onRemove: () => setTechnologiesInput('') });
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-1.5 -ml-1.5 rounded-md text-white/30 hover:text-white/60 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <Radar className="w-5 h-5 text-white/40" />
              <h1 className="text-[15px] font-medium tracking-tight text-white/90">Markets</h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-5 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-white/30">Demand</span>
                <span className={`font-mono ${demandCount > 0 ? 'text-white/80' : 'text-white/20'}`}>{demandCount}</span>
                {demandCount > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem('csv_demand_data'); setDemandCount(0); }}
                    className="p-0.5 rounded text-white/15 hover:text-white/50 transition-colors"
                    title="Clear demand"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/30">Supply</span>
                <span className={`font-mono ${supplyCount > 0 ? 'text-white/80' : 'text-white/20'}`}>{supplyCount}</span>
                {supplyCount > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem('csv_supply_data'); setSupplyCount(0); }}
                    className="p-0.5 rounded text-white/15 hover:text-white/50 transition-colors"
                    title="Clear supply"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/20">Remaining</span>
                <span className="font-mono text-white/20">{dailyRemaining.toLocaleString()}</span>
              </div>
            </div>

            {(demandCount > 0 && supplyCount > 0) && (
              <button
                onClick={() => navigate('/flow')}
                className="h-8 px-3.5 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] text-[12px] text-white/60 hover:text-white/90 transition-all flex items-center gap-1.5"
              >
                Start Flow <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active Filter Summary Bar — sticky below header */}
      {step === 'config' && activeFilterCount > 0 && (
        <div className="sticky top-0 z-10 border-b border-white/[0.04] bg-[#09090b]/95 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-8 py-2.5 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {activeFilterTags.map((tag, i) => (
              <button
                key={i}
                onClick={tag.onRemove}
                className="shrink-0 h-6 px-2.5 rounded-md text-[11px] bg-white/[0.06] border border-white/[0.06] text-white/50 hover:text-white/80 hover:border-white/[0.15] transition-all flex items-center gap-1.5 group"
              >
                {tag.label}
                <X className="w-3 h-3 text-white/20 group-hover:text-white/50 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-5xl mx-auto px-8 py-10 pb-32">
        {step === 'config' && (
          <div className="space-y-8">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-500/[0.06] border border-red-500/[0.10] text-[13px] text-red-400/90">
                {error}
              </div>
            )}

            {/* Signals — grouped by category with icons */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-4 font-medium">Signals</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {SIGNAL_GROUPS.map(group => {
                  const Icon = group.icon;
                  const groupSignals = group.signals;
                  const selectedCount = groupSignals.filter(s => selectedSignals.includes(s)).length;
                  return (
                    <div key={group.category} className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Icon className="w-3.5 h-3.5 text-white/30" />
                        <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider">{group.category}</span>
                        {selectedCount > 0 && (
                          <span className="text-[10px] text-white/25 font-mono ml-auto">{selectedCount}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {groupSignals.map(sigValue => {
                          const sig = NEWS_SIGNALS.find(s => s.value === sigValue);
                          if (!sig) return null;
                          const selected = selectedSignals.includes(sig.value);
                          return (
                            <button
                              key={sig.value}
                              onClick={() => toggleChip(selectedSignals, sig.value, setSelectedSignals)}
                              className={chipClass(selected)}
                            >
                              {selected && <Check className="w-3 h-3" />}
                              {sig.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Job postings — token input */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">
                Job postings
                <span className="text-white/20 font-normal ml-2">case sensitive</span>
              </h2>
              <TokenInput
                value={jobListingFilter}
                onChange={setJobListingFilter}
                placeholder="Software Engineer, Account Executive..."
                autoCapitalize
              />
            </section>

            {/* Title — include + exclude with token inputs */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">
                Job title
                <span className="text-white/20 font-normal ml-2">leave empty for auto-rotation</span>
              </h2>
              <div className="flex gap-3">
                <div className="flex-1 max-w-[calc(50%-6px)]">
                  <div className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Include</div>
                  <TokenInput value={titleInclude} onChange={setTitleInclude} placeholder="CEO, VP Sales, Director..." />
                </div>
                <div className="flex-1 max-w-[calc(50%-6px)]">
                  <div className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Exclude</div>
                  <TokenInput value={titleExclude} onChange={setTitleExclude} placeholder="Intern, Assistant..." />
                </div>
              </div>
            </section>

            {/* Employee count — wider segmented cards */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">Company size</h2>
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_COUNT_OPTIONS.map(r => {
                  const selected = selectedEmployeeCount.some(s => s.min === r.min && s.max === r.max);
                  return (
                    <button key={`${r.min}-${r.max}`} onClick={() => toggleEmployeeRange(r.min, r.max)} className={cardClass(selected)}>
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Revenue — wider segmented cards */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">Revenue</h2>
              <div className="flex flex-wrap gap-2">
                {REVENUE_OPTIONS.map(r => (
                  <button key={r} onClick={() => toggleChip(selectedRevenue, r, setSelectedRevenue)} className={cardClass(selectedRevenue.includes(r))}>
                    {selectedRevenue.includes(r) && <Check className="w-3.5 h-3.5" />}
                    {r}
                  </button>
                ))}
              </div>
            </section>

            {/* Keywords — include + exclude with token inputs */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">Keywords</h2>
              <div className="flex gap-3">
                <div className="flex-1 max-w-[calc(50%-6px)]">
                  <div className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Include</div>
                  <TokenInput value={keywordInclude} onChange={setKeywordInclude} placeholder="SaaS, machine learning..." />
                </div>
                <div className="flex-1 max-w-[calc(50%-6px)]">
                  <div className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Exclude</div>
                  <TokenInput value={keywordExclude} onChange={setKeywordExclude} placeholder="executive, intern..." />
                </div>
              </div>
            </section>

            {/* Technologies — token input */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">Technologies</h2>
              <TokenInput value={technologiesInput} onChange={setTechnologiesInput} placeholder="Salesforce, HubSpot, AWS..." />
            </section>

            {/* Location — token input */}
            <section>
              <h2 className="text-[13px] text-white/50 mb-3 font-medium">Location</h2>
              <TokenInput value={locationInput} onChange={setLocationInput} placeholder="United States, United Kingdom..." />
            </section>

            {/* Industry — collapsible */}
            <section>
              <button
                onClick={() => setShowIndustries(!showIndustries)}
                className="flex items-center gap-2 text-[13px] text-white/50 font-medium hover:text-white/70 transition-colors mb-3"
              >
                {showIndustries ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Industry
                {selectedIndustries.length > 0 && (
                  <span className="ml-1 text-[11px] text-white/40 font-mono">{selectedIndustries.length} included</span>
                )}
                {excludeIndustries.length > 0 && (
                  <span className="text-[11px] text-red-400/60 font-mono">{excludeIndustries.length} excluded</span>
                )}
              </button>

              {/* Selected tags — always visible */}
              {(selectedIndustries.length > 0 || excludeIndustries.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedIndustries.map(ind => (
                    <button key={`inc-${ind}`} onClick={() => toggleChip(selectedIndustries, ind, setSelectedIndustries)}
                      className="h-6 px-2.5 rounded text-[11px] bg-white text-[#09090b] font-medium transition-all duration-150 hover:bg-white/80 flex items-center gap-1">
                      {ind} <X className="w-3 h-3" />
                    </button>
                  ))}
                  {excludeIndustries.map(ind => (
                    <button key={`exc-${ind}`} onClick={() => toggleChip(excludeIndustries, ind, setExcludeIndustries)}
                      className="h-6 px-2.5 rounded text-[11px] bg-red-500/20 text-red-400 font-medium transition-all duration-150 hover:bg-red-500/30 flex items-center gap-1">
                      {ind} <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {showIndustries && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 mb-2">
                    <input type="text" value={industrySearch} onChange={(e) => setIndustrySearch(e.target.value)}
                      placeholder="Search industries..." autoFocus
                      className="w-full max-w-sm h-8 px-3 text-[12px] bg-white/[0.03] border border-white/[0.06] rounded-md text-white/90 focus:outline-none focus:border-white/[0.15] transition-colors placeholder:text-white/20" />
                    <span className="text-[10px] text-white/20 whitespace-nowrap">Click = include · Shift+click = exclude</span>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto rounded-md border border-white/[0.04] bg-white/[0.01]"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
                    {INDUSTRY_GROUPS
                      .map(group => {
                        const q = industrySearch.toLowerCase();
                        const matchingSubs = q
                          ? group.subs.filter(s => s.toLowerCase().includes(q) || group.category.toLowerCase().includes(q))
                          : group.subs;
                        if (matchingSubs.length === 0) return null;
                        return (
                          <div key={group.category} className="px-3 py-2.5 border-b border-white/[0.03] last:border-0">
                            <div className="text-[10px] text-white/25 font-medium uppercase tracking-wider mb-1.5">{group.category}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {matchingSubs.map(sub => {
                                const isIncluded = selectedIndustries.includes(sub);
                                const isExcluded = excludeIndustries.includes(sub);
                                return (
                                  <button
                                    key={sub}
                                    onClick={(e) => {
                                      if (e.shiftKey) {
                                        // Shift+click = exclude
                                        if (isIncluded) toggleChip(selectedIndustries, sub, setSelectedIndustries);
                                        toggleChip(excludeIndustries, sub, setExcludeIndustries);
                                      } else {
                                        // Click = include
                                        if (isExcluded) toggleChip(excludeIndustries, sub, setExcludeIndustries);
                                        toggleChip(selectedIndustries, sub, setSelectedIndustries);
                                      }
                                    }}
                                    className={`h-6 px-2 rounded text-[11px] border transition-all duration-150 active:scale-[0.97] ${
                                      isIncluded ? 'bg-white text-[#09090b] border-white font-medium'
                                      : isExcluded ? 'bg-red-500/20 text-red-400 border-red-500/30 font-medium'
                                      : 'bg-white/[0.03] text-white/40 border-white/[0.04] hover:border-white/[0.15] hover:text-white/60'
                                    }`}
                                  >
                                    {sub}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                      .filter(Boolean)}
                  </div>
                </div>
              )}
            </section>

            {/* Funding — collapsible (23 options) */}
            <section>
              <button
                onClick={() => setShowFunding(!showFunding)}
                className="flex items-center gap-2 text-[13px] text-white/50 font-medium hover:text-white/70 transition-colors mb-3"
              >
                {showFunding ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Funding stage
                {selectedFunding.length > 0 && (
                  <span className="ml-1 text-[11px] text-white/40 font-mono">{selectedFunding.length} selected</span>
                )}
              </button>

              {selectedFunding.length > 0 && !showFunding && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedFunding.map(f => {
                    const opt = FUNDING_TYPE_OPTIONS.find(o => o.value === f);
                    return (
                      <button key={f} onClick={() => toggleChip(selectedFunding, f, setSelectedFunding)}
                        className="h-6 px-2.5 rounded text-[11px] bg-white text-[#09090b] font-medium transition-all duration-150 hover:bg-white/80 flex items-center gap-1">
                        {opt?.label || f} <X className="w-3 h-3" />
                      </button>
                    );
                  })}
                </div>
              )}

              {showFunding && (
                <div className="flex flex-wrap gap-1.5">
                  {FUNDING_TYPE_OPTIONS.map(f => {
                    const selected = selectedFunding.includes(f.value);
                    return (
                      <button key={f.value} onClick={() => toggleChip(selectedFunding, f.value, setSelectedFunding)} className={chipClass(selected)}>
                        {selected && <Check className="w-3 h-3" />}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {step === 'searching' && (
          <div className="py-24 max-w-sm mx-auto">
            <div className="mb-8">
              <div className="h-[3px] w-full bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full bg-white/30 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
              <p className="text-[13px] text-white/50">{progressStage}</p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-white/80 font-medium">{enrichedRecords.length} leads</span>
                <span className="text-white/15">/</span>
                <span className="text-white/30">{totalFound.toLocaleString()} matching</span>
              </div>
              <button onClick={handleNewSearch}
                className="h-8 px-3.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[12px] text-white/40 hover:text-white/70 transition-all">
                New search
              </button>
            </div>

            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="text-left px-4 py-2.5 text-white/30 font-medium w-[180px]">Name</th>
                    <th className="text-left px-4 py-2.5 text-white/30 font-medium">Title</th>
                    <th className="text-left px-4 py-2.5 text-white/30 font-medium w-[160px]">Company</th>
                    <th className="text-left px-4 py-2.5 text-white/30 font-medium w-[140px]">Signal</th>
                    <th className="text-left px-4 py-2.5 text-white/30 font-medium w-[120px]">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedRecords.slice(0, 20).map((r, i) => (
                    <tr key={r.recordKey} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors"
                      style={{ animation: `rowFadeIn 0.3s ease ${i * 0.02}s both` }}>
                      <td className="px-4 py-2.5 text-white/80">{r.fullName || '\u2014'}</td>
                      <td className="px-4 py-2.5 text-white/40 truncate max-w-[240px]">{r.title || '\u2014'}</td>
                      <td className="px-4 py-2.5 text-white/50">{r.company || '\u2014'}</td>
                      <td className="px-4 py-2.5 text-white/25 truncate max-w-[140px]">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSignalDotColor(r.signal || '')}`} />
                          {r.signal || '\u2014'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white/20 truncate max-w-[120px]">{r.city || r.state || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {enrichedRecords.length > 20 && (
                <div className="px-4 py-2.5 text-[11px] text-white/20 text-center border-t border-white/[0.03]">
                  +{enrichedRecords.length - 20} more
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={handleAddAsDemand}
                className="h-9 px-4 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[13px] text-white/70 hover:text-white transition-all font-medium">
                + Demand ({enrichedRecords.length})
              </button>
              <button onClick={handleAddAsSupply}
                className="h-9 px-4 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[13px] text-white/70 hover:text-white transition-all font-medium">
                + Supply ({enrichedRecords.length})
              </button>
              {(demandCount > 0 && supplyCount > 0) && (
                <button onClick={() => navigate('/flow')}
                  className="h-9 px-4 rounded-md bg-white text-[#09090b] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all flex items-center gap-2">
                  Start Flow <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Sticky bottom bar — search button (config step only) */}
      {step === 'config' && (
        <div className="fixed bottom-16 left-0 right-0 z-20 border-t border-white/[0.06] bg-[#09090b]/95 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-8 py-3 flex items-center justify-between">
            <span className="text-[12px] text-white/30">
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active` : 'No filters selected'}
            </span>
            <button onClick={handleSearch} disabled={!hasFilters}
              className="h-9 px-5 rounded-md bg-white text-[#09090b] text-[13px] font-medium hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              Search
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rowFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Dock />
    </div>
  );
}
