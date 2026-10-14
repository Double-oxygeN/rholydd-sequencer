import { describe, expect, it } from 'vitest';
import { toSeed } from '../src/random/rng.ts';
import { simulate } from '../tools/simulate.ts';
import { DEFAULT_LIVE, liveParams } from './helpers.ts';

describe('simulate', () => {
  it('reports the backbeat density and the built-in repetition of each 8 bars', () => {
    const report = simulate({ bars: 512, seed: toSeed(42), live: DEFAULT_LIVE });
    expect(report.bars).toBe(512);
    // Two backbeats per bar, minus the few that dropouts and solos silence.
    expect(report.density.snare.base).toBeLessThanOrEqual(2);
    expect(report.density.snare.base).toBeGreaterThan(1.8);
    expect(report.mutation.boundaries).toBe(512 / 8 - 1);
    // Units 2 and 3 of every section repeat unit 1, so at least 2 of every 4 transitions are repeats.
    expect(report.repetition.pair).toBeGreaterThanOrEqual(0.5);
  });

  // Section B is always a fresh pattern, so only the reference and the variants can stay put.
  it('reports no reference change when m32 is 0 and only B differing when m8 is 0 too', () => {
    const report = simulate({ bars: 256, seed: toSeed(1), live: liveParams(0.3, 0, 0.7, 0, 0) });
    const phrases = 256 / 32;
    expect(report.phrase).toEqual({ boundaries: phrases - 1, referenceChanges: 0 });
    expect(report.repetition.distinctBasePatterns).toBe(1 + phrases);
  });

  it('reports reference changes when m32 is high', () => {
    const report = simulate({ bars: 512, seed: toSeed(1), live: liveParams(0.3, 0.35, 0.7, 1) });
    expect(report.phrase.referenceChanges).toBeGreaterThan(report.phrase.boundaries / 2);
  });
});
