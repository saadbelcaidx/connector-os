interface SignalMomentumProps {
  signalHistory: Array<{
    signalStrength: number;
    timestamp: string;
  }>;
}

function SignalMomentum({ signalHistory }: SignalMomentumProps) {
  const chartHeight = 100;
  const chartWidth = 320;
  const padding = 20;

  const displayData = signalHistory.slice(-3);

  if (displayData.length === 0) {
    return (
      <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
        <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em] mb-3">
          Signal Momentum
        </h3>
        <div className="text-[12px] text-white text-opacity-40 text-center py-6">
          No historical data yet. Signal momentum will appear after multiple data points.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...displayData.map(d => d.signalStrength), 50);
  const minValue = Math.min(...displayData.map(d => d.signalStrength), 0);
  const range = maxValue - minValue || 1;

  const points = displayData.map((data, index) => {
    const x = padding + (index * (chartWidth - padding * 2)) / Math.max(displayData.length - 1, 1);
    const normalizedValue = (data.signalStrength - minValue) / range;
    const y = chartHeight - padding - (normalizedValue * (chartHeight - padding * 2));
    return { x, y, value: data.signalStrength, timestamp: data.timestamp };
  });

  let pathD = '';
  if (points.length === 1) {
    pathD = `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  } else if (points.length === 2) {
    pathD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  } else {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currentPoint = points[i];
      const midX = (prevPoint.x + currentPoint.x) / 2;
      pathD += ` Q ${midX} ${prevPoint.y} ${midX} ${(prevPoint.y + currentPoint.y) / 2}`;
      pathD += ` Q ${midX} ${currentPoint.y} ${currentPoint.x} ${currentPoint.y}`;
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const trend = points.length > 1
    ? points[points.length - 1].value > points[0].value
      ? 'Upward'
      : points[points.length - 1].value < points[0].value
      ? 'Downward'
      : 'Flat'
    : 'Insufficient data';

  const trendColor = trend === 'Upward' ? '#26F7C7' : trend === 'Downward' ? '#666666' : '#3A9CFF';

  return (
    <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em]">
          Signal Momentum
        </h3>
        <div className="text-[11px] text-white text-opacity-40">
          Trend: <span style={{ color: trendColor }}>{trend}</span>
        </div>
      </div>

      <svg width={chartWidth} height={chartHeight} className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3A9CFF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#26F7C7" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        <path
          d={pathD}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#26F7C7"
              opacity="0.9"
            />
            <circle
              cx={point.x}
              cy={point.y}
              r="2"
              fill="#FFFFFF"
              opacity="0.9"
            />
          </g>
        ))}
      </svg>

      <div className="mt-3 pt-3 border-t border-[#1C1C1C] flex items-center justify-between text-[10px] text-white text-opacity-40">
        {points.map((point, i) => (
          <div key={i} className="text-center">
            <div className="font-medium" style={{ color: trendColor, opacity: 0.8 }}>
              {point.value.toFixed(0)}
            </div>
            <div className="mt-0.5">{formatTimestamp(point.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SignalMomentum;
