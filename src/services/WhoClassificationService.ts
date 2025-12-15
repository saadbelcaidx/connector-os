export interface SignalMetadata {
  type: string;
  companySize?: number;
  round?: string;
  trend?: 'up' | 'down' | 'flat';
  [key: string]: any;
}

function detectJobWho(size: number | null): string[] {
  if (!size) return ["Head of Engineering", "CTO", "Head of People"];

  if (size < 50) return ["Founder", "CTO", "COO"];
  if (size < 200) return ["Head of Engineering", "Head of People", "Director Engineering"];
  if (size < 1000) return ["VP Engineering", "VP People Ops"];
  return ["Director Engineering", "Talent Acquisition Lead", "VP Engineering"];
}

function detectFundingWho(round: string | null | undefined): string[] {
  if (!round) return ["CEO", "COO"];

  const r = round.toLowerCase();
  if (r.includes("pre-seed") || r.includes("seed")) return ["Founder", "COO"];
  if (r.includes("series a")) return ["CEO", "COO", "Head of Growth"];
  if (r.includes("series b") || r.includes("series c")) return ["CRO", "VP Sales", "VP Marketing"];
  if (r.includes("series d") || r.includes("series e")) return ["CFO", "COO", "CEO"];
  return ["CEO", "COO", "CRO"];
}

function detectLayoffWho(size: number | null): string[] {
  if (!size) return ["CFO", "COO", "Head of People"];

  if (size < 200) return ["Founder", "COO"];
  if (size < 1000) return ["CFO", "COO", "HR Director"];
  return ["VP HR", "Head of People", "CFO"];
}

function detectHiringVelocityWho(trend: string | null | undefined): string[] {
  if (!trend) return ["COO", "Operations Manager"];

  if (trend === "up") return ["COO", "Head of Engineering", "Head of People"];
  if (trend === "down") return ["CFO", "COO", "Finance Lead"];
  return ["COO", "Operations Manager"];
}

function detectTechWho(): string[] {
  return ["CTO", "VP Engineering", "Director Engineering", "Head of IT", "DevOps Lead"];
}

export function detectWhoHasPressure(signal: SignalMetadata, companySize?: number): string[] {
  const size = companySize || signal.companySize || null;
  const signalType = signal.type.toLowerCase();

  if (signalType.includes("job") || signalType.includes("hiring") || signalType.includes("posting")) {
    const jobRoles = detectJobWho(size);
    return [...new Set([...jobRoles, "Head of Engineering", "CTO", "Head of People"])];
  }

  if (signalType.includes("fund") || signalType.includes("capital") || signalType.includes("raise")) {
    const fundingRoles = detectFundingWho(signal.round);
    return [...new Set([...fundingRoles, "CEO", "COO", "CRO"])];
  }

  if (signalType.includes("layoff") || signalType.includes("downsize") || signalType.includes("reduction")) {
    const layoffRoles = detectLayoffWho(size);
    return [...new Set([...layoffRoles, "CFO", "COO", "Head of People"])];
  }

  if (signalType.includes("velocity") || signalType.includes("acceleration")) {
    const velocityRoles = detectHiringVelocityWho(signal.trend);
    return [...new Set([...velocityRoles, "COO"])];
  }

  if (signalType.includes("tech") || signalType.includes("stack") || signalType.includes("migration") || signalType.includes("adoption")) {
    return detectTechWho();
  }

  return ["CEO", "COO"];
}

const WHO_TO_TITLE_MAPPING: Record<string, string[]> = {
  "Founder": ["Founder", "Co-Founder", "CEO", "Chief Executive Officer"],
  "CEO": ["CEO", "Chief Executive Officer", "Founder", "Co-Founder"],
  "CTO": ["CTO", "Chief Technology Officer", "VP Engineering", "VP of Engineering", "Director of Engineering"],
  "COO": ["COO", "Chief Operating Officer", "VP Operations", "VP of Operations"],
  "CFO": ["CFO", "Chief Financial Officer", "VP Finance", "Finance Director"],
  "CRO": ["CRO", "Chief Revenue Officer", "VP Revenue", "VP Sales"],
  "Head of Engineering": ["Head of Engineering", "Engineering Manager", "VP Engineering", "Director of Engineering", "Engineering Lead"],
  "VP Engineering": ["VP Engineering", "VP of Engineering", "Head of Engineering", "Director of Engineering", "CTO"],
  "Director Engineering": ["Director of Engineering", "Engineering Director", "VP Engineering", "Head of Engineering"],
  "Head of People": ["Head of People", "Head of HR", "VP People", "People Operations Lead", "Chief People Officer"],
  "VP People Ops": ["VP People", "VP People Operations", "Head of People", "Chief People Officer", "VP HR"],
  "VP HR": ["VP HR", "VP Human Resources", "Head of HR", "Chief People Officer", "HR Director"],
  "HR Director": ["HR Director", "Director of HR", "Head of HR", "VP HR"],
  "Head of Growth": ["Head of Growth", "VP Growth", "Growth Lead", "Director of Growth"],
  "VP Sales": ["VP Sales", "VP of Sales", "Head of Sales", "Sales Director", "CRO"],
  "VP Marketing": ["VP Marketing", "VP of Marketing", "Head of Marketing", "CMO", "Chief Marketing Officer"],
  "Talent Acquisition Lead": ["Talent Acquisition Lead", "Head of Talent", "Recruiting Lead", "VP Talent"],
  "Head of IT": ["Head of IT", "IT Director", "VP IT", "CIO", "Chief Information Officer"],
  "DevOps Lead": ["DevOps Lead", "Head of DevOps", "DevOps Manager", "VP Platform", "Platform Lead"],
  "Finance Lead": ["Finance Lead", "Finance Director", "VP Finance", "CFO"],
  "Operations Manager": ["Operations Manager", "Head of Operations", "Director of Operations", "COO"]
};

export function detectTargetTitles(whoRoles: string[]): string[] {
  if (!whoRoles || whoRoles.length === 0) {
    return ["CEO", "Chief Executive Officer", "Founder"];
  }

  const primaryRole = whoRoles[0];
  const titlesSet = new Set<string>();

  const primaryTitles = WHO_TO_TITLE_MAPPING[primaryRole];
  if (primaryTitles) {
    primaryTitles.forEach(title => titlesSet.add(title));
  } else {
    titlesSet.add(primaryRole);
  }

  for (let i = 1; i < Math.min(whoRoles.length, 3); i++) {
    const secondaryTitles = WHO_TO_TITLE_MAPPING[whoRoles[i]];
    if (secondaryTitles) {
      secondaryTitles.slice(0, 2).forEach(title => titlesSet.add(title));
    }
  }

  return Array.from(titlesSet);
}
