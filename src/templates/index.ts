/**
 * TEMPLATES — The Intros
 *
 * Two scrapers. Simple templates.
 *
 * DEMAND (Startup Jobs): "Hey [name] — noticed [company] is hiring for [role]. I know someone. Want an intro?"
 * SUPPLY (B2B Contacts): "Hey [name] — got a lead. [company] is hiring for [role]. Worth a look?"
 */

import { NormalizedRecord } from '../schemas';
import { humanGreeting } from '../services/AIService';

// =============================================================================
// DEMAND TEMPLATE
// =============================================================================

/**
 * Intro to DEMAND side (company hiring).
 *
 * Signal = job title from Startup Jobs scraper
 */
export function generateDemandIntro(record: NormalizedRecord): string {
  const firstName = record.firstName || record.fullName?.split(' ')[0];
  const { greeting } = humanGreeting(firstName);
  const company = record.company || 'your company';
  const role = cleanRole(record.signal);

  return `${greeting} — noticed ${company} is hiring for ${role}. I know someone who does this. Want an intro?`;
}

// =============================================================================
// SUPPLY TEMPLATE
// =============================================================================

/**
 * Intro to SUPPLY side (recruiter/agency).
 *
 * bestDemandMatch = the company they're being matched to
 */
export function generateSupplyIntro(
  provider: NormalizedRecord,
  bestDemandMatch: NormalizedRecord
): string {
  const firstName = provider.firstName || provider.fullName?.split(' ')[0];
  const { greeting } = humanGreeting(firstName);
  const company = bestDemandMatch.company || 'a company';
  const role = cleanRole(bestDemandMatch.signal);

  return `${greeting} — got a lead. ${company} is hiring for ${role}. Worth a look?`;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Clean up a job title for use in intro.
 * "software engineer ii, frontend platform" → "a Software Engineer"
 */
function cleanRole(signal: string): string {
  if (!signal) return 'a role';

  // Remove level indicators (ii, iii, I, II, senior, junior, etc.)
  let clean = signal
    .replace(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b/gi, '')
    .replace(/\b(senior|junior|staff|principal|lead|head of)\b/gi, '')
    .replace(/,.*$/, '')  // Remove everything after comma
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of each word
  clean = clean
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Add article
  const startsWithVowel = /^[aeiou]/i.test(clean);
  return startsWithVowel ? `an ${clean}` : `a ${clean}`;
}

/**
 * Check if an intro is valid.
 */
export function isValidIntro(intro: string): boolean {
  if (!intro || intro.length < 20) return false;
  const lower = intro.toLowerCase();
  // Accept both "hey" and "hi" starters
  if (!lower.startsWith('hey') && !lower.startsWith('hi')) return false;
  if (!intro.includes('?')) return false;
  return true;
}
