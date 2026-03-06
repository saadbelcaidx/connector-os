import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';

interface ClientInputs {
  numberOfClients: number;
  monthlyRetainer: number;
  commission: number;
  averageDeal: number;
  dealsPerYear: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumberWithCommas(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function Tooltip({ text }: { text: string }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="text-white/30 hover:text-white/50 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {isVisible && (
        <div
          className="absolute left-0 top-5 z-50 w-56 rounded p-2.5 font-mono text-[10px] text-white/50"
          style={{
            background: 'rgba(20, 20, 20, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  isDollar = false,
  tooltip
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  isDollar?: boolean;
  tooltip?: string;
}) {
  const [displayValue, setDisplayValue] = useState(isDollar ? formatNumberWithCommas(value) : value.toString());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/,/g, '');
    const numericValue = Number(rawValue);

    if (!isNaN(numericValue)) {
      onChange(numericValue);
      setDisplayValue(isDollar ? formatNumberWithCommas(numericValue) : rawValue);
    }
  };

  const handleBlur = () => {
    if (isDollar) {
      setDisplayValue(formatNumberWithCommas(value));
    }
  };

  return (
    <div className="mb-4">
      <label className="flex items-center font-mono text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="relative">
        {isDollar && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 font-mono text-[11px]">$</span>
        )}
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          className={`w-full h-[36px] px-3 rounded bg-white/[0.02] border border-white/[0.06] font-mono text-[11px] text-white/80 focus:border-white/[0.15] focus:outline-none transition-colors placeholder:text-white/20 ${isDollar ? 'pl-8' : ''}`}
        />
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded border border-white/[0.06] bg-white/[0.02] p-4 mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-4"
      >
        <h3 className="font-mono text-[11px] font-medium text-white/50 uppercase tracking-wider">{title}</h3>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isOpen ? '1000px' : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="font-mono text-[11px] text-white/40">{label}</span>
      <span className={`font-mono text-[12px] font-medium ${highlight ? 'text-emerald-400' : 'text-white/70'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function Calculator() {
  const navigate = useNavigate();

  const [stability, setStability] = useState<ClientInputs>({
    numberOfClients: 2,
    monthlyRetainer: 18000,
    commission: 0.10,
    averageDeal: 500000,
    dealsPerYear: 2,
  });

  const [upside, setUpside] = useState<ClientInputs>({
    numberOfClients: 2,
    monthlyRetainer: 10000,
    commission: 0.18,
    averageDeal: 1000000,
    dealsPerYear: 2,
  });

  const [compounding, setCompounding] = useState<ClientInputs>({
    numberOfClients: 2,
    monthlyRetainer: 0,
    commission: 0.25,
    averageDeal: 500000,
    dealsPerYear: 2,
  });

  const calculateIncome = (inputs: ClientInputs) => {
    const annualRetainer = inputs.numberOfClients * inputs.monthlyRetainer * 12;
    const annualCommission = inputs.numberOfClients * inputs.commission * inputs.averageDeal * inputs.dealsPerYear;
    return {
      annualRetainer,
      annualCommission,
      total: annualRetainer + annualCommission,
    };
  };

  const stabilityIncome = calculateIncome(stability);
  const upsideIncome = calculateIncome(upside);
  const compoundingIncome = calculateIncome(compounding);

  const totalAnnualIncome = stabilityIncome.total + upsideIncome.total + compoundingIncome.total;
  const totalClients = stability.numberOfClients + upside.numberOfClients + compounding.numberOfClients;
  const averagePerClient = totalClients > 0 ? totalAnnualIncome / totalClients : 0;
  const monthlyAverage = totalAnnualIncome / 12;

  return (
    <div className="min-h-screen bg-[#09090b] text-white" style={{ animation: 'pageIn 0.25s ease-out' }}>
      {/* Header */}
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <nav className="flex items-center gap-1.5 font-mono text-[10px] text-white/30 mb-4">
          <button onClick={() => navigate('/launcher')} className="hover:text-white/50 transition-colors">
            Home
          </button>
          <span className="text-white/15">{'>'}</span>
          <span className="text-white/50">Revenue Calculator</span>
        </nav>

        <div className="mb-6">
          <h1 className="font-mono text-[15px] text-white/90 font-medium">Revenue Calculator</h1>
          <p className="font-mono text-[11px] text-white/30 mt-0.5">Model your earnings per month</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 pb-32">
          <div className="grid lg:grid-cols-2 gap-10">
            {/* Inputs */}
            <div>
              <h2 className="font-mono text-[9px] font-medium text-white/25 uppercase tracking-widest mb-5">Your Inputs</h2>

              <CollapsibleSection title="Stability Clients">
                <InputField
                  label="Number of Clients"
                  value={stability.numberOfClients}
                  onChange={(val) => setStability({ ...stability, numberOfClients: val })}
                />
                <InputField
                  label="Monthly Retainer"
                  value={stability.monthlyRetainer}
                  onChange={(val) => setStability({ ...stability, monthlyRetainer: val })}
                  isDollar={true}
                  tooltip="Your baseline. This is what keeps the lights on."
                />
                <InputField
                  label="Commission Rate (e.g., 0.10 = 10%)"
                  value={stability.commission}
                  onChange={(val) => setStability({ ...stability, commission: val })}
                  tooltip="Your upside on each deal."
                />
                <InputField
                  label="Average Deal Size"
                  value={stability.averageDeal}
                  onChange={(val) => setStability({ ...stability, averageDeal: val })}
                  isDollar={true}
                />
                <InputField
                  label="Deals Per Year"
                  value={stability.dealsPerYear}
                  onChange={(val) => setStability({ ...stability, dealsPerYear: val })}
                  tooltip="More deals = compounding effect."
                />
              </CollapsibleSection>

              <CollapsibleSection title="Upside Clients">
                <InputField
                  label="Number of Clients"
                  value={upside.numberOfClients}
                  onChange={(val) => setUpside({ ...upside, numberOfClients: val })}
                />
                <InputField
                  label="Monthly Retainer"
                  value={upside.monthlyRetainer}
                  onChange={(val) => setUpside({ ...upside, monthlyRetainer: val })}
                  isDollar={true}
                />
                <InputField
                  label="Commission Rate (e.g., 0.18 = 18%)"
                  value={upside.commission}
                  onChange={(val) => setUpside({ ...upside, commission: val })}
                />
                <InputField
                  label="Average Deal Size"
                  value={upside.averageDeal}
                  onChange={(val) => setUpside({ ...upside, averageDeal: val })}
                  isDollar={true}
                />
                <InputField
                  label="Deals Per Year"
                  value={upside.dealsPerYear}
                  onChange={(val) => setUpside({ ...upside, dealsPerYear: val })}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Compounding Clients">
                <InputField
                  label="Number of Clients"
                  value={compounding.numberOfClients}
                  onChange={(val) => setCompounding({ ...compounding, numberOfClients: val })}
                />
                <InputField
                  label="Monthly Retainer"
                  value={compounding.monthlyRetainer}
                  onChange={(val) => setCompounding({ ...compounding, monthlyRetainer: val })}
                  isDollar={true}
                />
                <InputField
                  label="Commission Rate (e.g., 0.25 = 25%)"
                  value={compounding.commission}
                  onChange={(val) => setCompounding({ ...compounding, commission: val })}
                />
                <InputField
                  label="Average Deal Size"
                  value={compounding.averageDeal}
                  onChange={(val) => setCompounding({ ...compounding, averageDeal: val })}
                  isDollar={true}
                />
                <InputField
                  label="Deals Per Year"
                  value={compounding.dealsPerYear}
                  onChange={(val) => setCompounding({ ...compounding, dealsPerYear: val })}
                />
              </CollapsibleSection>
            </div>

            {/* Results */}
            <div>
              <h2 className="font-mono text-[9px] font-medium text-white/25 uppercase tracking-widest mb-5">Results</h2>

              <div className="rounded border border-white/[0.06] bg-white/[0.02] p-6">
                {/* Total */}
                <div className="mb-6 pb-6 border-b border-white/[0.06]">
                  <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-2">Total Annual Income</div>
                  <div className="font-mono text-[32px] font-medium text-emerald-400 tracking-tight">
                    {formatCurrency(totalAnnualIncome)}
                  </div>
                  <div className="font-mono text-[11px] text-white/30 mt-1">
                    {formatCurrency(monthlyAverage)}/mo average
                  </div>
                </div>

                {/* Breakdown */}
                <div className="space-y-5">
                  <div>
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-2">Stability</div>
                    <ResultRow label="Retainer" value={stabilityIncome.annualRetainer} />
                    <ResultRow label="Commission" value={stabilityIncome.annualCommission} />
                    <ResultRow label="Total" value={stabilityIncome.total} highlight />
                  </div>

                  <div>
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-2">Upside</div>
                    <ResultRow label="Retainer" value={upsideIncome.annualRetainer} />
                    <ResultRow label="Commission" value={upsideIncome.annualCommission} />
                    <ResultRow label="Total" value={upsideIncome.total} highlight />
                  </div>

                  <div>
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-2">Compounding</div>
                    <ResultRow label="Retainer" value={compoundingIncome.annualRetainer} />
                    <ResultRow label="Commission" value={compoundingIncome.annualCommission} />
                    <ResultRow label="Total" value={compoundingIncome.total} highlight />
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-6 pt-6 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between py-2">
                    <span className="font-mono text-[11px] text-white/40">Total Clients</span>
                    <span className="font-mono text-[12px] font-medium text-white/70">{totalClients}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="font-mono text-[11px] text-white/40">Avg. Per Client</span>
                    <span className="font-mono text-[12px] font-medium text-white/70">{formatCurrency(averagePerClient)}</span>
                  </div>
                </div>
              </div>

              {/* Revenue Mix */}
              <div className="rounded border border-white/[0.06] bg-white/[0.02] p-6 mt-4">
                <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-3">Revenue Mix</div>
                <div className="h-1.5 rounded overflow-hidden flex" style={{ background: 'rgba(255, 255, 255, 0.04)' }}>
                  {totalAnnualIncome > 0 && (
                    <>
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${(stabilityIncome.total / totalAnnualIncome) * 100}%`, opacity: 0.9 }}
                      />
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${(upsideIncome.total / totalAnnualIncome) * 100}%`, opacity: 0.6 }}
                      />
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${(compoundingIncome.total / totalAnnualIncome) * 100}%`, opacity: 0.35 }}
                      />
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ opacity: 0.9 }} />
                    <span className="text-white/30">Stability</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ opacity: 0.6 }} />
                    <span className="text-white/30">Upside</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ opacity: 0.35 }} />
                    <span className="text-white/30">Compounding</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      <Dock />

      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default Calculator;
