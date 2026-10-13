import { TAG, hash } from '../../random/rng.ts';
import type { Context } from '../../structure/conductor.ts';
import type { Generator, NoteEvent } from '../types.ts';
import { initialPattern } from './base.ts';
import { compose } from './compose.ts';
import { mutate } from './mutate.ts';
import { ornament } from './ornament.ts';
import type { Pattern } from './pattern.ts';

export interface PairLayers {
  /** Persistent pattern, rewritten only at 8-bar boundaries. */
  readonly base: Pattern;
  readonly ornaments: readonly NoteEvent[];
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
    return {
      base,
      ornaments: ornament(base, ctx.seeds.ornament, ctx.params.m2),
    };
  }

  return {
    generateLayers,
    generate(ctx) {
      const layers = generateLayers(ctx);
      return compose(layers.base, layers.ornaments);
    },
  };
}
