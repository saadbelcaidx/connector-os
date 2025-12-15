import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Info, ArrowLeft } from 'lucide-react';
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
        className="text-[#666666] hover:text-[#3A9CFF] transition-colors duration-150"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {isVisible && (
        <div className="absolute left-0 top-5 z-50 w-56 bg-[#141414] border border-[#222222] rounded-lg p-2.5 text-xs text-[#CCCCCC] shadow-xl">
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
    <div className="mb-3.5">
      <label className="flex items-center text-[13px] font-normal text-white text-opacity-65 mb-1.5">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="relative">
        {isDollar && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-[15px]">$</span>
        )}
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          className={`w-full h-[38px] bg-[#0F0F0F] text-white text-[15px] ${isDollar ? 'pl-7' : 'pl-3'} pr-3 rounded-lg border border-[#1C1C1C] hover:border-[#262626] focus:border-[#3A9CFF] focus:outline-none transition-all duration-150`}
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
    <div className="bg-[#0C0C0C] rounded-[10px] p-4 mb-4 border border-[#1C1C1C] transition-all duration-150 hover:scale-[1.005]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-3 transition-opacity duration-150"
      >
        <h3 className="text-[13px] font-normal text-white text-opacity-70 uppercase tracking-[0.2em]">{title}</h3>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#3A9CFF] text-opacity-70" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#3A9CFF] text-opacity-70" />
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
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[14px] text-white text-opacity-60">{label}</span>
      <span className={`text-[17px] font-medium ${highlight ? 'text-[#26F7C7]' : 'text-white text-opacity-94'} transition-all duration-150`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function DistributionCurve({ stability, upside, compounding }: { stability: number; upside: number; compounding: number }) {
  const maxValue = Math.max(stability, upside, compounding);
  const chartHeight = 80;
  const chartWidth = 240;
  const padding = 12;

  const points = [
    { x: padding, y: chartHeight - padding - ((stability / maxValue) * (chartHeight - padding * 2)), label: 'S' },
    { x: chartWidth / 2, y: chartHeight - padding - ((upside / maxValue) * (chartHeight - padding * 2)), label: 'U' },
    { x: chartWidth - padding, y: chartHeight - padding - ((compounding / maxValue) * (chartHeight - padding * 2)), label: 'C' }
  ];

  const pathD = `M ${points[0].x} ${points[0].y} Q ${chartWidth / 2} ${points[1].y} ${points[1].x} ${points[1].y} T ${points[2].x} ${points[2].y}`;

  return (
    <div className="bg-[#0C0C0C] rounded-[10px] p-4 border border-[#1C1C1C]">
      <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Distribution Curve</h3>
      <svg width={chartWidth} height={chartHeight} className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <path
          d={pathD}
          fill="none"
          stroke="#3BA9FF"
          strokeWidth="1.5"
          opacity="0.9"
        />
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x}
              cy={point.y}
              r="2.5"
              fill="#3BA9FF"
              opacity="0.95"
            />
            <text
              x={point.x}
              y={chartHeight - 2}
              textAnchor="middle"
              fill="#3BA9FF"
              fontSize="9"
              opacity="0.7"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function RevenueComposition({ stability, upside, compounding }: { stability: number; upside: number; compounding: number }) {
  const total = stability + upside + compounding;
  const stabilityPct = total > 0 ? (stability / total) * 100 : 0;
  const upsidePct = total > 0 ? (upside / total) * 100 : 0;
  const compoundingPct = total > 0 ? (compounding / total) * 100 : 0;

  const barData = [
    { label: 'Stability', value: stabilityPct, offset: 0 },
    { label: 'Upside', value: upsidePct, offset: stabilityPct },
    { label: 'Compounding', value: compoundingPct, offset: stabilityPct + upsidePct }
  ];

  return (
    <div className="bg-[#0C0C0C] rounded-[10px] p-4 border border-[#1C1C1C]">
      <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Revenue Composition</h3>
      <div className="mb-3">
        <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#26F7C7] transition-all duration-300"
            style={{ width: `${stabilityPct}%`, opacity: 0.9 }}
          />
          <div
            className="h-full bg-[#26F7C7] transition-all duration-300"
            style={{ width: `${upsidePct}%`, opacity: 0.7 }}
          />
          <div
            className="h-full bg-[#26F7C7] transition-all duration-300"
            style={{ width: `${compoundingPct}%`, opacity: 0.5 }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {barData.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className="w-2 h-2 rounded-full bg-[#26F7C7] mr-2"
                style={{ opacity: 0.9 - (i * 0.2) }}
              />
              <span className="text-[11px] text-[#3A9CFF] opacity-70">{item.label}</span>
            </div>
            <span className="text-[12px] text-white opacity-60">{item.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
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

  const getOperatorInsight = () => {
    const threshold = 0.15;
    const maxTotal = Math.max(stabilityIncome.total, upsideIncome.total, compoundingIncome.total);
    const minTotal = Math.min(stabilityIncome.total, upsideIncome.total, compoundingIncome.total);
    const isBalanced = (maxTotal - minTotal) / (maxTotal || 1) < threshold;

    if (isBalanced) {
      return "You built a balanced Connector engine. Now increase dealflow frequency to bend the curve upward.";
    }

    if (stabilityIncome.total > upsideIncome.total && stabilityIncome.total > compoundingIncome.total) {
      return "Your foundation is carrying the system. Good — but don't mistake stability for scale. Add upside to unlock flow.";
    }

    if (upsideIncome.total > stabilityIncome.total && upsideIncome.total > compoundingIncome.total) {
      return "Your pipeline is volatile. You're catching spikes, not building flow. Strengthen your base or your income yo-yos forever.";
    }

    if (compoundingIncome.total > stabilityIncome.total && compoundingIncome.total > upsideIncome.total) {
      return "You're in Operator territory. Your system compounds. Keep feeding it timing + dealflow and it prints.";
    }

    return "You built a balanced Connector engine. Now increase dealflow frequency to bend the curve upward.";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-gray-200 transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          Back to Connector OS
        </button>

        <div className="mb-8">
          <div className="inline-block px-2.5 py-1 bg-[#0F1B17] text-[#3A9CFF] text-[10px] font-medium rounded-full mb-2 border-b border-[#3A9CFF] border-opacity-30">
            Connector OS
          </div>
          <h1 className="text-[32px] font-medium text-white mb-1.5">Operator Revenue Calculator</h1>
          <p className="text-[17px] font-light text-white text-opacity-75 fade-in">See what your distribution engine actually produces.</p>
        </div>

        <div className="max-w-[520px] mt-4 mb-10">
          <div className="flex items-start mb-2">
            <Info className="w-3.5 h-3.5 text-white opacity-80 mr-2 mt-0.5 flex-shrink-0" />
            <ol className="text-[12px] font-light text-[#8C8C8C] leading-[1.45] space-y-1">
              <li>1. Input your numbers on the left.</li>
              <li>2. The calculator updates instantly.</li>
              <li>3. See your income breakdown on the right.</li>
              <li>4. Adjust values to test different scenarios.</li>
            </ol>
          </div>
          <p className="ml-5 text-[12px] font-light text-[#8C8C8C] opacity-60 italic">That's it — type numbers → see outcomes.</p>
          <div className="mt-4 w-full h-px bg-[#1A1A1A]"></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-9">
            <div>
              <h2 className="text-[13px] font-normal text-white text-opacity-70 uppercase tracking-[0.2em] mb-6">Your Inputs</h2>

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
                  label="Commission Rate (decimal, e.g., 0.10)"
                  value={stability.commission}
                  onChange={(val) => setStability({ ...stability, commission: val })}
                  tooltip="Your upside. This is where most operators win."
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
                  tooltip="Flow volume. More deals = compounding effect."
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
                  tooltip="Your baseline. This is what keeps the lights on."
                />
                <InputField
                  label="Commission Rate (decimal, e.g., 0.18)"
                  value={upside.commission}
                  onChange={(val) => setUpside({ ...upside, commission: val })}
                  tooltip="Your upside. This is where most operators win."
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
                  tooltip="Flow volume. More deals = compounding effect."
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
                  tooltip="Your baseline. This is what keeps the lights on."
                />
                <InputField
                  label="Commission Rate (decimal, e.g., 0.25)"
                  value={compounding.commission}
                  onChange={(val) => setCompounding({ ...compounding, commission: val })}
                  tooltip="Your upside. This is where most operators win."
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
                  tooltip="Flow volume. More deals = compounding effect."
                />
              </CollapsibleSection>
            </div>
          </div>

          <div>
            <h2 className="text-[13px] font-normal text-white text-opacity-70 uppercase tracking-[0.2em] mb-6">Results</h2>

            <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
              <div className="mb-5 pb-5 border-b border-[#3A9CFF] border-opacity-20">
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Stability Income</h3>
                <ResultRow label="Annual Retainer" value={stabilityIncome.annualRetainer} />
                <ResultRow label="Annual Commission" value={stabilityIncome.annualCommission} />
                <div className="mt-3 pt-3 border-t border-[#3A9CFF] border-opacity-10">
                  <ResultRow label="Total Stability" value={stabilityIncome.total} highlight />
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-[#3A9CFF] border-opacity-20">
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Upside Income</h3>
                <ResultRow label="Annual Retainer" value={upsideIncome.annualRetainer} />
                <ResultRow label="Annual Commission" value={upsideIncome.annualCommission} />
                <div className="mt-3 pt-3 border-t border-[#3A9CFF] border-opacity-10">
                  <ResultRow label="Total Upside" value={upsideIncome.total} highlight />
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-[#3A9CFF] border-opacity-20">
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Compounding Income</h3>
                <ResultRow label="Annual Retainer" value={compoundingIncome.annualRetainer} />
                <ResultRow label="Annual Commission" value={compoundingIncome.annualCommission} />
                <div className="mt-3 pt-3 border-t border-[#3A9CFF] border-opacity-10">
                  <ResultRow label="Total Compounding" value={compoundingIncome.total} highlight />
                </div>
              </div>

              <div className="mb-5 pb-5 border-b border-[#3A9CFF] border-opacity-20">
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-4">Summary</h3>
                <div className="flex items-center justify-between py-4 mb-3">
                  <span className="text-[16px] text-white text-opacity-70">Total Annual Income</span>
                  <span
                    className="text-[28px] font-bold text-[#26F7C7]"
                    style={{
                      textShadow: '0 0 20px rgba(38, 247, 199, 0.25)'
                    }}
                  >
                    {formatCurrency(totalAnnualIncome)}
                  </span>
                </div>
                <ResultRow label="Average Per Client" value={averagePerClient} />
                <ResultRow label="Monthly Average" value={monthlyAverage} />
                <div className="pt-3 mt-3 border-t border-[#3A9CFF] border-opacity-10">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-white text-opacity-60">Total Clients</span>
                    <span className="text-[17px] font-medium text-white text-opacity-94">{totalClients}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">Operator Insight</h3>
                <p className="text-[14px] text-white text-opacity-65 leading-relaxed fade-in">
                  {getOperatorInsight()}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4">
              <DistributionCurve
                stability={stabilityIncome.total}
                upside={upsideIncome.total}
                compounding={compoundingIncome.total}
              />
              <RevenueComposition
                stability={stabilityIncome.total}
                upside={upsideIncome.total}
                compounding={compoundingIncome.total}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 text-[11px] text-white opacity-60 font-light">
        Connector OS Tool • v1.0
      </div>

      <Dock />
    </div>
  );
}

export default Calculator;
