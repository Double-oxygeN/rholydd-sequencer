import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEnsemble } from '../../src/generators/ensemble.ts';
import { DEFAULT_GENERATION_TUNING } from '../../src/generators/tuning.ts';
import type { NoteEvent } from '../../src/generators/types.ts';
import { toSeed } from '../../src/random/rng.ts';
import { DEFAULT_KEY } from '../../src/structure/key.ts';
import { BASELINE_RUNS, TUNED_CONFIG, baselineDigests, type BaselineDigests } from '../support/baseline.ts';
import { DEFAULT_LIVE, TUNING } from '../support/helpers.ts';

function generateBars(seed: number, bars: number): (readonly NoteEvent[])[] {
  const ensemble = createEnsemble({ seed: toSeed(seed), initialKey: DEFAULT_KEY, tuning: TUNING });
  return Array.from({ length: bars / 2 }, () => ensemble.next(DEFAULT_LIVE).events);
}

// Recorded from v0.5.0 before any refactoring, and never to be recorded again: a refactoring that changes what
// plays would otherwise become the new truth without anyone hearing it.
const RECORDED: Readonly<Record<string, BaselineDigests>> = JSON.parse(
  readFileSync(new URL('../fixtures/generation-baseline.json', import.meta.url), 'utf8'),
);

describe('baseline: reproducibility', () => {
  it('generates identical events for 4096 bars from the same seed', () => {
    for (const seed of [42, 0xdeadbeef]) {
      expect(generateBars(seed, 4096)).toEqual(generateBars(seed, 4096));
    }
  });
});

describe('baseline: as recorded', () => {
  it('reads every value of the tuned config file', () => {
    expect(TUNED_CONFIG.warnings).toEqual([]);
  });

  it('tunes every group of generation numbers and the initial values away from the defaults', () => {
    const { generation, params } = TUNED_CONFIG.value;
    for (const group of Object.keys(DEFAULT_GENERATION_TUNING) as (keyof typeof DEFAULT_GENERATION_TUNING)[]) {
      expect(generation[group]).not.toEqual(DEFAULT_GENERATION_TUNING[group]);
    }
    for (const key of Object.keys(DEFAULT_LIVE) as (keyof typeof DEFAULT_LIVE)[]) {
      expect(params[key]).not.toBe(DEFAULT_LIVE[key]);
    }
    expect(params.initialKey).not.toBe(DEFAULT_KEY);
  });

  it('records every run', () => {
    expect(Object.keys(RECORDED).sort()).toEqual(Object.keys(BASELINE_RUNS).sort());
  });

  for (const [name, baselineRun] of Object.entries(BASELINE_RUNS)) {
    it(`generates every part of ${name} as recorded`, () => {
      expect(baselineDigests(baselineRun)).toEqual(RECORDED[name]);
    });
  }
});
