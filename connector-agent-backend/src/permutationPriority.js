/**
 * Provider-Aware Permutation Priority
 *
 * Reorders email permutations based on known provider patterns.
 * Same set of permutations — just reordered for faster winner.
 *
 * Google Workspace: first.last@ wins ~95% of the time
 * Microsoft 365: more varied — firstinitiallast@ is common
 * Unknown: keep original order (already optimized by frequency)
 */

// Permutation index names for readability
// These match the patterns in generateEmailPermutations():
//   0: first.last        (john.doe@)
//   1: firstlast         (johndoe@)
//   2: initiallast       (jdoe@)
//   3: first             (john@)
//   4: firstinitial      (johnd@)
//   5: initial.last      (j.doe@)
//   6: first.initial     (john.d@)
//   7: first_last        (john_doe@)
//   8: first-last        (john-doe@)
//   ... (rest are less common)

/**
 * Google priority: first.last dominates.
 * Order: first.last, firstlast, initiallast+first, first, lastinitial
 */
const GOOGLE_PRIORITY = [
  'first.last',      // john.doe@ — 95%+ of Google Workspace
  'firstlast',       // johndoe@
  'initiallast',     // jdoe@
  'first',           // john@
  'last',            // doe@
];

/**
 * Microsoft priority: more varied, initiallast is common.
 * Order: initiallast, first.last, firstlast, last.first, first
 */
const MICROSOFT_PRIORITY = [
  'initiallast',     // jdoe@ — very common in M365
  'first.last',      // john.doe@
  'firstlast',       // johndoe@
  'last.first',      // doe.john@
  'first',           // john@
];

/**
 * Classify a permutation pattern by its structure.
 * Takes a generated email and the known first/last name parts,
 * returns a pattern key.
 */
function classifyPattern(email, firstName, lastName) {
  const local = email.split('@')[0];
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  const fi = f[0];
  const li = l[0];

  // Exact matches (order matters — most specific first)
  if (local === `${f}.${l}`) return 'first.last';
  if (local === `${f}${l}`) return 'firstlast';
  if (local === `${fi}${l}`) return 'initiallast';
  if (local === `${f}`) return 'first';
  if (local === `${f}${li}`) return 'firstinitial';
  if (local === `${fi}.${l}`) return 'initial.last';
  if (local === `${f}.${li}`) return 'first.initial';
  if (local === `${f}_${l}`) return 'first_last';
  if (local === `${f}-${l}`) return 'first-last';
  if (local === `${fi}_${l}`) return 'initial_last';
  if (local === `${fi}-${l}`) return 'initial-last';
  if (local === `${l}.${f}`) return 'last.first';
  if (local === `${l}${f}`) return 'lastfirst';
  if (local === `${l}_${f}`) return 'last_first';
  if (local === `${l}-${f}`) return 'last-first';
  if (local === `${l}${fi}`) return 'lastinitial';
  if (local === `${l}.${fi}`) return 'last.initial';
  if (local === `${li}${f}`) return 'initialfirst';
  if (local === `${li}.${f}`) return 'initial.first';
  if (local === `${l}`) return 'last';
  if (local === `${fi}${li}`) return 'initials';
  if (local === `${li}${fi}`) return 'initials_rev';

  return 'other';
}

/**
 * Reorder permutations based on provider.
 * Same set, different order. No patterns added or removed.
 *
 * @param {string[]} permutations - Generated email permutations
 * @param {string} provider - 'google' | 'microsoft' | 'unknown' | etc.
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string[]} - Reordered permutations
 */
function reorderPermutations(permutations, provider, firstName, lastName) {
  if (provider !== 'google' && provider !== 'microsoft') {
    return permutations; // Unknown — keep original order
  }

  const priority = provider === 'google' ? GOOGLE_PRIORITY : MICROSOFT_PRIORITY;

  // Classify each permutation
  const classified = permutations.map(email => ({
    email,
    pattern: classifyPattern(email, firstName, lastName),
  }));

  // Sort: priority patterns first (in priority order), then the rest in original order
  const prioritized = [];
  const remaining = [];

  for (const patternName of priority) {
    const match = classified.find(c => c.pattern === patternName);
    if (match) {
      prioritized.push(match.email);
    }
  }

  for (const c of classified) {
    if (!prioritized.includes(c.email)) {
      remaining.push(c.email);
    }
  }

  return [...prioritized, ...remaining];
}

module.exports = {
  reorderPermutations,
  classifyPattern,
  GOOGLE_PRIORITY,
  MICROSOFT_PRIORITY,
};
