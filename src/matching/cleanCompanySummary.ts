/**
 * CLEAN COMPANY SUMMARY — Sanitize raw descriptions for intro slots
 *
 * Raw companyDescription contains bullets, colons, marketing garbage.
 * This function extracts ONE safe clause.
 */

export function cleanCompanySummary(description?: string): string {
  if (!description) return '';

  return description
    .split(/[\n•\-–—:]/)[0]
    .replace(/\s+/g, ' ')
    .replace(/(is|are)\s+(a|an)\s+/i, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * PRE-FLIGHT SLOT VALIDATION — Block malformed text
 */
export function isSafeSlot(value?: string): boolean {
  if (!value) return false;
  if (value.length < 3) return false;
  if (/[:\n•—]/.test(value)) return false;
  return true;
}
