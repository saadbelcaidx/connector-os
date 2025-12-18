import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { supabase } from './lib/supabase';

interface TrendData {
  date: string;
  count: number;
}

interface JobTrendChartProps {
  userId?: string;
  onTrendChange?: (direction: 'up' | 'down' | 'flat') => void;
}

/**
 * Calculate 7-day rolling average to smooth noisy data
 */
function calculateRollingAverage(data: TrendData[], window: number = 7): TrendData[] {
  if (data.length < window) return data;

  return data.map((item, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = data.slice(start, index + 1);
    const avg = slice.reduce((sum, d) => sum + d.count, 0) / slice.length;
    return { date: item.date, count: Math.round(avg) };
  });
}

export function JobTrendChart({ userId = 'default', onTrendChange }: JobTrendChartProps) {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [trendDirection, setTrendDirection] = useState<'up' | 'down' | 'flat'>('flat');
  const [loading, setLoading] = useState(true);
  const [signalConfidence, setSignalConfidence] = useState<'high' | 'medium' | 'low'>('low');

  useEffect(() => {
    loadTrendData();
  }, [userId]);

  useEffect(() => {
    if (onTrendChange) {
      onTrendChange(trendDirection);
    }
  }, [trendDirection, onTrendChange]);

  const loadTrendData = async () => {
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data, error } = await supabase
        .from('signal_history')
        .select('jobs_count, created_at')
        .eq('user_id', userId)
        .gte('created_at', sixtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const trends: TrendData[] = data.map(item => ({
          date: new Date(item.created_at).toLocaleDateString(),
          count: Number(item.jobs_count) || 0,
        }));

        setTrendData(trends);
        calculateTrend(trends);

        // Determine signal confidence based on data density
        if (data.length >= 14) {
          setSignalConfidence('high');
        } else if (data.length >= 7) {
          setSignalConfidence('medium');
        } else {
          setSignalConfidence('low');
        }
      }
    } catch (error) {
      console.error('Error loading trend data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTrend = (data: TrendData[]) => {
    if (data.length < 2) {
      setTrendDirection('flat');
      return;
    }

    const lastSevenDays = data.slice(-7);
    if (lastSevenDays.length < 2) {
      setTrendDirection('flat');
      return;
    }

    const sumX = lastSevenDays.reduce((sum, _, i) => sum + i, 0);
    const sumY = lastSevenDays.reduce((sum, d) => sum + d.count, 0);
    const sumXY = lastSevenDays.reduce((sum, d, i) => sum + i * d.count, 0);
    const sumX2 = lastSevenDays.reduce((sum, _, i) => sum + i * i, 0);

    const n = lastSevenDays.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 5) {
      setTrendDirection('up');
    } else if (slope < -5) {
      setTrendDirection('down');
    } else {
      setTrendDirection('flat');
    }
  };

  // Apply 7-day rolling average for smoother visualization
  const smoothedData = useMemo(() => calculateRollingAverage(trendData), [trendData]);

  // Sample data to reduce visual noise (show max ~20 points)
  const sampledData = useMemo(() => {
    if (smoothedData.length <= 20) return smoothedData;
    const step = Math.ceil(smoothedData.length / 20);
    return smoothedData.filter((_, i) => i % step === 0 || i === smoothedData.length - 1);
  }, [smoothedData]);

  const maxCount = Math.max(...sampledData.map(d => d.count), 1);
  const minCount = Math.min(...sampledData.map(d => d.count), 0);

  const getY = (count: number, height: number): number => {
    if (maxCount === minCount) return height / 2;
    return height - ((count - minCount) / (maxCount - minCount)) * height;
  };

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-[#0a0a0a] rounded-2xl border border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-white/10 animate-pulse" />
          <div className="h-2 w-24 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (trendData.length === 0) {
    return (
      <div className="mt-4 p-4 bg-[#0a0a0a] rounded-2xl border border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-white/40">Hiring Pressure Trend</div>
          <div className="text-[9px] text-white/20">Awaiting data</div>
        </div>
        <div className="mt-3 h-10 flex items-center justify-center">
          <div className="text-[9px] text-white/20">
            Trend data builds as signals refresh
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-white/[0.04]">
          <span className="text-[8px] text-white/20">Source: Apify (Wellfound / LinkedIn)</span>
        </div>
      </div>
    );
  }

  const width = 280;
  const height = 40;
  const padding = 4;

  const points = sampledData
    .map((d, i) => {
      const x = (i / Math.max(sampledData.length - 1, 1)) * (width - padding * 2) + padding;
      const y = getY(d.count, height - padding * 2) + padding;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${padding},${height} ${points} ${width - padding},${height}`;

  // Neutral color scheme - premium monochrome
  const trendColor = trendDirection === 'up'
    ? 'rgba(255, 255, 255, 0.6)'
    : trendDirection === 'down'
    ? 'rgba(255, 255, 255, 0.35)'
    : 'rgba(255, 255, 255, 0.25)';

  const gradientId = `trendGradient-${userId}`;

  return (
    <div className="mt-4 p-4 bg-[#0a0a0a] rounded-2xl border border-white/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Hiring Pressure</span>
          {signalConfidence !== 'high' && (
            <span
              className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 flex items-center gap-1"
              title="Limited historical data — trend may be unreliable"
            >
              <Info size={8} />
              {signalConfidence === 'low' ? 'Low confidence' : 'Building'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {trendDirection === 'up' && (
            <>
              <TrendingUp size={10} className="text-white/60" />
              <span className="text-[9px] text-white/60">Rising</span>
            </>
          )}
          {/* Hide "Falling" - not actionable. Show stable instead */}
          {(trendDirection === 'down' || trendDirection === 'flat') && (
            <>
              <Minus size={10} className="text-white/30" />
              <span className="text-[9px] text-white/30">Stable</span>
            </>
          )}
        </div>
      </div>

      {/* Chart - calm sparse area */}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        style={{ opacity: 0.9 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Subtle area fill */}
        <polygon points={areaPoints} fill={`url(#${gradientId})`} />
        {/* Thin trend line */}
        <polyline
          points={points}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
      </svg>

      {/* Source attribution */}
      <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between">
        <span className="text-[8px] text-white/20">Source: Apify (Wellfound / LinkedIn)</span>
        <span className="text-[8px] text-white/15">7d avg • {sampledData.length} samples</span>
      </div>
    </div>
  );
}
