import { TrendingUp, Minus, TrendingDown } from 'lucide-react';

interface PressureForecastProps {
  forecast: 'rising' | 'stable' | 'falling';
  explanation: string;
  confidence: number;
  momentumScore: number;
}

function PressureForecast({ forecast, explanation, confidence, momentumScore }: PressureForecastProps) {
  const getConfig = () => {
    switch (forecast) {
      case 'rising':
        return {
          color: '#26F7C7',
          bgColor: 'rgba(38, 247, 199, 0.08)',
          borderColor: 'rgba(38, 247, 199, 0.3)',
          icon: TrendingUp,
          label: 'Rising',
          pulse: true,
        };
      case 'falling':
        return {
          color: '#666666',
          bgColor: 'rgba(102, 102, 102, 0.08)',
          borderColor: 'rgba(102, 102, 102, 0.3)',
          icon: TrendingDown,
          label: 'Falling',
          pulse: false,
        };
      default:
        return {
          color: '#3A9CFF',
          bgColor: 'rgba(58, 156, 255, 0.08)',
          borderColor: 'rgba(58, 156, 255, 0.3)',
          icon: Minus,
          label: 'Stable',
          pulse: false,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div
      className="bg-[#0C0C0C] rounded-[10px] p-5 border transition-all duration-300"
      style={{
        borderColor: config.borderColor,
        boxShadow: config.pulse ? `0 0 12px ${config.color}20` : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-opacity-20" style={{ borderColor: config.color }}>
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded ${config.pulse ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: config.bgColor,
              boxShadow: config.pulse ? `0 0 8px ${config.color}40` : 'none',
            }}
          >
            <Icon size={16} style={{ color: config.color, strokeWidth: 2 }} />
          </div>
          <h3 className="text-[13px] font-normal uppercase tracking-[0.15em]" style={{ color: config.color, opacity: 0.9 }}>
            Pressure Forecast
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider">Confidence</div>
            <div className="text-[13px] font-medium" style={{ color: config.color }}>
              {confidence}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-white text-opacity-40 uppercase tracking-wider">Momentum</div>
            <div className="text-[13px] font-medium" style={{ color: config.color }}>
              {momentumScore}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 mb-3">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.pulse ? 'animate-pulse' : ''}`}
          style={{
            backgroundColor: config.bgColor,
            borderColor: config.borderColor,
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: config.color,
              boxShadow: config.pulse ? `0 0 8px ${config.color}` : 'none',
            }}
          />
          <span className="text-[14px] font-medium uppercase tracking-wide" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
      </div>

      <div className="text-[13px] text-white text-opacity-75 leading-relaxed">
        {explanation}
      </div>
    </div>
  );
}

export default PressureForecast;
