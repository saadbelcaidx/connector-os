/**
 * Documentation URLs for context links
 * Points to /library which contains all documentation
 */

export const DOCS_BASE_URL = '/library';

export const DOCS = {
  modes: `${DOCS_BASE_URL}?page=modes`,
  modeAnchor: (mode: string) => `${DOCS_BASE_URL}?page=modes#${mode}`,
  scrapers: `${DOCS_BASE_URL}?page=signals`,
  supportedScrapers: `${DOCS_BASE_URL}?page=signals`,
  evidence: `${DOCS_BASE_URL}?page=signals`,
  jobSignal: `${DOCS_BASE_URL}?page=signals`,
  fundingSignal: `${DOCS_BASE_URL}?page=signals`,
  doctrine: `${DOCS_BASE_URL}?page=connector`,
  lanes: `${DOCS_BASE_URL}?page=architecture`,
  troubleshooting: `${DOCS_BASE_URL}?page=faq`,
} as const;
