import { describe, expect, it } from 'vitest';
import { canonicalPattern, initialPattern } from '../src/generators/drums/base.ts';
import { satisfiesConstraints } from '../src/generators/drums/constraints.ts';
import { FILL_KINDS, fill } from '../src/generators/drums/fill.ts';
import { mutate } from '../src/generators/drums/mutate.ts';
import { ORNAMENT_PARTS, ornament } from '../src/generators/drums/ornament.ts';
import { cellAt, patternsEqual } from '../src/generators/drums/pattern.ts';
import { PROFILES, isAnchorStep, stepWeight } from '../src/generators/drums/weights.ts';
import { ALL_STEPS, PARTS } from '../src/generators/types.ts';
import { hash, toSeed } from '../src/random/rng.ts';
import { clampUnit } from '../src/units.ts';
import { liveParams, run } from './helpers.ts';

const inCategory = (w: number) => w === 0 || w === 1 || (w >= 0.1 && w <= 0.3) || (w >= 0.5 && w <= 0.8);

describe('weight table', () => {
  it('uses only the four weight categories', () => {
    for (const part of PARTS) expect(PROFILES[part].weights.every(inCategory)).toBe(true);
  });

  it('anchors the kick on step 0 and the snare on beats 2 and 4', () => {
    expect(ALL_STEPS.filter((s) => isAnchorStep('kick', s))).toEqual([0]);
    expect(ALL_STEPS.filter((s) => isAnchorStep('snare', s))).toEqual([4, 12, 20, 28]);
    expect(ALL_STEPS.filter((s) => isAnchorStep('hat', s) || isAnchorStep('ghost', s))).toEqual([]);
  });

  it('allows no snare besides the backbeat', () => {
    expect(ALL_STEPS.filter((s) => stepWeight('snare', s) > 0)).toEqual([4, 12, 20, 28]);
  });

  it('derives the hat from one beat of weights', () => {
    expect(PROFILES.hat.period).toBe(4);
    expect(PROFILES.hat.weights).toEqual([0.5, 0.1, 0.8, 0.2]);
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

describe('ornament', () => {
  it('adds only hats and ghosts to steps 24 to 31 with velocity 0.3 to 0.6', () => {
    const base = canonicalPattern();
    for (let i = 0; i < 200; i++) {
      for (const event of ornament(base, hash(i), clampUnit(1))) {
        expect(ORNAMENT_PARTS).toContain(event.part);
        expect(event.step).toBeGreaterThanOrEqual(24);
        expect(event.velocity).toBeGreaterThanOrEqual(0.3);
        expect(event.velocity).toBeLessThanOrEqual(0.6);
        expect(cellAt(base, event.part, event.step)).toBeNull();
      }
    }
  });

  it('adds nothing when m2 is 0', () => {
    for (let i = 0; i < 50; i++) expect(ornament(canonicalPattern(), hash(i), clampUnit(0))).toEqual([]);
  });
});

describe('fill', () => {
  it('fires according to the intensity', () => {
    for (let i = 0; i < 50; i++) {
      expect(fill(hash(i), clampUnit(0))).toBeNull();
      expect(fill(hash(i), clampUnit(1))).not.toBeNull();
    }
  });

  it('keeps the same template when only the intensity changes', () => {
    for (let i = 0; i < 50; i++) {
      const strong = fill(hash(i), clampUnit(1));
      const weak = fill(hash(i), clampUnit(0.5));
      if (weak !== null) expect(weak).toEqual(strong);
    }
  });

  it('covers the last 1 or 2 beats without replacing the backbeat', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const result = fill(hash(i), clampUnit(1))!;
      kinds.add(result.kind);
      const lastBeats = ALL_STEPS.slice(32 - result.length).filter((s) => s !== 28);
      expect(result.steps).toEqual(lastBeats);
      for (const event of result.events) expect(result.steps).toContain(event.step);
    }
    expect([...kinds].sort()).toEqual([...FILL_KINDS].sort());
  });
});

describe('compose with a fill', () => {
  it('keeps only the snare on a backbeat inside the fill', () => {
    const pairs = run(42, 512, () => liveParams(1, 0.5, 1));
    const closing = pairs.filter((p) => p.layers.fill !== null);
    expect(closing.length).toBeGreaterThan(0);
    for (const { events } of closing) {
      expect(events.filter((e) => e.step === 28).map((e) => e.part)).toEqual(['snare']);
    }
  });
});
