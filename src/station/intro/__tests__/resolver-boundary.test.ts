/**
 * Resolver Boundary Enforcement
 *
 * Static analysis test that reads engine.ts source and fails if any
 * BUILTIN_RESOLVER lambda references entity property paths.
 * Enforces that no resolver reads raw canonical data.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const enginePath = resolve(__dirname, '..', 'engine.ts');
const engineSource = readFileSync(enginePath, 'utf-8');

// Extract the BUILTIN_RESOLVERS block
const resolverBlock = engineSource.match(
  /BUILTIN_RESOLVERS[\s\S]*?\{([\s\S]*?)\n\};/
)?.[1] || '';

describe('Resolver boundary enforcement', () => {
  it('found BUILTIN_RESOLVERS block', () => {
    expect(resolverBlock.length).toBeGreaterThan(0);
  });

  const BANNED_PATHS = [
    'ctx.demand.wants',
    'ctx.demand.offers',
    'ctx.demand.whyNow',
    'ctx.demand.industry',
    'ctx.demand.keywords',
    'ctx.supply.wants',
    'ctx.supply.offers',
    'ctx.supply.whyNow',
    'ctx.supply.industry',
    'ctx.supply.keywords',
    'ctx.demand.who',
    'ctx.supply.who',
  ];

  for (const path of BANNED_PATHS) {
    it(`BUILTIN_RESOLVERS must not reference ${path}`, () => {
      expect(resolverBlock).not.toContain(path);
    });
  }

  const REQUIRED_PATHS = [
    'ctx.situation.momentum',
    'ctx.situation.bridge',
    'ctx.situation.opportunity',
  ];

  for (const path of REQUIRED_PATHS) {
    it(`BUILTIN_RESOLVERS must reference ${path}`, () => {
      expect(resolverBlock).toContain(path);
    });
  }

  it('only reads identity fields (firstName, company) from entity context', () => {
    // Every ctx.demand. or ctx.supply. reference must be .firstName or .company
    const entityRefs = resolverBlock.match(/ctx\.(demand|supply)\.\w+/g) || [];
    const allowed = new Set(['firstName', 'company']);
    for (const ref of entityRefs) {
      const field = ref.split('.')[2];
      expect(
        allowed.has(field),
        `Unexpected entity field access: ${ref} — only firstName and company are allowed`,
      ).toBe(true);
    }
  });
});
