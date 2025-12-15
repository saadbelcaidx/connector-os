export function buildCleanJobsSummary(cleaned: any): string {
  if (!cleaned) return 'No cleaned data available';

  const count = cleaned.count ?? cleaned.jobs?.length ?? cleaned.length ?? 0;
  const title = cleaned.title || cleaned.jobs?.[0]?.title || cleaned.jobs?.[0]?.job_title || 'roles';
  const location = cleaned.location || cleaned.jobs?.[0]?.location || cleaned.jobs?.[0]?.job_city || '';
  const locText = location ? ` in ${location}` : '';

  return `${count} ${title}${locText} (AI cleaned)`;
}

export function buildCleanFundingSummary(cleaned: any): string {
  if (!cleaned) return 'No cleaned data available';

  const count = cleaned.count ?? cleaned.length ?? 0;
  const company = cleaned.company || cleaned[0]?.company || '';
  const amount = cleaned.amount || cleaned[0]?.amount || '';
  const round = cleaned.round || cleaned[0]?.round || '';

  if (company) {
    return `${company} raised ${amount} in ${round} (AI cleaned)`;
  }

  return `${count} funding event${count !== 1 ? 's' : ''} (AI cleaned)`;
}

export function buildCleanLayoffsSummary(cleaned: any): string {
  if (!cleaned) return 'No cleaned data available';

  const count = cleaned.count ?? cleaned.length ?? 0;
  const company = cleaned.company || cleaned[0]?.company || '';
  const date = cleaned.date || cleaned[0]?.date || '';

  if (company) {
    return `${company}: ${count} layoffs${date ? ` on ${date}` : ''} (AI cleaned)`;
  }

  return `${count} layoff${count !== 1 ? 's' : ''} detected (AI cleaned)`;
}

export function buildCleanHiringSummary(cleaned: any): string {
  if (!cleaned) return 'No cleaned data available';

  const trend = cleaned.trend || '';
  const percentage = cleaned.percentage ?? '';
  const industry = cleaned.industry || '';
  const period = cleaned.period || '';

  if (trend && percentage) {
    return `${trend} ${percentage}%${industry ? ` in ${industry}` : ''}${period ? ` ${period}` : ''} (AI cleaned)`;
  }

  return 'Hiring velocity data (AI cleaned)';
}

export function buildCleanTechSummary(cleaned: any): string {
  if (!cleaned) return 'No cleaned data available';

  const technologies = cleaned.technologies || cleaned.tech || [];
  const company = cleaned.company || '';
  const trend = cleaned.adoption_trend || cleaned.trend || '';

  if (Array.isArray(technologies) && technologies.length > 0) {
    const techList = technologies.slice(0, 3).join(', ');
    return `${techList}${company ? ` at ${company}` : ''}${trend ? ` - ${trend}` : ''} (AI cleaned)`;
  }

  return 'Tech adoption data (AI cleaned)';
}
