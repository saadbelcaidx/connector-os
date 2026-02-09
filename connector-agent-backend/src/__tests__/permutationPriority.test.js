/**
 * Permutation Priority Tests
 *
 * Verifies provider-aware reordering preserves all patterns
 * and correctly prioritizes by provider.
 */

const { reorderPermutations, classifyPattern } = require('../permutationPriority');

// Sample permutations (same order as generateEmailPermutations)
function samplePermutations(domain = 'company.com') {
  return [
    `john.doe@${domain}`,      // first.last
    `johndoe@${domain}`,       // firstlast
    `jdoe@${domain}`,          // initiallast
    `john@${domain}`,          // first
    `johnd@${domain}`,         // firstinitial
    `j.doe@${domain}`,         // initial.last
    `john.d@${domain}`,        // first.initial
    `john_doe@${domain}`,      // first_last
    `john-doe@${domain}`,      // first-last
    `j_doe@${domain}`,         // initial_last
    `j-doe@${domain}`,         // initial-last
    `doe.john@${domain}`,      // last.first
    `doejohn@${domain}`,       // lastfirst
    `doe_john@${domain}`,      // last_first
    `doe-john@${domain}`,      // last-first
    `doej@${domain}`,          // lastinitial
    `doe.j@${domain}`,         // last.initial
    `djohn@${domain}`,         // initialfirst
    `d.john@${domain}`,        // initial.first
    `doe@${domain}`,           // last
    `jd@${domain}`,            // initials
    `dj@${domain}`,            // initials_rev
  ];
}

describe('classifyPattern', () => {
  test('classifies first.last', () => {
    expect(classifyPattern('john.doe@co.com', 'john', 'doe')).toBe('first.last');
  });

  test('classifies initiallast', () => {
    expect(classifyPattern('jdoe@co.com', 'john', 'doe')).toBe('initiallast');
  });

  test('classifies last.first', () => {
    expect(classifyPattern('doe.john@co.com', 'john', 'doe')).toBe('last.first');
  });

  test('classifies last', () => {
    expect(classifyPattern('doe@co.com', 'john', 'doe')).toBe('last');
  });
});

describe('reorderPermutations', () => {
  test('Google: first.last comes first', () => {
    const perms = samplePermutations();
    const reordered = reorderPermutations(perms, 'google', 'john', 'doe');

    // first.last should be first for Google
    expect(reordered[0]).toBe('john.doe@company.com');
    // firstlast should be second
    expect(reordered[1]).toBe('johndoe@company.com');
    // initiallast should be third
    expect(reordered[2]).toBe('jdoe@company.com');
  });

  test('Microsoft: initiallast comes first', () => {
    const perms = samplePermutations();
    const reordered = reorderPermutations(perms, 'microsoft', 'john', 'doe');

    // initiallast should be first for Microsoft
    expect(reordered[0]).toBe('jdoe@company.com');
    // first.last should be second
    expect(reordered[1]).toBe('john.doe@company.com');
    // firstlast should be third
    expect(reordered[2]).toBe('johndoe@company.com');
  });

  test('unknown provider: keeps original order', () => {
    const perms = samplePermutations();
    const reordered = reorderPermutations(perms, 'unknown', 'john', 'doe');

    // Should be identical
    expect(reordered).toEqual(perms);
  });

  test('preserves all patterns (no additions, no removals)', () => {
    const perms = samplePermutations();

    const googleReorder = reorderPermutations(perms, 'google', 'john', 'doe');
    const msReorder = reorderPermutations(perms, 'microsoft', 'john', 'doe');

    // Same length
    expect(googleReorder.length).toBe(perms.length);
    expect(msReorder.length).toBe(perms.length);

    // Same set of elements
    expect([...googleReorder].sort()).toEqual([...perms].sort());
    expect([...msReorder].sort()).toEqual([...perms].sort());
  });

  test('no duplicates in reordered output', () => {
    const perms = samplePermutations();
    const reordered = reorderPermutations(perms, 'google', 'john', 'doe');

    const unique = new Set(reordered);
    expect(unique.size).toBe(reordered.length);
  });

  test('works with non-standard provider names', () => {
    const perms = samplePermutations();
    const reordered = reorderPermutations(perms, 'zoho', 'john', 'doe');

    // Zoho is not google/microsoft, so original order preserved
    expect(reordered).toEqual(perms);
  });
});
