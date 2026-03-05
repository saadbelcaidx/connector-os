/**
 * Canonical Leakage Detection
 *
 * Feeds known canonical data through interpolate() and asserts that
 * no raw canonical string appears in the generated output.
 * Also checks Title Case noun phrase patterns (canonical fingerprint).
 */

import { describe, it, expect } from 'vitest';
import { interpolate } from '../engine';

describe('Canonical leakage detection', () => {
  // Known raw canonical values that should NEVER appear in output
  const CANONICAL_POISON = [
    'Pharmaceutical Development',
    'Executive Recruiting',
    'Cybersecurity Talent',
    'Recent Funding',
    'Active Hiring',
    'Wealth Advisory',
    'M&A Advisory',
    'Clinical Trial Oversight',
    'Investment Opportunities',
    'Growth Capital',
  ];

  // Situation-resolved vars (what the resolver SHOULD produce)
  const situationVars: Record<string, string> = {
    'supply.firstName': 'Jordan',
    'supply.company': 'Acme Corp',
    'demand.firstName': 'Priya',
    'demand.company': 'Helix Bio',
    'momentum': 'a post-funding security build-out',
    'bridge': 'compliance hiring at growth-stage companies',
    'opportunity': 'fill their security bench before Q3',
    // Backward compat aliases
    'supply.offers': 'compliance hiring at growth-stage companies',
    'demand.wants': 'compliance hiring at growth-stage companies',
    'demand.whyNow': 'a post-funding security build-out',
    'signalObservation': 'a post-funding security build-out',
  };

  const TEMPLATES = [
    'Hey {{supply.firstName}} — {{momentum}} is creating openings. {{bridge}} is your lane.',
    'Hey {{demand.firstName}} — {{supply.offers}} and {{demand.whyNow}} are why this matters.',
    '{{signalObservation}}. {{bridge}}. {{opportunity}}.',
  ];

  for (const tpl of TEMPLATES) {
    it(`no canonical leakage in: "${tpl.slice(0, 50)}..."`, () => {
      const output = interpolate(tpl, situationVars);

      for (const poison of CANONICAL_POISON) {
        expect(output).not.toContain(poison);
        expect(output.toLowerCase()).not.toContain(poison.toLowerCase());
      }
    });
  }

  it('interpolate never returns Title Case noun phrases (canonical signature)', () => {
    for (const tpl of TEMPLATES) {
      const output = interpolate(tpl, situationVars);
      // Title Case pattern: two+ consecutive capitalized words (not at sentence start)
      // Allowed: proper nouns (company/person names in identity vars)
      const words = output.split(/\s+/);
      for (let i = 1; i < words.length - 1; i++) {
        const w = words[i];
        const next = words[i + 1];
        // Skip if it's a known identity value
        if (['Acme', 'Corp', 'Helix', 'Bio', 'Jordan', 'Priya'].includes(w)) continue;
        // Flag: consecutive Title Case words mid-sentence = likely canonical leak
        if (/^[A-Z][a-z]+$/.test(w) && next && /^[A-Z][a-z]+$/.test(next)) {
          throw new Error(
            `Possible canonical leak: "${w} ${next}" at position ${i} in: ${output.slice(0, 80)}`
          );
        }
      }
    }
  });

  it('unwhitelisted variables remain unresolved in output', () => {
    // A variable not in the whitelist should pass through as {{raw}}
    const tpl = 'Testing {{supply.keywords}} and {{demand.industry}} leakage';
    const output = interpolate(tpl, situationVars);
    expect(output).toContain('{{supply.keywords}}');
    expect(output).toContain('{{demand.industry}}');
  });
});
