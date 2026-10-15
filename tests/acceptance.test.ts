import { describe, expect, it } from 'vitest';
import { createEnsemble } from '../src/generators/ensemble.ts';
import { cellAt, patternsEqual } from '../src/generators/drums/pattern.ts';
import { ALL_STEPS, type NoteEvent, type Step } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { DEFAULT_KEY } from '../src/structure/key.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, eventsAt, liveParams, run } from './helpers.ts';

// Automated acceptance criteria from docs/specs/mvp/requirements.md.

function generateBars(seed: number, bars: number): (readonly NoteEvent[])[] {
  const ensemble = createEnsemble({ seed: toSeed(seed), initialKey: DEFAULT_KEY });
  return Array.from({ length: bars / 2 }, () => ensemble.next(DEFAULT_LIVE).events);
}

const BARS = 1024;

/** The same note, whether or not the silent beat before a drop shortened it. */
function sameOnset(a: NoteEvent, b: NoteEvent): boolean {
  if (a.instrument === 'drums' || b.instrument === 'drums') {
    return a.instrument === 'drums' && b.instrument === 'drums' && a.part === b.part && a.step === b.step;
  }
  return a.instrument === b.instrument && a.step === b.step;
}

describe('MVP acceptance', () => {
  it('generates identical events for 4096 bars from the same seed', () => {
    for (const seed of [42, 0xdeadbeef]) {
      expect(generateBars(seed, 4096)).toEqual(generateBars(seed, 4096));
    }
  });

  // Fills may silence the backbeat on purpose (dropout and solos), so they are excluded.
  it('plays the snare on beats 2 and 4 of every bar outside fills', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { events, layers } of run(seed, BARS, () => params)) {
          for (const step of [4, 12, 20, 28]) {
            if (layers.fill?.steps.includes(step as Step)) continue;
            expect(eventsAt(events, 'snare', step)).toHaveLength(1);
          }
        }
      }
    }
  });

  // Phase 3 leaves out the parts a scene does not play and empties the beat before a drop.
  it('plays the composed drum layers followed by the pitched parts, as far as the scene lets them sound', () => {
    expect(generateBars(42, 256)).toEqual(run(42, 256).map((pair) => pair.heard));
    for (const pair of run(42, 1024)) {
      const generated = [...pair.events, ...pair.pitched];
      const sources = pair.heard.map((event) => generated.find((g) => sameOnset(g, event)));
      expect(sources).not.toContain(undefined);
      expect(sources).toEqual(generated.filter((event) => sources.includes(event)));
    }
  });

  it('plays the snare only on beats 2 and 4 outside fills, without ever mutating it', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { events, layers } of run(seed, BARS, () => params)) {
          const outsideFill = (step: number) => !layers.fill?.steps.includes(step as Step);
          const snares = events.filter((e) => e.part === 'snare' && outsideFill(e.step)).map((e) => e.step);
          expect(snares).toEqual([4, 12, 20, 28].filter(outsideFill));
        }
      }
    }
  });

  it('repeats one beat of hi-hat across the 2 bars apart from ornaments and fills', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { events, layers } of run(seed, BARS, () => params)) {
          const fillSteps = new Set<number>(layers.fill?.steps ?? []);
          const hats = events.filter((e) => e.part === 'hat' && e.layer === 'base' && !fillSteps.has(e.step));
          const beatOf = (offset: number) =>
            hats.filter((e) => e.step >= offset && e.step < offset + 4).map((e) => [e.step - offset, e.velocity]);
          const reference = [0, 4, 8, 12, 16, 20, 24, 28].find((offset) => !fillSteps.has(offset + 3));
          if (reference === undefined) continue;
          for (let offset = 0; offset < 32; offset += 4) {
            if ([0, 1, 2, 3].some((i) => fillSteps.has(offset + i))) continue;
            expect(beatOf(offset)).toEqual(beatOf(reference));
          }
        }
      }
    }
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
            expect(cellAt(next.layers.base, part, step)).toBeNull();
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

  it('generates 2 bars of every part in 5 ms or less on average', () => {
    const ensemble = createEnsemble({ seed: toSeed(42), initialKey: DEFAULT_KEY });
    const pairs = 2048;
    const start = performance.now();
    for (let i = 0; i < pairs; i++) ensemble.next(liveParams(1, 1, 1, 1, 1));
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
