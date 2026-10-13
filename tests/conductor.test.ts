import { describe, expect, it } from 'vitest';
import { REL, TAG, hash, toSeed } from '../src/random/rng.ts';
import { createConductor } from '../src/structure/conductor.ts';
import { liveParams } from './helpers.ts';

describe('conductor', () => {
  const live = liveParams(0.3, 0.25, 0.7);

  it('derives positions within 2, 8 and 32 bars from the pair counter', () => {
    const conductor = createConductor(toSeed(1));
    const contexts = Array.from({ length: 20 }, () => conductor.next(live));
    expect(contexts.map((c) => c.bar)).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    expect(contexts.map((c) => c.pairIn8)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect(contexts.map((c) => c.sectionIn32)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0]);
    expect(contexts.map((c) => c.isSectionStart)).toEqual(contexts.map((c) => c.pairIn8 === 0));
    expect(contexts.map((c) => c.isSectionEnd)).toEqual(contexts.map((c) => c.pairIn8 === 3));
    expect(contexts.map((c) => c.relation)).toEqual(contexts.map((c) => (c.pairIn8 === 3 ? 'variant' : 'repeat')));
  });

  it('derives seeds as the requirements specify', () => {
    const master = toSeed(42);
    const conductor = createConductor(master);
    for (let pair = 0; pair < 12; pair++) {
      const ctx = conductor.next(live);
      const section = hash(master, TAG.section, Math.floor(pair / 4));
      expect(ctx.seeds).toEqual({
        section,
        ornament: hash(section, REL[ctx.relation]),
        fill: hash(section, TAG.fill),
      });
    }
  });

  it('applies m2 and m8 only from the next 8-bar boundary', () => {
    const conductor = createConductor(toSeed(1));
    expect(conductor.next(liveParams(0.1, 0.2, 0.5)).params).toEqual({ m2: 0.1, m8: 0.2 });
    expect(conductor.next(liveParams(0.9, 0.9, 0.5)).params).toEqual({ m2: 0.1, m8: 0.2 });
    conductor.next(liveParams(0.9, 0.9, 0.5));
    conductor.next(liveParams(0.9, 0.9, 0.5));
    expect(conductor.next(liveParams(0.9, 0.8, 0.5)).params).toEqual({ m2: 0.9, m8: 0.8 });
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
