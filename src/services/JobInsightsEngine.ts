import { JobSignalInsight } from './SignalsClient';

export interface JobInsights {
  insights: string[];
  whyItMatters: string;
  recommendedMove: string;
  windowStatus: 'active' | 'stable' | 'cooling';
  windowLabel: string;
}

export function generateJobInsights(
  jobMetadata: JobSignalInsight | undefined,
  trendDirection: 'up' | 'down' | 'flat',
  sourcesCount: number,
  roleFilter?: string,
  industryFilter?: string
): JobInsights {
  const insights: string[] = [];
  let whyItMatters = '';
  let recommendedMove = '';
  let windowStatus: 'active' | 'stable' | 'cooling' = 'stable';
  let windowLabel = '🔵 Stable hiring window';

  if (!jobMetadata) {
    return {
      insights: ['No job data available — waiting for signal sync.'],
      whyItMatters: 'Unable to provide interpretation without job data.',
      recommendedMove: 'Configure API endpoints in Settings to enable live signals.',
      windowStatus: 'stable',
      windowLabel: '⚪ No data',
    };
  }

  const {
    count,
    keyword,
    seniorityMix,
    remoteMix,
    salaryBand,
    companySummary,
    industryMatch,
  } = jobMetadata;

  const isMidSenior = seniorityMix?.toLowerCase().includes('mid') || seniorityMix?.toLowerCase().includes('senior');
  const isRemoteHeavy = remoteMix?.toLowerCase().includes('remote') &&
    (remoteMix.match(/(\d+)%/)?.[1] ? parseInt(remoteMix.match(/(\d+)%/)?.[1] || '0') >= 50 : false);
  const hasCluster = companySummary && (companySummary.match(/\d+/)?.[0] ? parseInt(companySummary.match(/\d+/)?.[0] || '0') >= 3 : false);
  const hasSalaryData = salaryBand && salaryBand !== 'data unavailable';

  if (trendDirection === 'up') {
    windowStatus = 'active';
    windowLabel = '🟢 Active hiring window';
  } else if (trendDirection === 'down') {
    windowStatus = 'cooling';
    windowLabel = '⚪ Cooling hiring window';
  }

  if (isMidSenior && trendDirection === 'up') {
    insights.push(`Mid-senior hiring spike → possible GTM pain or new revenue targets.`);
  }

  if (isMidSenior && trendDirection === 'flat') {
    insights.push(`Sustained mid-senior hiring → execution pressure building.`);
  }

  if (isRemoteHeavy) {
    insights.push(`Remote-heavy roles → company scaling distributed teams.`);
  }

  if (hasCluster) {
    const clusterCount = companySummary?.match(/\d+/)?.[0] || '3';
    insights.push(`Cluster across ${clusterCount}+ companies indicates sector-wide push, not isolated growth.`);
  }

  if (industryFilter && industryMatch === 'high') {
    insights.push(`High industry match for "${industryFilter}" → strong niche alignment.`);
  }

  if (sourcesCount > 1) {
    insights.push(`Multiple sources (${sourcesCount}) reporting the same spike → confirmed signal.`);
  }

  if (roleFilter) {
    insights.push(`Filtered by "${roleFilter}" roles → targeted hiring in specific function.`);
  }

  if (hasSalaryData) {
    if (salaryBand?.includes('$') && trendDirection === 'up') {
      insights.push(`Salary bands rising with volume → competing for scarce talent.`);
    } else if (salaryBand?.toLowerCase().includes('tight') || salaryBand?.toLowerCase().includes('lower')) {
      insights.push(`Salary band tightening → cost pressure or budget constraints.`);
    }
  }

  if (keyword?.toLowerCase().includes('logistic') || industryFilter?.toLowerCase().includes('logistic')) {
    insights.push(`Clustered hiring in logistics → operational stress window.`);
  }

  if (trendDirection === 'up' && count > 100) {
    insights.push(`Hiring volume (${count}+) rising → demand acceleration underway.`);
  } else if (trendDirection === 'down') {
    insights.push(`Hiring volume declining → possible budget freeze or role consolidation.`);
  }

  if (insights.length === 0) {
    insights.push(`Steady ${keyword} hiring at ${count} roles — monitoring for pattern shifts.`);
  }

  if (trendDirection === 'up') {
    whyItMatters = `Windows opening — demand acceleration underway. ${isMidSenior ? 'Signals operational workload increasing.' : 'Early-stage expansion phase.'} ${isRemoteHeavy ? 'Expansion without office constraints.' : ''}`;
  } else if (trendDirection === 'down') {
    whyItMatters = `Cooling window — wait for confirmation before acting. May indicate budget realignment or hiring pause. Monitor for reversal signals in next 48h.`;
  } else {
    whyItMatters = `Stable hiring pattern suggests sustained execution mode. ${isMidSenior ? 'Operational workload likely consistent.' : 'Standard growth trajectory.'} ${isRemoteHeavy ? 'Distributed team model active.' : ''}`;
  }

  if (trendDirection === 'up' && isMidSenior) {
    recommendedMove = `Position your service as execution support during scaling. Reach out now — senior hiring spike often precedes budget increases.`;
  } else if (trendDirection === 'up' && isRemoteHeavy) {
    recommendedMove = `Introduce automation support — distributed teams adopt tools faster. Focus on async workflow improvements.`;
  } else if (trendDirection === 'down') {
    recommendedMove = `Monitor for 48h — downward trend may reverse after next sync. Avoid cold outreach until pattern stabilizes.`;
  } else if (hasCluster && trendDirection !== 'down') {
    recommendedMove = `Sector-wide movement detected. Create case studies showcasing ${keyword} expertise to capture inbound interest.`;
  } else if (industryMatch === 'high') {
    recommendedMove = `Strong niche alignment — leverage your ${industryFilter || keyword} expertise in positioning. Lead with vertical-specific case studies.`;
  } else {
    recommendedMove = `Stable hiring window — maintain consistent outreach cadence. Position as growth partner, not firefighter.`;
  }

  return {
    insights: insights.slice(0, 5),
    whyItMatters,
    recommendedMove,
    windowStatus,
    windowLabel,
  };
}
