import { describe, expect, it } from 'vitest';
import { canonicalPattern, initialPattern } from '../src/generators/drums/base.ts';
import { satisfiesConstraints } from '../src/generators/drums/constraints.ts';
import { mutate } from '../src/generators/drums/mutate.ts';
import { patternsEqual } from '../src/generators/drums/pattern.ts';
import { PROFILES, isAnchor } from '../src/generators/drums/weights.ts';
import { ALL_STEPS, PARTS } from '../src/generators/types.ts';
import { hash, toSeed } from '../src/random/rng.ts';
import { clampUnit } from '../src/units.ts';

const inCategory = (w: number) => w === 0 || w === 1 || (w >= 0.1 && w <= 0.3) || (w >= 0.5 && w <= 0.8);

describe('weight table', () => {
  it('uses only the four weight categories', () => {
    for (const part of PARTS) expect(PROFILES[part].weights.every(inCategory)).toBe(true);
  });

  it('anchors the kick on step 0 and the snare on beats 2 and 4', () => {
    expect(ALL_STEPS.filter((s) => isAnchor('kick', s))).toEqual([0]);
    expect(ALL_STEPS.filter((s) => isAnchor('snare', s))).toEqual([4, 12, 20, 28]);
    expect(ALL_STEPS.filter((s) => isAnchor('hat', s) || isAnchor('ghost', s))).toEqual([]);
  });

  it('builds a canonical two-step that satisfies every constraint', () => {
    expect(satisfiesConstraints(canonicalPattern())).toBe(true);
  });
});

describe('initialPattern', () => {
  it('always satisfies the constraints', () => {
    for (let i = 0; i < 500; i++) expect(satisfiesConstraints(initialPattern(hash(i)))).toBe(true);
  });
});

describe('mutate', () => {
  it('keeps the constraints over many accumulated mutations', () => {
    let pattern = canonicalPattern();
    for (let section = 0; section < 2000; section++) {
      pattern = mutate(pattern, hash(7, section), clampUnit(1));
      expect(satisfiesConstraints(pattern)).toBe(true);
    }
  });

  it('does nothing when m8 is 0', () => {
    const base = canonicalPattern();
    expect(patternsEqual(mutate(base, toSeed(3), clampUnit(0)), base)).toBe(true);
  });

  it('changes the pattern when m8 is high', () => {
    const base = canonicalPattern();
    const changed = Array.from({ length: 20 }, (_, i) => !patternsEqual(mutate(base, hash(i), clampUnit(1)), base));
    expect(changed.filter(Boolean).length).toBeGreaterThan(15);
  });
});
