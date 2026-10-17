import { describe, expect, it } from 'vitest';
import { toSeed } from '../src/random/rng.ts';
import { simulate } from '../tools/simulation/report.ts';
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
    expect(report.phrase).toMatchObject({ boundaries: phrases - 1, referenceChanges: 0 });
    expect(report.repetition.distinctBasePatterns).toBe(1 + phrases);
  });

  it('reports reference changes when m32 is high', () => {
    const report = simulate({ bars: 512, seed: toSeed(1), live: liveParams(0.3, 0.35, 0.7, 1) });
    expect(report.phrase.referenceChanges).toBeGreaterThan(report.phrase.refreshable / 2);
    expect(report.phrase.referenceChanges).toBeLessThanOrEqual(report.phrase.refreshable);
  });

  it('reports every pitched part on the chord and within its range', () => {
    const report = simulate({ bars: 512, seed: toSeed(3), live: DEFAULT_LIVE });
    expect(report.harmony.outOfChord).toBe(0);
    expect(report.harmony.outOfRange).toBe(0);
    expect(report.notesPerPair.pad).toBe(1);
    expect(report.notesPerPair.reese).toBeGreaterThan(report.notesPerPair.stab);
  });

  it('reports every cycle length, every lead-in, no part heard outside its scene, and the effects of each build', () => {
    const report = simulate({ bars: 8192, seed: toSeed(42), live: DEFAULT_LIVE });
    const { arrangement, fx } = report;
    expect(Object.values(arrangement.lengths).every((n) => n > 0)).toBe(true);
    expect(Object.values(arrangement.leads).every((n) => n > 0)).toBe(true);
    expect(Object.values(arrangement.extensions).every((n) => n > 0)).toBe(true);
    expect(arrangement.misplaced).toBe(0);
    expect(arrangement.scenes.breakdown.notesPerPair.sub).toBe(0);
    expect(arrangement.scenes.breakdown.drumHitsPerBar).toBeLessThan(arrangement.scenes.drop.drumHitsPerBar);
    const leadIns = [arrangement.leadIns.first, arrangement.leadIns.second];
    for (const counts of leadIns) expect(Object.values(counts).every((n) => n > 0)).toBe(true);
    const builds = leadIns.reduce((sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0), 0);
    const straight = leadIns.reduce((sum, counts) => sum + counts.straight, 0);
    // The last build may end the simulation before its drop lands.
    expect(builds - fx.impact).toBeGreaterThanOrEqual(0);
    expect(builds - fx.impact).toBeLessThanOrEqual(1);
    expect(fx.gap).toBe(builds - straight);
  });
});
