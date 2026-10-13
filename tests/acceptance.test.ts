import { describe, expect, it } from 'vitest';
import { createDrumGenerator } from '../src/generators/drums/index.ts';
import { cellAt, patternsEqual } from '../src/generators/drums/pattern.ts';
import { ALL_STEPS, type NoteEvent } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { createConductor } from '../src/structure/conductor.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, eventsAt, liveParams, run } from './helpers.ts';

// Automated acceptance criteria from docs/specs/mvp/requirements.md.

function generateBars(seed: number, bars: number): (readonly NoteEvent[])[] {
  const conductor = createConductor(toSeed(seed));
  const generator = createDrumGenerator();
  return Array.from({ length: bars / 2 }, () => generator.generate(conductor.next(DEFAULT_LIVE)));
}

const BARS = 1024;

describe('MVP acceptance', () => {
  it('generates identical events for 4096 bars from the same seed', () => {
    for (const seed of [42, 0xdeadbeef]) {
      expect(generateBars(seed, 4096)).toEqual(generateBars(seed, 4096));
    }
  });

  it('plays the snare on beats 2 and 4 of every bar', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { events } of run(seed, BARS, () => params)) {
          for (const step of [4, 12, 20, 28]) expect(eventsAt(events, 'snare', step)).toHaveLength(1);
        }
      }
    }
  });

  it('generate() returns the composed layers', () => {
    const viaLayers = run(42, 256).map((pair) => pair.events);
    expect(generateBars(42, 256)).toEqual(viaLayers);
  });

  it('never plays the kick and the snare on the same step', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { events } of run(seed, BARS, () => params)) {
          for (const step of ALL_STEPS) {
            expect(eventsAt(events, 'kick', step).length * eventsAt(events, 'snare', step).length).toBe(0);
          }
        }
      }
    }
  });

  it('does not carry ornaments over to the next 2 bars', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const pairs = run(seed, BARS, () => params);
        let ornamentsSeen = 0;
        for (let i = 0; i + 1 < pairs.length; i++) {
          const current = pairs[i]!;
          const next = pairs[i + 1]!;
          ornamentsSeen += current.layers.ornaments.length;
          if (next.ctx.isSectionStart) continue;
          for (const { part, step } of current.layers.ornaments) {
            expect(cellAt(next.layers.base[part], step)).toBeNull();
            expect(next.events.filter((e) => e.part === part && e.step === step && e.layer === 'base')).toEqual([]);
          }
        }
        if (params.m2 > 0) expect(ornamentsSeen).toBeGreaterThan(0);
      }
    }
  });

  it('changes the base pattern only at 8-bar boundaries', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const pairs = run(seed, BARS, () => params);
        let changes = 0;
        for (let i = 1; i < pairs.length; i++) {
          if (!patternsEqual(pairs[i - 1]!.layers.base, pairs[i]!.layers.base)) {
            changes++;
            expect(pairs[i]!.ctx.isSectionStart).toBe(true);
          }
        }
        if (params.m8 >= 0.5) expect(changes).toBeGreaterThan(0);
      }
    }
  });

  it('generates 2 bars in 5 ms or less on average', () => {
    const conductor = createConductor(toSeed(42));
    const generator = createDrumGenerator();
    const pairs = 2048;
    const start = performance.now();
    for (let i = 0; i < pairs; i++) generator.generate(conductor.next(liveParams(1, 1, 1)));
    expect((performance.now() - start) / pairs).toBeLessThan(5);
  });

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
