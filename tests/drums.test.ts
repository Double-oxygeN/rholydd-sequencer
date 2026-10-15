import { describe, expect, it } from 'vitest';
import { canonicalPattern, initialPattern } from '../src/generators/drums/base.ts';
import { satisfiesConstraints } from '../src/generators/drums/constraints.ts';
import { compose } from '../src/generators/drums/compose.ts';
import {
  DROP_LEAD_FILL_KINDS,
  FILL_KINDS,
  PHRASE_FILL_KINDS,
  fill,
  phraseFill,
  type FillKind,
} from '../src/generators/drums/fill.ts';
import { mutate, mutationCount } from '../src/generators/drums/mutate.ts';
import { ORNAMENT_PARTS, ornament } from '../src/generators/drums/ornament.ts';
import { cellAt, motifCell, patternsEqual } from '../src/generators/drums/pattern.ts';
import { PROFILES, isAnchorStep, slotsOf, stepWeight } from '../src/generators/drums/weights.ts';
import { ALL_STEPS, PARTS } from '../src/generators/types.ts';
import { createRng, hash, toSeed } from '../src/random/rng.ts';
import { clampUnit } from '../src/units.ts';
import { SEEDS, liveParams, run, type GeneratedPair } from './helpers.ts';

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

  it('rounds the mutation count up with probability equal to the fraction', () => {
    const rng = createRng(toSeed(5));
    const n = 20_000;
    for (const expected of [0, 0.28, 0.42, 1.05, 2.8]) {
      const counts = Array.from({ length: n }, () => mutationCount(expected, rng));
      for (const c of counts) expect([Math.floor(expected), Math.ceil(expected)]).toContain(c);
      expect(Math.abs(counts.reduce((a, b) => a + b, 0) / n - expected)).toBeLessThan(0.02);
    }
  });

  it('keeps mutating sparse parts instead of freezing them', () => {
    const changed = { kick: 0, hat: 0 };
    let pattern = canonicalPattern();
    for (let section = 0; section < 500; section++) {
      const next = mutate(pattern, hash(11, section), clampUnit(0.35));
      for (const part of ['kick', 'hat'] as const) {
        if (slotsOf(part).some((slot) => motifCell(next, part, slot) !== motifCell(pattern, part, slot))) changed[part]++;
      }
      pattern = next;
    }
    // Probabilistic rounding gives at least 0.28 expected mutations per boundary even at the sparsest pattern.
    expect(changed.kick).toBeGreaterThan(100);
    expect(changed.hat).toBeGreaterThan(100);
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
      for (const event of ornament(base, hash(i), clampUnit(1), clampUnit(1))) {
        expect(ORNAMENT_PARTS).toContain(event.part);
        expect(event.step).toBeGreaterThanOrEqual(24);
        expect(event.velocity).toBeGreaterThanOrEqual(0.3);
        expect(event.velocity).toBeLessThanOrEqual(0.6);
        expect(cellAt(base, event.part, event.step)).toBeNull();
      }
    }
  });

  it('adds nothing when m2 is 0', () => {
    for (let i = 0; i < 50; i++) expect(ornament(canonicalPattern(), hash(i), clampUnit(0), clampUnit(1))).toEqual([]);
  });
});

describe('fill', () => {
  it('fires according to the intensity', () => {
    for (let i = 0; i < 50; i++) {
      expect(fill(hash(i), clampUnit(0), 'chance')).toBeNull();
      expect(fill(hash(i), clampUnit(1), 'chance')).not.toBeNull();
    }
  });

  it('keeps the same template when only the intensity changes', () => {
    for (let i = 0; i < 50; i++) {
      const strong = fill(hash(i), clampUnit(1), 'chance');
      const weak = fill(hash(i), clampUnit(0.5), 'chance');
      if (weak !== null) expect(weak).toEqual(strong);
    }
  });

  it('covers the end of the 8th bar, choosing 16 and 32 steps less often than 8', () => {
    const kinds = new Set<string>();
    const lengths = new Map<number, number>();
    for (let i = 0; i < 4000; i++) {
      const result = fill(hash(i), clampUnit(1), 'chance')!;
      kinds.add(result.kind);
      lengths.set(result.length, (lengths.get(result.length) ?? 0) + 1);
      expect(result.steps).toEqual(ALL_STEPS.slice(32 - result.length));
      for (const event of result.events) expect(result.steps).toContain(event.step);
    }
    expect([...kinds].sort()).toEqual([...FILL_KINDS].sort());
    expect([...lengths.keys()].sort((a, b) => a - b)).toEqual([4, 8, 16, 32]);
    expect(lengths.get(16)!).toBeLessThan(lengths.get(8)!);
    expect(lengths.get(32)!).toBeLessThan(lengths.get(16)!);
  });
});

describe('fill cues', () => {
  it('always fills a scene change unless the intensity is 0, keeping the drawn kind and length', () => {
    for (let i = 0; i < 200; i++) {
      expect(fill(hash(i), clampUnit(0), 'certain')).toBeNull();
      const certain = fill(hash(i), clampUnit(0.01), 'certain')!;
      const drawn = fill(hash(i), clampUnit(1), 'chance')!;
      expect([certain.kind, certain.length]).toEqual([drawn.kind, drawn.length]);
    }
  });

  it('rolls the snare at the end of a breakdown with the drawn length', () => {
    for (let i = 0; i < 200; i++) {
      const roll = fill(hash(i), clampUnit(0.5), 'drumsReturn')!;
      expect(roll.kind).toBe('snareRoll');
      expect(roll.length).toBe(fill(hash(i), clampUnit(1), 'chance')!.length);
    }
  });

  it('picks only rolls before a drop, keeping the drawn length', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const intoDrop = phraseFill(hash(i), clampUnit(1), 'intoDrop')!;
      kinds.add(intoDrop.kind);
      expect(intoDrop.length).toBe(phraseFill(hash(i), clampUnit(1), 'free')!.length);
      expect(phraseFill(hash(i), clampUnit(0), 'intoDrop')).toBeNull();
    }
    expect([...kinds].sort()).toEqual([...DROP_LEAD_FILL_KINDS].sort());
  });
});

describe('phraseFill', () => {
  it('always plays unless the intensity is 0', () => {
    for (let i = 0; i < 50; i++) {
      expect(phraseFill(hash(i), clampUnit(0), 'free')).toBeNull();
      expect(phraseFill(hash(i), clampUnit(0.01), 'free')).not.toBeNull();
    }
  });

  it('covers the whole 32nd bar or bars 31 and 32, preferring the shorter one', () => {
    const kinds = new Set<string>();
    const lengths = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      const result = phraseFill(hash(i), clampUnit(1), 'free')!;
      kinds.add(result.kind);
      lengths.set(result.length, (lengths.get(result.length) ?? 0) + 1);
      expect(result.steps).toEqual(ALL_STEPS.slice(32 - result.length));
    }
    expect([...kinds].sort()).toEqual([...PHRASE_FILL_KINDS].sort());
    expect([...lengths.keys()].sort((a, b) => a - b)).toEqual([16, 32]);
    expect(lengths.get(32)!).toBeLessThan(lengths.get(16)!);
  });

  const ofKind = (kind: FillKind) =>
    Array.from({ length: 400 }, (_, i) => phraseFill(hash(i), clampUnit(1), 'free')!).filter((f) => f.kind === kind);

  it('accelerates a snare roll from 8ths to 16ths', () => {
    for (const result of ofKind('accelRoll')) {
      const half = result.length / 2;
      const start = 32 - result.length;
      expect(result.events.map((e) => e.step - start)).toEqual([
        ...Array.from({ length: half / 2 }, (_, i) => i * 2),
        ...Array.from({ length: half }, (_, i) => half + i),
      ]);
      expect(result.events.every((e) => e.part === 'snare')).toBe(true);
    }
  });

  it('drops out for the first half and rolls the snare for the second', () => {
    for (const result of ofKind('dropRoll')) {
      const half = result.length / 2;
      expect(result.events.map((e) => e.step)).toEqual(ALL_STEPS.slice(32 - half));
      const velocities = result.events.map((e) => e.velocity);
      for (let i = 1; i < velocities.length; i++) expect(velocities[i]).toBeGreaterThan(velocities[i - 1]!);
      expect(velocities.at(-1)).toBeCloseTo(1);
    }
  });
});

describe('compose with a fill', () => {
  const closing = SEEDS.flatMap((seed) => run(seed, 2048, () => liveParams(0.5, 0.5, 1))).filter(
    (pair) => pair.layers.fill !== null,
  );
  const inFill = (pair: GeneratedPair, events = pair.events) =>
    events.filter((e) => pair.layers.fill!.steps.includes(e.step));
  const withoutFill = (pair: GeneratedPair) => compose(pair.layers.base, pair.layers.ornaments, null);
  const ofKind = (kind: FillKind) => {
    const pairs = closing.filter((pair) => pair.layers.fill!.kind === kind);
    expect(pairs.length).toBeGreaterThan(0);
    return pairs;
  };

  it('silences every part, including the backbeat, during a dropout', () => {
    for (const pair of ofKind('dropout')) expect(inFill(pair)).toEqual([]);
  });

  it('plays only the soloed part, exactly as it would sound without the fill', () => {
    for (const [kind, part] of [
      ['kickSolo', 'kick'],
      ['snareSolo', 'snare'],
      ['hatSolo', 'hat'],
    ] as const) {
      for (const pair of ofKind(kind)) {
        expect(inFill(pair)).toEqual(inFill(pair, withoutFill(pair)).filter((e) => e.part === part));
      }
    }
  });

  it('rolls the snare on every step with rising velocity', () => {
    for (const pair of ofKind('snareRoll')) {
      const hits = inFill(pair);
      expect(hits.map((e) => e.step)).toEqual(pair.layers.fill!.steps);
      expect(hits.every((e) => e.part === 'snare')).toBe(true);
      for (let i = 1; i < hits.length; i++) expect(hits[i]!.velocity).toBeGreaterThan(hits[i - 1]!.velocity);
    }
  });

  it('rushes ghosts around the backbeat snare', () => {
    for (const pair of ofKind('ghostRush')) {
      for (const event of inFill(pair)) {
        expect(event.part).toBe(isAnchorStep('snare', event.step) ? 'snare' : 'ghost');
      }
    }
  });
});
