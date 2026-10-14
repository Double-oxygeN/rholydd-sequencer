import { REL, createRng, hash, weightedIndex, type Seed } from '../random/rng.ts';
import { chordOf } from '../structure/conductor.ts';
import { CHORD_TONE_STEPS, rootDegree } from '../structure/harmony.ts';
import { shiftDegree, type ScaleDegree } from '../structure/key.ts';
import { STEPS_PER_PAIR, type ContextWithDrums, type Step, type StepLength } from './types.ts';

/** Rules shared by the parts that play pitches over the chord progression. */

export interface StylePlan<S extends string> {
  /** Style of sections A, A' and A''. */
  readonly main: S;
  /** Style of section B. Always differs from main. */
  readonly transition: S;
}

/** Chosen once per 32-bar phrase. Draws exactly two numbers so that later draws from the same stream stay put. */
export function stylePlan<S extends string>(seed: Seed, styles: readonly [S, S, ...S[]]): StylePlan<S> {
  const rng = createRng(seed);
  const main = styles[rng.int(styles.length)] ?? styles[0];
  const others = styles.filter((style) => style !== main);
  const transition = others[rng.int(others.length)] ?? styles[1];
  return { main, transition };
}

export function styleOf<S extends string>(ctx: ContextWithDrums, plan: StylePlan<S>): S {
  return ctx.sectionRole.relation === 'transition' ? plan.transition : plan.main;
}

/**
 * A, A' and A'' share one stream per phrase, so their lines only differ where the chords or the kicks differ.
 * Repeat units of one section share a stream too, which makes them play the same line relative to each chord.
 */
export function motifSeed(ctx: ContextWithDrums, tag: number): Seed {
  const base = ctx.sectionRole.relation === 'transition' ? ctx.seeds.section : ctx.seeds.phrase;
  return hash(base, tag, REL[ctx.relation]);
}

/** Only the big fill silences the pitched parts that stop, to mark the phrase boundary. */
export function playableEnd(ctx: ContextWithDrums): number {
  const bigFill = ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd ? ctx.drums.fill : null;
  return bigFill?.from ?? STEPS_PER_PAIR;
}

/** Weight for each distance along the scale from the root to a chord tone, in the order of CHORD_TONE_STEPS. */
export type ChordToneWeights = readonly [number, number, number, number];

/** A chord tone of the 2 bars, picked from a roll drawn beforehand. */
export function chordTone(ctx: ContextWithDrums, roll: number, weights: ChordToneWeights): ScaleDegree {
  const steps = CHORD_TONE_STEPS[weightedIndex(roll, weights) ?? 0] ?? 0;
  return shiftDegree(rootDegree(chordOf(ctx)), steps);
}

export function chordRoot(ctx: ContextWithDrums): ScaleDegree {
  return rootDegree(chordOf(ctx));
}

/** Each note holds until the next one starts, the last one until the end. */
export function legato(starts: readonly Step[], end: number): readonly { step: Step; length: StepLength }[] {
  return starts.map((step, i) => ({ step, length: ((starts[i + 1] ?? end) - step) as StepLength }));
}
