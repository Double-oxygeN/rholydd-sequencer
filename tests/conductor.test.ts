import { describe, expect, it } from 'vitest';
import { PART_TAG } from '../src/generators/drums/mutate.ts';
import { PARTS } from '../src/generators/types.ts';
import { REL, TAG, hash, toSeed } from '../src/random/rng.ts';
import { createConductor, type Context } from '../src/structure/conductor.ts';
import { liveParams } from './helpers.ts';

describe('conductor', () => {
  const live = liveParams(0.3, 0.25, 0.7);

  it('derives positions within 2, 8 and 32 bars from the pair counter', () => {
    const conductor = createConductor(toSeed(1));
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
    const conductor = createConductor(toSeed(1));
    const sections = Array.from({ length: 16 }, () => conductor.next(live)).filter((c) => c.isSectionStart);
    expect(sections.map((c) => c.sectionRole.relation)).toEqual(['repeat', 'variant', 'transition', 'variant']);
    expect(sections.map((c) => c.sectionRole.isPhraseStart)).toEqual([true, false, false, false]);
    expect(sections.map((c) => c.sectionRole.isPhraseEnd)).toEqual([false, false, false, true]);
  });

  it('derives seeds through the 32-bar phrase as the requirements specify', () => {
    const master = toSeed(42);
    const conductor = createConductor(master);
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
    const conductor = createConductor(toSeed(42));
    for (let pair = 0; pair < 64; pair++) {
      const seeds = derivedSeeds(conductor.next(live));
      expect(new Set(seeds).size).toBe(seeds.length);
    }
  });

  it('applies m2 and m8 only from the next 8-bar boundary', () => {
    const conductor = createConductor(toSeed(1));
    expect(conductor.next(liveParams(0.1, 0.2, 0.5)).params).toMatchObject({ m2: 0.1, m8: 0.2 });
    expect(conductor.next(liveParams(0.9, 0.9, 0.5)).params).toMatchObject({ m2: 0.1, m8: 0.2 });
    conductor.next(liveParams(0.9, 0.9, 0.5));
    conductor.next(liveParams(0.9, 0.9, 0.5));
    expect(conductor.next(liveParams(0.9, 0.8, 0.5)).params).toMatchObject({ m2: 0.9, m8: 0.8 });
  });

  it('applies m32 only from the next 32-bar boundary', () => {
    const conductor = createConductor(toSeed(1));
    const m32s = Array.from({ length: 20 }, (_, i) => conductor.next(liveParams(0.3, 0.3, 0.5, i / 100)).params.m32);
    expect(m32s).toEqual([...new Array<number>(16).fill(0), ...new Array<number>(4).fill(0.16)]);
  });

  it('reads the fill intensity when the 8th bar is generated', () => {
    const conductor = createConductor(toSeed(1));
    conductor.next(liveParams(0.3, 0.3, 0.1));
    conductor.next(liveParams(0.3, 0.3, 0.2));
    conductor.next(liveParams(0.3, 0.3, 0.3));
    const closing = conductor.next(liveParams(0.3, 0.3, 0.9));
    expect(closing.isSectionEnd && closing.fillIntensity).toBe(0.9);
  });
});

/** Every seed the generators derive from one context, listed per use. */
function derivedSeeds(ctx: Context): number[] {
  const { cycle, phrase, section, ornament, fill } = ctx.seeds;
  return [
    cycle,
    hash(cycle, TAG.layout),
    hash(cycle, TAG.progression),
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
    ...[phrase, section].flatMap((seed) =>
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
