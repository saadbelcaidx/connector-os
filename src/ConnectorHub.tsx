/**
 * CONNECTOR HUB — Premium Lead Database
 *
 * Apple × Vercel × Linear design:
 * - Centered search-first layout
 * - Inline multi-select chips for titles AND industries
 * - Table view results (not cards)
 * - Floating selection bar
 * - Minimalist collection badges
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Check, Loader2, Zap, ArrowRight, X, ChevronDown, ArrowLeft, Building2, MapPin, Mail, Phone, Plus, Trash2, Linkedin } from 'lucide-react';
import { supabase } from './lib/supabase';

// =============================================================================
// CHESS KING ICON
// =============================================================================
function KingIcon({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="10.5" y1="3.5" x2="13.5" y2="3.5" />
      <path d="M7 8C7 6.5 9 5 12 5C15 5 17 6.5 17 8C17 9 16.5 9.5 16 10H8C7.5 9.5 7 9 7 8Z" />
      <path d="M8 10V14C8 14 8.5 15 12 15C15.5 15 16 14 16 14V10" />
      <path d="M6 18C6 16.5 8 15 12 15C16 15 18 16.5 18 18V19C18 19.5 17.5 20 17 20H7C6.5 20 6 19.5 6 19V18Z" />
      <path d="M5 20H19V21C19 21.5 18.5 22 18 22H6C5.5 22 5 21.5 5 21V20Z" />
    </svg>
  );
}

// =============================================================================
// TYPES
// =============================================================================

interface Contact {
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  industry: string;
  industry_detail: string;
  source?: 'hub' | 'google_maps';
}

type DataSource = 'hub' | 'google_maps';

const DATA_SOURCES: { value: DataSource; label: string; count: string }[] = [
  { value: 'hub', label: 'Connector Hub', count: '9.43M' },
  { value: 'google_maps', label: 'Google Maps', count: '39K' },
];

type SelectionMode = 'demand' | 'supply';

// =============================================================================
// PERSISTENT STORAGE
// =============================================================================

const DEMAND_KEY = 'connector_hub_demand';
const SUPPLY_KEY = 'connector_hub_supply';

function loadCollection(key: string): Contact[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveCollection(key: string, contacts: Contact[]): void {
  localStorage.setItem(key, JSON.stringify(contacts));
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TITLE_CHIPS = [
  // C-Suite
  'CEO', 'CFO', 'CTO', 'COO', 'CMO', 'CRO', 'CPO', 'CHRO',
  // Founders
  'Founder', 'Co-Founder', 'Owner', 'Partner', 'Principal',
  // VP Level
  'VP Sales', 'VP Marketing', 'VP Engineering', 'VP Operations', 'VP Product', 'VP Finance', 'VP HR', 'VP Business Development',
  // Directors
  'Director', 'Senior Director', 'Managing Director', 'Executive Director', 'Director of Sales', 'Director of Marketing', 'Director of Engineering',
  // Heads
  'Head of Sales', 'Head of Marketing', 'Head of Engineering', 'Head of Product', 'Head of Growth', 'Head of People', 'Head of Talent',
  // Other Senior
  'General Manager', 'President', 'Chairman', 'Board Member',
];

const INDUSTRY_CHIPS = [
  'Software & Internet',
  'Business Services',
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Real Estate',
  'Retail',
  'Construction',
];

const COMPANY_SIZE_CHIPS = [
  { label: '1-50', value: '1-50' },
  { label: '51-200', value: '51-200' },
  { label: '201-1000', value: '201-1000' },
  { label: '1000+', value: '1000+' },
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// =============================================================================
// CHIP COMPONENT
// =============================================================================

function Chip({
  label,
  selected,
  onClick
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-150 border
        ${selected
          ? 'bg-white text-black border-white'
          : 'bg-transparent text-white/60 border-white/[0.12] hover:border-white/30 hover:text-white/80'
        }
      `}
    >
      {selected && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

// =============================================================================
// LINKEDIN URL GENERATOR
// =============================================================================

function generateLinkedInSearchUrl(firstName: string, lastName: string): string {
  // Just use name - company names rarely match LinkedIn profiles exactly
  const parts = [firstName, lastName].filter(Boolean).map(s => s.trim());
  const keywords = parts.join(' ');
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ConnectorHub() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  // Collections
  const [demandContacts, setDemandContacts] = useState<Contact[]>(() => loadCollection(DEMAND_KEY));
  const [supplyContacts, setSupplyContacts] = useState<Contact[]>(() => loadCollection(SUPPLY_KEY));

  // Data source (hard isolation - no cross-source mixing)
  const [dataSource, setDataSource] = useState<DataSource>('hub');

  // Filters
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>(''); // empty = no filter (current behavior)
  const [keyword, setKeyword] = useState(''); // sub-niche / keywords filter
  const [customTitle, setCustomTitle] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [hasEmail, setHasEmail] = useState(true);
  const [showMoreTitles, setShowMoreTitles] = useState(false);
  const [showMoreIndustries, setShowMoreIndustries] = useState(false);

  // Results
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Persist collections
  useEffect(() => { saveCollection(DEMAND_KEY, demandContacts); }, [demandContacts]);
  useEffect(() => { saveCollection(SUPPLY_KEY, supplyContacts); }, [supplyContacts]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Toggle functions
  const toggleTitle = (title: string) => {
    setSelectedTitles(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  const toggleIndustry = (industry: string) => {
    setSelectedIndustries(prev =>
      prev.includes(industry) ? prev.filter(i => i !== industry) : [...prev, industry]
    );
  };

  const addCustomTitle = () => {
    if (customTitle.trim() && !selectedTitles.includes(customTitle.trim())) {
      setSelectedTitles(prev => [...prev, customTitle.trim()]);
      setCustomTitle('');
    }
  };

  // Search
  const handleSearch = async (append = false) => {
    if (!append) {
      setCurrentOffset(0);
      setSelectedEmails(new Set());
    }

    const offset = append ? currentOffset : 0;
    setIsSearching(true);
    setHasSearched(true);

    try {
      console.log(`[Hub] Searching source: ${dataSource}`);
      const { data, error } = await supabase.functions.invoke('bigquery-search', {
        body: {
          filters: {
            title: selectedTitles.join(', '),
            state,
            city,
            industry: selectedIndustries.join(', '),
            hasEmail,
            companySize: selectedSize || undefined, // only send if selected
            keyword: keyword.trim() || undefined, // sub-niche filter
          },
          limit: 100,
          offset,
          source: dataSource, // Hard source isolation
        },
      });

      if (error) throw error;

      const newContacts = data.contacts || [];
      setContacts(append ? [...contacts, ...newContacts] : newContacts);
      setCurrentOffset(offset + newContacts.length);
      setHasMore(newContacts.length === 100);
    } catch (err) {
      console.error('Search error:', err);
      showToast('Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // Selection
  const toggleContact = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const selectAll = () => setSelectedEmails(new Set(contacts.map(c => c.email).filter(Boolean)));
  const clearSelection = () => setSelectedEmails(new Set());

  // Add to collection
  const addToCollection = (mode: SelectionMode) => {
    const selected = contacts.filter(c => selectedEmails.has(c.email));
    if (selected.length === 0) return;

    const setFn = mode === 'demand' ? setDemandContacts : setSupplyContacts;
    setFn(prev => {
      const existingEmails = new Set(prev.map(c => c.email));
      const newContacts = selected.filter(c => c.email && !existingEmails.has(c.email));
      const updated = [...prev, ...newContacts];
      showToast(`Added ${newContacts.length} to ${mode === 'demand' ? 'Demand' : 'Supply'}`);
      return updated;
    });
    setSelectedEmails(new Set());
  };

  // Clear collection
  const clearCollection = (mode: SelectionMode) => {
    if (mode === 'demand') setDemandContacts([]);
    else setSupplyContacts([]);
  };

  // Start Flow
  const canStartFlow = demandContacts.length > 0 && supplyContacts.length > 0;

  const startFlow = () => {
    if (!canStartFlow) return;
    // Collections already persisted via useEffect, just navigate
    navigate('/flow?source=hub');
  };

  const activeFilters = selectedTitles.length + selectedIndustries.length + (selectedSize ? 1 : 0) + (keyword.trim() ? 1 : 0) + (city ? 1 : 0) + (state ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#000] text-white">
      {/* Toast */}
      {toast && (
        <div className={`
          fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-full
          text-sm font-medium backdrop-blur-xl border
          animate-in fade-in slide-in-from-top-2 duration-200
          ${toast.type === 'success'
            ? 'bg-white/10 border-white/20 text-white'
            : 'bg-red-500/20 border-red-500/30 text-red-300'}
        `}>
          {toast.message}
        </div>
      )}

      {/* Fixed Header */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-2 -ml-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <ArrowLeft size={16} className="text-white/50" />
            </button>
            <div className="flex items-center gap-2.5">
              <KingIcon size={18} className="text-white/70" />
              <span className="font-medium text-sm">Connector Hub</span>
              {/* Source Toggle */}
              <div className="flex items-center gap-1 ml-2">
                {DATA_SOURCES.map((src) => (
                  <button
                    key={src.value}
                    onClick={() => {
                      if (dataSource !== src.value) {
                        setDataSource(src.value);
                        setContacts([]); // Clear results on source switch
                        setHasSearched(false);
                        setSelectedEmails(new Set());
                      }
                    }}
                    className={`
                      px-2.5 py-1 rounded-md text-xs transition-all
                      ${dataSource === src.value
                        ? 'bg-white/[0.1] text-white'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'}
                    `}
                  >
                    {src.label}
                    <span className="ml-1 text-white/30">{src.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Collection badges + Selection actions */}
          <div className="flex items-center gap-2">
            {/* Selection actions - appear when items selected */}
            {selectedEmails.size > 0 ? (
              <>
                <span className="text-xs text-white/50 mr-1">{selectedEmails.size} selected</span>
                <button
                  onClick={() => addToCollection('demand')}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300
                    border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                >
                  + Demand
                </button>
                <button
                  onClick={() => addToCollection('supply')}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300
                    border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                >
                  + Supply
                </button>
                <button
                  onClick={clearSelection}
                  className="p-1.5 rounded-full text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={14} />
                </button>
                <div className="w-px h-4 bg-white/[0.1] mx-1" />
              </>
            ) : null}

            {/* Collection counts */}
            <div className={`
              px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2
              ${demandContacts.length > 0
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'}
            `}>
              <span>{demandContacts.length}</span>
              <span className="opacity-60">Demand</span>
              {demandContacts.length > 0 && (
                <button onClick={() => clearCollection('demand')} className="hover:text-red-300 transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className={`
              px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2
              ${supplyContacts.length > 0
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'}
            `}>
              <span>{supplyContacts.length}</span>
              <span className="opacity-60">Supply</span>
              {supplyContacts.length > 0 && (
                <button onClick={() => clearCollection('supply')} className="hover:text-red-300 transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              onClick={startFlow}
              disabled={!canStartFlow}
              className={`
                ml-2 px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all
                ${canStartFlow
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/[0.06] text-white/30 cursor-not-allowed'}
              `}
            >
              <Zap size={12} />
              Start Flow
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14">
        {/* Search Hero Section */}
        <div className="border-b border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Compact Search Input */}
            <div className="relative mb-6">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                ref={searchRef}
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (customTitle.trim()) addCustomTitle();
                    else handleSearch();
                  }
                }}
                placeholder="Search by title..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08]
                  text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20
                  focus:bg-white/[0.06] transition-all"
              />
              {customTitle && (
                <button
                  onClick={addCustomTitle}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md
                    bg-white/[0.08] text-[11px] text-white/60 hover:bg-white/[0.12] transition-colors"
                >
                  <Plus size={12} className="inline mr-0.5" />
                  Add
                </button>
              )}
            </div>

            {/* Title Chips */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 uppercase tracking-wider">Decision Makers</span>
                {selectedTitles.length > 0 && (
                  <button
                    onClick={() => setSelectedTitles([])}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    Clear ({selectedTitles.length})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(showMoreTitles ? TITLE_CHIPS : TITLE_CHIPS.slice(0, 10)).map(title => (
                  <Chip
                    key={title}
                    label={title}
                    selected={selectedTitles.includes(title)}
                    onClick={() => toggleTitle(title)}
                  />
                ))}
                {/* Custom titles */}
                {selectedTitles.filter(t => !TITLE_CHIPS.includes(t)).map(title => (
                  <Chip
                    key={title}
                    label={title}
                    selected={true}
                    onClick={() => toggleTitle(title)}
                  />
                ))}
                {!showMoreTitles && TITLE_CHIPS.length > 10 && (
                  <button
                    onClick={() => setShowMoreTitles(true)}
                    className="px-3 py-1.5 rounded-full text-xs text-white/40 hover:text-white/60
                      border border-dashed border-white/[0.12] hover:border-white/20 transition-colors"
                  >
                    +{TITLE_CHIPS.length - 10} more
                  </button>
                )}
              </div>
            </div>

            {/* Industry Chips */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 uppercase tracking-wider">Industries</span>
                {selectedIndustries.length > 0 && (
                  <button
                    onClick={() => setSelectedIndustries([])}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    Clear ({selectedIndustries.length})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(showMoreIndustries ? INDUSTRY_CHIPS : INDUSTRY_CHIPS.slice(0, 6)).map(industry => (
                  <Chip
                    key={industry}
                    label={industry}
                    selected={selectedIndustries.includes(industry)}
                    onClick={() => toggleIndustry(industry)}
                  />
                ))}
                {!showMoreIndustries && INDUSTRY_CHIPS.length > 6 && (
                  <button
                    onClick={() => setShowMoreIndustries(true)}
                    className="px-3 py-1.5 rounded-full text-xs text-white/40 hover:text-white/60
                      border border-dashed border-white/[0.12] hover:border-white/20 transition-colors"
                  >
                    +{INDUSTRY_CHIPS.length - 6} more
                  </button>
                )}
              </div>
            </div>

            {/* Company Size Chips (single-select) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 uppercase tracking-wider">Company Size</span>
                {selectedSize && (
                  <button
                    onClick={() => setSelectedSize('')}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZE_CHIPS.map(size => (
                  <Chip
                    key={size.value}
                    label={size.label}
                    selected={selectedSize === size.value}
                    onClick={() => setSelectedSize(selectedSize === size.value ? '' : size.value)}
                  />
                ))}
              </div>
            </div>

            {/* Keyword / Sub-niche Filter */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 uppercase tracking-wider">Sub-niche</span>
                {keyword && (
                  <button
                    onClick={() => setKeyword('')}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. pharma, fintech, AI, cannabis..."
                className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08]
                  text-xs placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all"
              />
            </div>

            {/* Location Row */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08]
                    text-xs placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all"
                />
              </div>
              <div className="w-24">
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08]
                    text-xs text-white/60 focus:outline-none focus:border-white/20 transition-all
                    appearance-none cursor-pointer"
                >
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/[0.04]
                border border-white/[0.08] cursor-pointer hover:border-white/15 transition-colors">
                <div className={`
                  w-3.5 h-3.5 rounded border flex items-center justify-center transition-all
                  ${hasEmail ? 'bg-white border-white' : 'border-white/30'}
                `}>
                  {hasEmail && <Check size={8} className="text-black" />}
                </div>
                <span className="text-xs text-white/60">Email only</span>
                <input
                  type="checkbox"
                  checked={hasEmail}
                  onChange={(e) => setHasEmail(e.target.checked)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Search Button */}
            <button
              onClick={() => handleSearch()}
              disabled={isSearching}
              className="w-full h-10 rounded-xl bg-white text-black font-medium text-xs
                hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed
                transition-all flex items-center justify-center gap-2"
            >
              {isSearching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              {isSearching ? 'Searching...' : `Search ${activeFilters > 0 ? `(${activeFilters} filters)` : ''}`}
            </button>
          </div>
        </div>

        {/* Results Section */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          {!hasSearched ? (
            <div className="text-center py-20">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08]
                flex items-center justify-center mx-auto mb-6">
                <KingIcon size={24} className="text-white/40" />
              </div>
              <h2 className="text-xl font-medium mb-2">Search to begin</h2>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                Select titles and industries above, then search. Add results to Demand or Supply, then start Flow.
              </p>
            </div>
          ) : isSearching && contacts.length === 0 ? (
            <div className="text-center py-20">
              <Loader2 size={24} className="animate-spin text-white/40 mx-auto mb-4" />
              <p className="text-white/40 text-sm">
                Searching {DATA_SOURCES.find(s => s.value === dataSource)?.count || ''} contacts...
              </p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-white/40 text-sm">No contacts found. Try different filters.</p>
            </div>
          ) : (
            <>
              {/* Results Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/50">{contacts.length} results</span>
                  {hasMore && <span className="text-xs text-white/30">(more available)</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={selectAll} className="text-white/40 hover:text-white/60 transition-colors">
                    Select all
                  </button>
                  <span className="text-white/20">·</span>
                  <button onClick={clearSelection} className="text-white/40 hover:text-white/60 transition-colors">
                    Clear
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="w-10 px-4 py-3">
                        <div className="w-4 h-4" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Company</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Contact</th>
                      <th className="w-12 px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {contacts.map((contact, i) => {
                      const isSelected = selectedEmails.has(contact.email);
                      return (
                        <tr
                          key={contact.email || i}
                          onClick={() => contact.email && toggleContact(contact.email)}
                          className={`
                            cursor-pointer transition-colors
                            ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}
                          `}
                          style={{
                            animation: `rowFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.015}s both`
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className={`
                              w-4 h-4 rounded border flex items-center justify-center transition-all
                              ${isSelected ? 'bg-white border-white' : 'border-white/20'}
                            `}>
                              {isSelected && <Check size={10} className="text-black" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-sm">{contact.first_name} {contact.last_name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-white/70">{contact.title}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={12} className="text-white/30" />
                              <span className="text-sm text-white/60">{contact.company}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {contact.city && (
                              <div className="flex items-center gap-1.5">
                                <MapPin size={12} className="text-white/30" />
                                <span className="text-sm text-white/50">{contact.city}{contact.state && `, ${contact.state}`}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {contact.email && (
                                <div
                                  className="flex items-center gap-1.5 group/email"
                                  style={{
                                    animation: `emailReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.02}s both`
                                  }}
                                >
                                  <Mail size={12} className="text-violet-400/40 group-hover/email:text-violet-400/70 transition-colors" />
                                  <span className="text-xs text-white/50 group-hover/email:text-white/70 transition-colors font-mono tracking-tight">{contact.email}</span>
                                </div>
                              )}
                              {contact.phone && (
                                <div className="flex items-center gap-1.5">
                                  <Phone size={12} className="text-white/20" />
                                  <span className="text-xs text-white/30 font-mono">{contact.phone}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={generateLinkedInSearchUrl(contact.first_name, contact.last_name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors inline-flex"
                              title="Search on LinkedIn"
                            >
                              <Linkedin size={14} className="text-white/30 hover:text-[#0A66C2] transition-colors" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => handleSearch(true)}
                    disabled={isSearching}
                    className="px-6 py-2.5 rounded-xl text-sm text-white/60
                      border border-white/[0.08] hover:border-white/20 hover:text-white/80
                      disabled:opacity-50 transition-all inline-flex items-center gap-2"
                  >
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Custom styles + animations */}
      <style>{`
        select option {
          background: #1a1a1a;
          color: white;
        }

        @keyframes emailReveal {
          0% {
            opacity: 0;
            transform: translateX(-8px);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
            filter: blur(0);
          }
        }

        @keyframes rowFadeIn {
          0% {
            opacity: 0;
            transform: translateY(4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
