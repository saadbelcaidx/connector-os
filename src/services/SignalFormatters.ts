export interface FundingSignal {
  type: 'funding';
  amount?: number;
  currency?: string;
  round?: string;
  companyName: string;
  companyDomain?: string;
  announcedDate?: string;
  investors?: string[];
  headline?: string;
}

export interface JobsSignal {
  type: 'jobs';
  roleCount: number;
  topTitles?: string[];
  departments?: string[];
  seniorities?: string[];
  companyName: string;
  companyDomain?: string;
}

export interface LayoffsSignal {
  type: 'layoffs';
  companyName: string;
  companyDomain?: string;
  date?: string;
  details?: string;
}

export interface SignalExample {
  companyName: string;
  summaryLine: string;
}

export interface RichSignal {
  type: 'funding' | 'jobs' | 'layoffs' | 'tech';
  totalCount: number;
  examples: SignalExample[];
  whyThisMatters: string;
  operatorMove: string;
  operatorInsight?: string;  // Human-readable summary for display
}

export function formatFundingSummary(f: FundingSignal): string {
  const amount = f.amount ? `$${(f.amount / 1_000_000).toFixed(0)}M` : 'New funding';
  const round = f.round ? ` ${f.round}` : '';
  const lead = f.investors?.[0] ? ` (${f.investors[0]})` : '';
  const date = f.announcedDate ? ` • ${f.announcedDate}` : '';
  return `${amount}${round} at ${f.companyName}${lead}${date}`;
}

export function formatJobsSummary(j: JobsSignal): string {
  const count = j.roleCount || 0;
  const titles = (j.topTitles || []).slice(0, 2).join(', ');
  const levels = (j.seniorities || []).slice(0, 2).join(', ');
  if (!count) return 'No live roles yet';
  return `${count} roles live (${titles || 'mixed roles'} • ${levels || 'mixed levels'})`;
}

export function formatLayoffsSummary(l: LayoffsSignal): string {
  const when = l.date ? ` ${l.date}` : ' recently';
  return `${l.companyName} — team cuts${when}`;
}

export function createRichFundingSignal(rawData: any[]): RichSignal | null {
  if (!rawData || rawData.length === 0) return null;

  const examples: SignalExample[] = rawData.slice(0, 3).map((item: any) => {
    const amount = item.dealAmount ? `$${(item.dealAmount / 1_000_000).toFixed(0)}M` : 'New funding';
    const round = item.fundingRound ? ` ${item.fundingRound}` : '';
    const lead = item.leadInvestors?.[0] || item.investors?.[0] ? ` (${item.leadInvestors?.[0] || item.investors?.[0]})` : '';
    const date = item.announcedDate ? ` • ${item.announcedDate}` : '';

    let companyName = item.companyName || item.name || 'Unknown';
    if (typeof companyName === 'object' && companyName !== null) {
      companyName = companyName.name || 'Unknown';
    }

    return {
      companyName: String(companyName),
      summaryLine: `${amount}${round}${lead}${date}`
    };
  });

  if (examples.length === 0) return null;

  // Generate operatorInsight summary
  const topCompanyNames = examples.slice(0, 3).map(e => e.companyName).join(', ');
  const operatorInsight = `${rawData.length} funding rounds (${topCompanyNames})`;

  return {
    type: 'funding',
    totalCount: rawData.length,
    examples,
    whyThisMatters: 'Big rounds create pressure to move fast.',
    operatorMove: 'Connect them with teams that help scale after a raise.',
    operatorInsight
  };
}

// Helper to safely extract text from any value type
function safeTextForSignal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(x => safeTextForSignal(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeTextForSignal(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

export function createRichJobsSignal(rawData: any[]): RichSignal | null {
  if (!rawData || rawData.length === 0) return null;

  const companyMap = new Map<string, { count: number; titles: string[]; company: string }>();

  rawData.forEach((job: any) => {
    // Extract company name from any structure: nested (company.name) or flat (employer_name, company_name)
    const companyName = safeTextForSignal(
      job.company?.name ?? job.employer_name ?? job.company_name ?? job.company ?? job.organization ?? 'Unknown'
    ) || 'Unknown';

    const company = companyName;
    const domain = safeTextForSignal(job.company?.url ?? job.employer_website ?? job.company_website) || company;
    const title = safeTextForSignal(job.job_title ?? job.title ?? job.position) || 'Role';

    if (companyMap.has(domain)) {
      const existing = companyMap.get(domain)!;
      existing.count++;
      if (existing.titles.length < 2) existing.titles.push(title);
    } else {
      companyMap.set(domain, { count: 1, titles: [title], company });
    }
  });

  const sortedCompanies = Array.from(companyMap.values()).sort((a, b) => b.count - a.count);
  const companyCount = sortedCompanies.length;

  const examples: SignalExample[] = sortedCompanies
    .slice(0, 3)
    .map(({ company, count, titles }) => {
      const titleList = titles.join(', ');
      return {
        companyName: company,
        summaryLine: count === 1 ? titleList : `${titleList} (${count} roles)`
      };
    });

  if (examples.length === 0) return null;

  // Generate operatorInsight: "X companies hiring (Company1, Company2, Company3, ...)"
  const topCompanyNames = sortedCompanies.slice(0, 5).map(c => c.company).join(', ');
  const operatorInsight = `${companyCount} companies hiring (${topCompanyNames})`;

  return {
    type: 'jobs',
    totalCount: rawData.length,
    examples,
    whyThisMatters: 'Hiring shows teams are stretched.',
    operatorMove: 'Connect them with support before things pile up.',
    operatorInsight
  };
}

export function createRichLayoffsSignal(rawData: any[]): RichSignal | null {
  if (!rawData || rawData.length === 0) return null;

  const examples: SignalExample[] = rawData.slice(0, 3).map((item: any) => {
    const when = item.date || item.announcedDate ? ' last week' : '';

    // Use safeTextForSignal to extract company name from any structure
    const companyName = safeTextForSignal(
      item.company?.name ?? item.companyName ?? item.company ?? item.organization ?? 'Unknown'
    ) || 'Unknown';

    return {
      companyName,
      summaryLine: `team cuts${when}`
    };
  });

  if (examples.length === 0) return null;

  // Generate operatorInsight summary
  const topCompanyNames = examples.slice(0, 3).map(e => e.companyName).join(', ');
  const operatorInsight = `${rawData.length} layoff events (${topCompanyNames})`;

  return {
    type: 'layoffs',
    totalCount: rawData.length,
    examples,
    whyThisMatters: 'Teams are doing more work with fewer people.',
    operatorMove: 'Introduce help that saves time or removes busy work.',
    operatorInsight
  };
}
