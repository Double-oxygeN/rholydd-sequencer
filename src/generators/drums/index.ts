import { TAG, hash } from '../../random/rng.ts';
import type { Context } from '../../structure/conductor.ts';
import type { Generator } from '../types.ts';
import { initialPattern } from './base.ts';
import { compose } from './compose.ts';
import { mutate } from './mutate.ts';
import type { Pattern } from './pattern.ts';

export interface PairLayers {
  /** Persistent pattern, rewritten only at 8-bar boundaries. */
  readonly base: Pattern;
}

export interface DrumGenerator extends Generator {
  generateLayers(ctx: Context): PairLayers;
}

/** Call with consecutive contexts from one conductor. A new generator is needed to start over. */
export function createDrumGenerator(): DrumGenerator {
  let base: Pattern | undefined;

  function generateLayers(ctx: Context): PairLayers {
    if (base === undefined) base = initialPattern(hash(ctx.seeds.section, TAG.base));
    else if (ctx.isSectionStart) base = mutate(base, ctx.seeds.section, ctx.params.m8);
    return { base };
  }

  return {
    generateLayers,
    generate(ctx) {
      return compose(generateLayers(ctx).base);
    },
  };
}
