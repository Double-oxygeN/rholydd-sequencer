import { TAG, hash } from '../../random/rng.ts';
import { changesScene, leadsIntoDrop, refreshesReference } from '../../structure/arrangement.ts';
import type { UnitInterval } from '../../units.ts';
import type { Context } from '../../structure/conductor.ts';
import { ALL_STEPS, type DrumHit, type DrumOutcome, type Generator } from '../types.ts';
import { initialPattern } from './base.ts';
import { compose } from './compose.ts';
import { fill, phraseFill, type Fill } from './fill.ts';
import { mutate } from './mutate.ts';
import { ornament } from './ornament.ts';
import { cellAt, type Pattern } from './pattern.ts';
import { thin } from './thin.ts';
import { transitionPattern } from './transition.ts';

export interface PairLayers {
  /** Pattern of section A, rewritten only at 32-bar boundaries. */
  readonly reference: Pattern;
  /** Pattern of the current 8-bar section, derived afresh from the reference at every 8-bar boundary. */
  readonly sectionBase: Pattern;
  /** sectionBase thinned out by the section's energy. This is what plays. */
  readonly base: Pattern;
  readonly ornaments: readonly DrumHit[];
  readonly fill: Fill | null;
}

export interface DrumGenerator extends Generator<Context, DrumOutcome> {
  generateLayers(ctx: Context): PairLayers;
}

export function drumOutcome(layers: PairLayers): DrumOutcome {
  const { fill } = layers;
  return {
    hits: compose(layers.base, layers.ornaments, fill),
    fill: fill === null ? null : { from: fill.start, kept: fill.kept },
    // Ornaments never add kicks, so the base pattern holds every kick that would sound without the fill.
    kicksWithoutFill: ALL_STEPS.filter((step) => cellAt(layers.base, 'kick', step) !== null),
  };
}

/** Call with consecutive contexts from one conductor. A new generator is needed to start over. */
export function createDrumGenerator(): DrumGenerator {
  let reference: Pattern | undefined;
  let sectionBase: Pattern | undefined;
  let base: Pattern | undefined;

  function generateLayers(ctx: Context): PairLayers {
    if (reference === undefined || sectionBase === undefined || base === undefined || ctx.isSectionStart) {
      reference = nextReference(reference, ctx);
      sectionBase = sectionPattern(reference, ctx);
      base = thin(sectionBase, ctx.seeds.section, ctx.energy);
    }
    return {
      reference,
      sectionBase,
      base,
      ornaments: ornament(base, ctx.seeds.ornament, ctx.params.m2, ctx.energy),
      fill: ctx.isSectionEnd ? closingFill(ctx, ctx.fillIntensity) : null,
    };
  }

  return {
    generateLayers,
    generate: (ctx) => drumOutcome(generateLayers(ctx)),
  };
}

function closingFill(ctx: Context, intensity: UnitInterval): Fill | null {
  if (ctx.sectionRole.isPhraseEnd) return phraseFill(ctx.seeds.fill, intensity, leadsIntoDrop(ctx) ? 'intoDrop' : 'free');
  const cue = !changesScene(ctx) ? 'chance' : ctx.sceneRole.scene === 'breakdown' ? 'drumsReturn' : 'certain';
  return fill(ctx.seeds.fill, intensity, cue);
}

function nextReference(previous: Pattern | undefined, ctx: Context): Pattern {
  if (previous === undefined) return initialPattern(hash(ctx.seeds.phrase, TAG.base));
  return ctx.sectionRole.isPhraseStart && refreshesReference(ctx.sceneRole)
    ? mutate(previous, ctx.seeds.phrase, ctx.params.m32, 'strong')
    : previous;
}

// Variants and transitions start from the reference every time instead of accumulating,
// so that each phrase audibly returns to A.
function sectionPattern(reference: Pattern, ctx: Context): Pattern {
  switch (ctx.sectionRole.relation) {
    case 'repeat':
      return reference;
    case 'variant':
      return mutate(reference, ctx.seeds.section, ctx.params.m8, 'variant');
    case 'transition':
      return transitionPattern(reference, ctx.seeds.phrase);
  }
}
