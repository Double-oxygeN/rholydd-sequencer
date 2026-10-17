import { describe, expect, it } from 'vitest';
import { createEnsemble } from '../../src/generators/ensemble.ts';
import { toSeed } from '../../src/random/rng.ts';
import { DEFAULT_KEY } from '../../src/structure/key.ts';
import { TUNING, liveParams } from '../support/helpers.ts';

describe('performance: generation', () => {
  // Every slider up asks for the most mutations and fills, the heaviest generation there is.
  it('generates 2 bars of every part, arrangement and effects included, in 5 ms or less on average', () => {
    const ensemble = createEnsemble({ seed: toSeed(42), initialKey: DEFAULT_KEY, tuning: TUNING });
    const pairs = 4096;
    const start = performance.now();
    for (let i = 0; i < pairs; i++) ensemble.next(liveParams(1, 1, 1, 1, 1));
    expect((performance.now() - start) / pairs).toBeLessThan(5);
  });
});
