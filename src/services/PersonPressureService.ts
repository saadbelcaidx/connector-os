export interface PressureContext {
  whoRole: string;
  signalType: string;
  signalDetails?: string;
  companySize?: number;
  fundingRound?: string;
}

const PRESSURE_PROFILES: Record<string, Record<string, string>> = {
  "CTO": {
    "jobs": "The team is moving too slow and needs help fast so they don't fall behind on what they promised to build.",
    "funding": "The board wants to see the team grow and ship faster now that they have new money.",
    "layoffs": "They need to get more done with fewer people, and everyone is watching closely.",
    "hiringVelocity": "Hiring fast but can't get new people ready quick enough, and quality might start to slip.",
    "tech": "The tech choices they made before are causing problems now and people are asking questions."
  },
  "CEO": {
    "jobs": "Need to grow the team fast to hit goals, and there's not enough time or people to do it all.",
    "funding": "The board expects a lot now that they have more money, and everything needs to move faster.",
    "layoffs": "Money is tight and they need to figure out how to make money without slowing down growth.",
    "hiringVelocity": "The company is growing faster than they can keep up, and things are starting to feel messy.",
    "tech": "The tech they built early on isn't ready for how big they're getting, and it needs to change fast."
  },
  "COO": {
    "jobs": "Systems are at the limit and need to get better before they break from too much growth.",
    "funding": "Expected to make operations way better right away now that the company has new money.",
    "layoffs": "Need to keep getting things done with fewer people and everyone is watching the numbers.",
    "hiringVelocity": "Too many new people joining too fast, and the process for getting them ready can't keep up.",
    "tech": "The tools they use aren't good enough for how big they are now, and everything is taking too long."
  },
  "CFO": {
    "jobs": "Spending more money as the team grows, and need to make sure they don't run out too soon.",
    "funding": "Need to be more careful with money now, and the board wants to know where every dollar goes.",
    "layoffs": "The numbers aren't looking good and people are asking when they'll start making money.",
    "hiringVelocity": "The cost of getting customers is changing as they grow, and the math might not work anymore.",
    "tech": "Spending a lot on tech but can't tell if it's worth it, and need to understand costs better."
  },
  "VP Engineering": {
    "jobs": "The team is too small to build everything they said they would, and hiring needs to go faster.",
    "funding": "The board wants to see products ship faster now that there's more money to spend.",
    "layoffs": "Everyone is watching how much the team gets done, and they need to prove they can do it with fewer people.",
    "hiringVelocity": "Growing the team fast but worried the culture and quality will start to break down.",
    "tech": "People are questioning the tech decisions they made, and changing things now will be hard."
  },
  "Head of Engineering": {
    "jobs": "The team is full and moving slow, and if they don't hire soon they might fall behind.",
    "funding": "Expected to ship things faster now, and leadership is watching to see results quickly.",
    "layoffs": "People are asking if the team can really get things done with fewer people.",
    "hiringVelocity": "Too many new people joining too fast, and not enough time to help them learn the right way.",
    "tech": "The tech is old and needs to change, but the team is too busy building new things to fix it."
  },
  "Head of People": {
    "jobs": "Hiring is behind where it needs to be, and they need to find good people much faster.",
    "funding": "Company culture is at risk as they grow, and leadership wants people operations to feel more grown up.",
    "layoffs": "People are worried and upset, and they need to keep everyone feeling good through hard times.",
    "hiringVelocity": "So many people joining that the experience of getting started is getting worse.",
    "tech": "The HR tools are old and everything is done by hand, which is slow and frustrating."
  },
  "VP People Ops": {
    "jobs": "Hiring is at the max and they can't hire more without making the quality worse.",
    "funding": "Need to hire better people now that there's more money, and expectations are higher.",
    "layoffs": "People are stressed and starting to leave, and morale is going down.",
    "hiringVelocity": "Growing too fast and the people team can't keep up with all the new hires.",
    "tech": "The tools they use for people stuff aren't good enough for how big they are now."
  },
  "CRO": {
    "jobs": "The sales team is too small to hit the big goals they set, and they need to hire fast.",
    "funding": "Expected to bring in way more money now, and the sales pipeline needs to grow right away.",
    "layoffs": "Sales needs to bring in the same money with fewer people, and everyone is watching closely.",
    "hiringVelocity": "Hiring sales people fast but it takes time for them to start closing deals, and goals are at risk.",
    "tech": "The sales tools aren't good enough and holding them back from selling faster."
  },
  "Founder": {
    "jobs": "Doing too much and running out of time, and need to hire people to keep things moving.",
    "funding": "Investors want to see real results now, and things need to get more professional fast.",
    "layoffs": "Fighting to survive and need to make the money last while keeping the best people.",
    "hiringVelocity": "Growing faster than they can handle, and the company needs better systems and structure.",
    "tech": "The tech they built in the beginning isn't ready for how big they're trying to get."
  },
  "VP Sales": {
    "jobs": "The sales team is too small, and they need to hire and train people quickly to hit goals.",
    "funding": "Sales needs to close deals faster now, and leadership is expecting better results.",
    "layoffs": "Need to close more deals with fewer sales people, and the pressure is on to show results.",
    "hiringVelocity": "Training new reps while trying to hit goals, and there's not enough time to do both well.",
    "tech": "The sales tools don't show what's really happening in the pipeline, and they need better data."
  },
  "VP Marketing": {
    "jobs": "The marketing team is too small to do everything needed, and they need to grow.",
    "funding": "Marketing needs to show it's working and bringing in good leads now that there's more money.",
    "layoffs": "Less money to spend on marketing but still expected to bring in the same number of leads.",
    "hiringVelocity": "The marketing team is growing fast but the systems and process aren't keeping up.",
    "tech": "The marketing tools are old or not being used right, and they need better ones."
  },
  "Director Engineering": {
    "jobs": "The team can barely get anything done, and they need to hire fast before everything falls apart.",
    "funding": "Expected to build things faster now, but can't slow down to make sure it's done right.",
    "layoffs": "Everyone is watching how much work gets done, even though the team is smaller now.",
    "hiringVelocity": "So many new people joining that code quality and team culture might start to break.",
    "tech": "Old tech choices are making everything harder, but there's no time to fix them."
  }
};

const DEFAULT_PROFILES: Record<string, string> = {
  "jobs": "They're hiring a lot right now, which usually means the team is stretched thin and needs help.",
  "funding": "They just raised money, so leadership probably feels pressure to grow fast and show results.",
  "layoffs": "Money is tight and they're making cuts, which means they need to figure out how to do more with less.",
  "hiringVelocity": "Things are changing fast as they grow, and their systems are having trouble keeping up.",
  "tech": "They're taking a fresh look at their tech choices, and changes are probably needed soon."
};

export function detectPressureProfile(context: PressureContext): string {
  const { whoRole, signalType, companySize } = context;

  const normalizedSignalType = normalizeSignalType(signalType);

  const roleProfiles = PRESSURE_PROFILES[whoRole];
  if (roleProfiles && roleProfiles[normalizedSignalType]) {
    return enhanceWithSize(roleProfiles[normalizedSignalType], companySize);
  }

  const defaultProfile = DEFAULT_PROFILES[normalizedSignalType];
  if (defaultProfile) {
    return enhanceWithSize(defaultProfile, companySize);
  }

  return "Something changed recently that's probably making work feel harder right now.";
}

function normalizeSignalType(signalType: string): string {
  const type = signalType.toLowerCase();

  if (type.includes("job") || type.includes("hiring") || type.includes("posting")) {
    return "jobs";
  }
  if (type.includes("fund") || type.includes("capital") || type.includes("raise")) {
    return "funding";
  }
  if (type.includes("layoff") || type.includes("downsize") || type.includes("reduction")) {
    return "layoffs";
  }
  if (type.includes("velocity") || type.includes("acceleration")) {
    return "hiringVelocity";
  }
  if (type.includes("tech") || type.includes("stack") || type.includes("migration") || type.includes("adoption")) {
    return "tech";
  }

  return "jobs";
}

function enhanceWithSize(profile: string, companySize?: number): string {
  if (!companySize) return profile;

  if (companySize < 50) {
    return profile + " Still early so everything feels urgent.";
  }
  if (companySize < 200) {
    return profile + " Getting bigger and things are getting harder.";
  }
  if (companySize < 1000) {
    return profile + " Big enough now that things feel way more complicated.";
  }

  return profile + " Really big company so changes take longer and feel harder.";
}

export function hasPressureProfile(profile?: string | null): boolean {
  return !!profile && profile.trim().length > 0;
}

export function getContextualPressureProfile({
  personTitle,
  companySize,
  signalType,
  roleCount,
  companyName
}: {
  personTitle?: string;
  companySize: number;
  signalType: string;
  roleCount: number;
  companyName?: string;
}): string {
  const size =
    companySize < 50 ? 'small' :
    companySize < 500 ? 'mid' : 'large';

  const normalizedSignal = normalizeSignalType(signalType);

  if (normalizedSignal === 'jobs') {
    if (size === 'large' && roleCount === 1) {
      return 'One open role at a big company usually means a specific team needs help.';
    }
    if (roleCount >= 5) {
      return `${roleCount} roles opening at once usually means the team feels stretched.`;
    }
    return 'Even one open role can mean someone is overloaded right now.';
  }

  if (normalizedSignal === 'funding') {
    return 'New funding usually means pressure to move fast.';
  }

  if (normalizedSignal === 'layoffs') {
    return 'Cuts usually mean teams are asked to do more with less.';
  }

  return 'Something changed recently that made work harder.';
}
