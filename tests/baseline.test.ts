import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_TUNING } from '../src/generators/tuning.ts';
import { DEFAULT_KEY } from '../src/structure/key.ts';
import { BASELINE_RUNS, TUNED_CONFIG, baselineDigests, type BaselineDigests } from './baseline.ts';
import { DEFAULT_LIVE } from './helpers.ts';

// Recorded from v0.5.0 before any refactoring, and never to be recorded again: a refactoring that changes what
// plays would otherwise become the new truth without anyone hearing it.
const RECORDED: Readonly<Record<string, BaselineDigests>> = JSON.parse(
  readFileSync(new URL('./fixtures/generation-baseline.json', import.meta.url), 'utf8'),
);

describe('generation baseline', () => {
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
