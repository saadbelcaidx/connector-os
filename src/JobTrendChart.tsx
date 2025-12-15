import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TrendData {
  date: string;
  count: number;
}

interface JobTrendChartProps {
  userId?: string;
  onTrendChange?: (direction: 'up' | 'down' | 'flat') => void;
}

export function JobTrendChart({ userId = 'default', onTrendChange }: JobTrendChartProps) {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [trendDirection, setTrendDirection] = useState<'up' | 'down' | 'flat'>('flat');
  const [loading, setLoading] = useState(true);

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

  const maxCount = Math.max(...trendData.map(d => d.count), 1);
  const minCount = Math.min(...trendData.map(d => d.count), 0);

  const getY = (count: number, height: number): number => {
    if (maxCount === minCount) return height / 2;
    return height - ((count - minCount) / (maxCount - minCount)) * height;
  };

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg border border-[#1C1C1C]">
        <div className="text-[11px] text-white text-opacity-40">Loading trend data...</div>
      </div>
    );
  }

  if (trendData.length === 0) {
    return (
      <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg border border-[#1C1C1C]">
        <div className="text-[11px] text-white text-opacity-70 mb-2">Job Volume Trend (Last 60 Days)</div>
        <div className="text-[10px] text-white text-opacity-40">
          Trend data will appear as signals update
        </div>
      </div>
    );
  }

  const width = 300;
  const height = 50;
  const padding = 2;

  const points = trendData
    .map((d, i) => {
      const x = (i / (trendData.length - 1)) * (width - padding * 2) + padding;
      const y = getY(d.count, height - padding * 2) + padding;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${padding},${height} ${points} ${width - padding},${height}`;

  return (
    <div className="mt-4 p-4 bg-[#0F0F0F] rounded-lg border border-[#1C1C1C]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-white text-opacity-70">Job Volume Trend (Last 60 Days)</div>
        <div className="flex items-center gap-1">
          {trendDirection === 'up' && (
            <>
              <TrendingUp size={12} className="text-[#26F7C7]" />
              <span className="text-[10px] text-[#26F7C7]">Upward</span>
            </>
          )}
          {trendDirection === 'down' && (
            <>
              <TrendingDown size={12} className="text-red-400" />
              <span className="text-[10px] text-red-400">Downward</span>
            </>
          )}
          {trendDirection === 'flat' && (
            <>
              <Minus size={12} className="text-white text-opacity-40" />
              <span className="text-[10px] text-white text-opacity-40">Flat</span>
            </>
          )}
        </div>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#26F7C7" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#26F7C7" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#trendGradient)" />
        <polyline
          points={points}
          fill="none"
          stroke="#26F7C7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {trendData.map((d, i) => {
          const x = (i / (trendData.length - 1)) * (width - padding * 2) + padding;
          const y = getY(d.count, height - padding * 2) + padding;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="2"
              fill="#26F7C7"
              className="hover:r-3 transition-all cursor-pointer"
            >
              <title>{`${d.date}: ${d.count} roles`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
