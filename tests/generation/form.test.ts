import { describe, expect, it } from 'vitest';
import { satisfiesConstraints } from '../../src/generators/drums/constraints.ts';
import { PART_TAG, mutate } from '../../src/generators/drums/mutate.ts';
import { motifCell, motifsEqual, patternsEqual } from '../../src/generators/drums/pattern.ts';
import { slotsOf } from '../../src/generators/drums/weights.ts';
import { PARTS } from '../../src/generators/types.ts';
import { REL, TAG, hash, toSeed } from '../../src/random/rng.ts';
import { createConductor, type Context } from '../../src/structure/conductor.ts';
import { sectionEnergy } from '../../src/structure/energy.ts';
import { DEFAULT_KEY } from '../../src/structure/key.ts';
import { clampUnit } from '../../src/units.ts';
import { PARAM_SETS, SEEDS, TUNING, liveParams, run } from '../support/helpers.ts';

/** Every seed the generators derive from one context, listed per use. */
function derivedSeeds(ctx: Context): number[] {
  const { cycle, phrase, section, ornament, fill } = ctx.seeds;
  return [
    cycle,
    hash(cycle, TAG.layout),
    hash(cycle, TAG.progression),
    hash(cycle, TAG.subStyle),
    hash(cycle, TAG.reeseStyle),
    hash(cycle, TAG.stabStyle),
    phrase,
    section,
    ornament,
    fill,
    hash(phrase, TAG.base),
    hash(phrase, TAG.transition),
    hash(phrase, TAG.subStyle),
    hash(phrase, TAG.progression),
    hash(phrase, TAG.reeseStyle),
    hash(phrase, TAG.stabStyle),
    ...[cycle, section].flatMap((seed) =>
      [REL.repeat, REL.variant].flatMap((rel) =>
        [TAG.subRhythm, TAG.subPitch, TAG.reeseRhythm, TAG.reesePitch, TAG.stabRhythm].map((tag) => hash(seed, tag, rel)),
      ),
    ),
    ...Array.from({ length: 11 }, (_, attempt) => hash(phrase, TAG.transition, attempt)),
    ...PARTS.flatMap((part) => [
      hash(phrase, TAG.mutate32, PART_TAG[part]),
      hash(section, TAG.mutate, PART_TAG[part]),
      hash(section, TAG.thin, PART_TAG[part]),
    ]),
  ];
}

const BARS = 1024;

describe('form: conductor', () => {
  const live = liveParams(0.3, 0.25, 0.7);

  it('derives positions within 2, 8 and 32 bars from the pair counter', () => {
    const conductor = createConductor({ seed: toSeed(1), initialKey: DEFAULT_KEY, tuning: TUNING });
    const contexts = Array.from({ length: 20 }, () => conductor.next(live));
    expect(contexts.map((c) => c.bar)).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    expect(contexts.map((c) => c.pairIn8)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect(contexts.map((c) => c.sectionRole.sectionIn32)).toEqual([
      0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0,
    ]);
    expect(contexts.map((c) => c.phrase)).toEqual(contexts.map((_, i) => Math.floor(i / 16)));
    expect(contexts.map((c) => c.isSectionStart)).toEqual(contexts.map((c) => c.pairIn8 === 0));
    expect(contexts.map((c) => c.isSectionEnd)).toEqual(contexts.map((c) => c.pairIn8 === 3));
    expect(contexts.map((c) => c.relation)).toEqual(contexts.map((c) => (c.pairIn8 === 3 ? 'variant' : 'repeat')));
  });

  it('relates the four sections of 32 bars as repeat, variant, transition, variant', () => {
    const conductor = createConductor({ seed: toSeed(1), initialKey: DEFAULT_KEY, tuning: TUNING });
    const sections = Array.from({ length: 16 }, () => conductor.next(live)).filter((c) => c.isSectionStart);
    expect(sections.map((c) => c.sectionRole.relation)).toEqual(['repeat', 'variant', 'transition', 'variant']);
    expect(sections.map((c) => c.sectionRole.isPhraseStart)).toEqual([true, false, false, false]);
    expect(sections.map((c) => c.sectionRole.isPhraseEnd)).toEqual([false, false, false, true]);
  });

  it('derives seeds through the 32-bar phrase as the requirements specify', () => {
    const master = toSeed(42);
    const conductor = createConductor({ seed: master, initialKey: DEFAULT_KEY, tuning: TUNING });
    for (let pair = 0; pair < 40; pair++) {
      const ctx = conductor.next(live);
      const phrase = hash(master, TAG.phrase, Math.floor(pair / 16));
      const section = hash(phrase, TAG.section, Math.floor(pair / 4) % 4);
      expect(ctx.seeds).toEqual({
        cycle: hash(master, TAG.cycle, ctx.cycle),
        phrase,
        section,
        ornament: hash(section, TAG.ornament, REL[ctx.relation]),
        fill: hash(section, TAG.fill),
      });
    }
  });

  // Two uses sharing a seed would share a random stream, as ornaments and fills of variant units once did.
  it('never derives the same seed for two different uses', () => {
    const conductor = createConductor({ seed: toSeed(42), initialKey: DEFAULT_KEY, tuning: TUNING });
    for (let pair = 0; pair < 64; pair++) {
      const seeds = derivedSeeds(conductor.next(live));
      expect(new Set(seeds).size).toBe(seeds.length);
    }
  });

  it('applies m2 and m8 only from the next 8-bar boundary', () => {
    const conductor = createConductor({ seed: toSeed(1), initialKey: DEFAULT_KEY, tuning: TUNING });
    expect(conductor.next(liveParams(0.1, 0.2, 0.5)).params).toMatchObject({ m2: 0.1, m8: 0.2 });
    expect(conductor.next(liveParams(0.9, 0.9, 0.5)).params).toMatchObject({ m2: 0.1, m8: 0.2 });
    conductor.next(liveParams(0.9, 0.9, 0.5));
    conductor.next(liveParams(0.9, 0.9, 0.5));
    expect(conductor.next(liveParams(0.9, 0.8, 0.5)).params).toMatchObject({ m2: 0.9, m8: 0.8 });
  });

  it('applies m32 only from the next 32-bar boundary', () => {
    const conductor = createConductor({ seed: toSeed(1), initialKey: DEFAULT_KEY, tuning: TUNING });
    const m32s = Array.from({ length: 20 }, (_, i) => conductor.next(liveParams(0.3, 0.3, 0.5, i / 100)).params.m32);
    expect(m32s).toEqual([...new Array<number>(16).fill(0), ...new Array<number>(4).fill(0.16)]);
  });

  it('reads the fill intensity when the 8th bar is generated', () => {
    const conductor = createConductor({ seed: toSeed(1), initialKey: DEFAULT_KEY, tuning: TUNING });
    conductor.next(liveParams(0.3, 0.3, 0.1));
    conductor.next(liveParams(0.3, 0.3, 0.2));
    conductor.next(liveParams(0.3, 0.3, 0.3));
    const closing = conductor.next(liveParams(0.3, 0.3, 0.9));
    expect(closing.isSectionEnd && closing.fillIntensity).toBe(0.9);
  });
});

describe('form: 32 bars', () => {
  it('ends every 32 bars with a 16- or 32-step fill unless the fill intensity is 0', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!(ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd)) continue;
          if (params.fillIntensity === 0) expect(layers.fill).toBeNull();
          else expect([16, 32]).toContain(layers.fill?.length);
        }
      }
    }
  });

  it('changes the reference pattern only at 32-bar boundaries', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const pairs = run(seed, BARS, () => params);
        let changes = 0;
        for (let i = 1; i < pairs.length; i++) {
          if (!patternsEqual(pairs[i - 1]!.layers.reference, pairs[i]!.layers.reference)) {
            changes++;
            const { ctx } = pairs[i]!;
            expect(ctx.isSectionStart && ctx.sectionRole.isPhraseStart).toBe(true);
          }
        }
        if (params.m32 >= 0.5) expect(changes).toBeGreaterThan(0);
        if (params.m32 === 0) expect(changes).toBe(0);
      }
    }
  });

  it('plays the reference in A and derives A\' and A\'\' from it with a single mutation each', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!ctx.isSectionStart) continue;
          switch (ctx.sectionRole.relation) {
            case 'repeat':
              expect(layers.sectionBase).toEqual(layers.reference);
              break;
            case 'variant':
              expect(layers.sectionBase).toEqual(
                mutate(layers.reference, ctx.seeds.section, ctx.params.m8, 'variant'),
              );
              break;
            case 'transition':
              break;
          }
        }
      }
    }
  });

  it('gives every section B a kick different from the reference', () => {
    let transitions = 0;
    for (const seed of [...SEEDS, ...Array.from({ length: 20 }, (_, i) => 1000 + i)]) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!ctx.isSectionStart || ctx.sectionRole.relation !== 'transition') continue;
          transitions++;
          expect(motifsEqual(layers.sectionBase, layers.reference, 'kick')).toBe(false);
        }
      }
    }
    expect(transitions).toBeGreaterThan(1000);
  });
});

describe('form: energy curve', () => {
  it('keeps the energy constant within each 8 bars', () => {
    for (const seed of SEEDS) {
      const pairs = run(seed, BARS, (i) => liveParams(0.3, 0.35, 0.7, 0.6, (i % 7) / 6));
      for (let i = 0; i < pairs.length; i += 4) {
        const energies = pairs.slice(i, i + 4).map((p) => p.ctx.energy);
        expect(new Set(energies).size).toBe(1);
        const bases = pairs.slice(i, i + 4).map((p) => p.layers.base);
        for (const base of bases) expect(base).toEqual(bases[0]);
      }
    }
  });

  it('thins nothing when the energy depth is 0', () => {
    for (const seed of SEEDS) {
      for (const { ctx, layers } of run(seed, BARS, () => liveParams(1, 1, 1, 1, 0))) {
        expect(ctx.energy).toBe(1);
        expect(layers.base).toEqual(layers.sectionBase);
      }
    }
  });

  it('only removes non-anchor hits and never drops below the minimum count', () => {
    for (const seed of SEEDS) {
      for (const { layers } of run(seed, BARS, () => liveParams(1, 1, 1, 1, 1))) {
        expect(satisfiesConstraints(layers.base)).toBe(true);
        for (const part of PARTS) {
          for (const slot of slotsOf(part)) {
            if (motifCell(layers.base, part, slot) !== null) {
              expect(motifCell(layers.base, part, slot)).toBe(motifCell(layers.sectionBase, part, slot));
            }
          }
        }
      }
    }
  });

  // Phase 3 gives every scene its own energy; drops keep the phase 1 curve so their 32 bars still rise and fall.
  it('follows the phase 1 curve within every drop', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 0.5, 1]) {
        for (const { ctx } of run(seed, BARS, () => liveParams(0.3, 0.35, 0.7, 0.6, depth))) {
          if (ctx.sceneRole.scene !== 'drop') continue;
          expect(ctx.energy).toBe(sectionEnergy(ctx.sectionRole.sectionIn32, clampUnit(depth), TUNING.energy.phrase));
        }
      }
    }
  });
});

describe('form: repeat units', () => {
  it('repeats the same events for the three repeat units of each 8 bars', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const pairs = run(seed, BARS, () => params);
        for (let i = 0; i < pairs.length; i += 4) {
          expect(pairs[i + 1]!.events).toEqual(pairs[i]!.events);
          expect(pairs[i + 2]!.events).toEqual(pairs[i]!.events);
        }
      }
    }
  });
});
