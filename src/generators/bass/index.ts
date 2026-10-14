import { REL, TAG, createRng, hash, weightedIndex } from '../../random/rng.ts';
import { TONIC, shiftDegree } from '../../structure/key.ts';
import {
  ALL_STEPS,
  STEPS_PER_PAIR,
  type BassNote,
  type ContextWithDrums,
  type Generator,
  type StepLength,
  type Velocity,
} from '../types.ts';
import { bassPlan } from './plan.ts';
import { DEGREE_STEPS, OCTAVE_JUMP_CHANCE, bassPitch } from './pitch.ts';
import { attackChance, type BassStyle } from './styles.ts';

// Level differences between notes are left to the phase 2 mixer.
const BASS_VELOCITY = 0.8 as Velocity;

export interface BassLine {
  readonly style: BassStyle;
  readonly notes: readonly BassNote[];
}

export type BassGenerator = Generator<ContextWithDrums, BassLine>;

/** Stateless: everything comes from the context, including the kicks the drums decided. */
export function createBassGenerator(): BassGenerator {
  return { generate: bassLine };
}

export function bassLine(ctx: ContextWithDrums): BassLine {
  const plan = bassPlan(ctx.seeds.phrase);
  const isTransition = ctx.sectionRole.relation === 'transition';
  const style = isTransition ? plan.transition : plan.main;
  const center = isTransition ? plan.transitionCenter : TONIC;
  // A, A' and A'' share one stream per phrase, so the bass of a variant only moves where its kick moved.
  const motifSeed = isTransition ? ctx.seeds.section : ctx.seeds.phrase;
  const rhythm = createRng(hash(motifSeed, TAG.bassRhythm, REL[ctx.relation]));
  const pitch = createRng(hash(motifSeed, TAG.bassPitch, REL[ctx.relation]));
  // Every step draws the same number of times whether or not a note starts there.
  const attackRolls = ALL_STEPS.map(() => rhythm.float());
  const pitchRolls = ALL_STEPS.map(() => ({ degree: pitch.float(), octave: pitch.float() }));

  // Only the big fill silences the bass, to mark the phrase boundary. Through 8-bar fills the bass keeps
  // the groove of the kicks the fill replaced, even when the fill itself drops the kick.
  const bigFill = ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd ? ctx.drums.fill : null;
  const end = bigFill?.from ?? STEPS_PER_PAIR;
  const kicks = new Set(ctx.drums.kicksWithoutFill);
  const starts = ALL_STEPS.filter(
    (step) => step < end && (attackRolls[step] ?? 1) < attackChance(style, step, kicks.has(step)),
  );

  const notes = starts.map((step, i): BassNote => {
    const first = i === 0;
    const rolls = pitchRolls[step]!;
    const distance = DEGREE_STEPS[weightedIndex(rolls.degree, DEGREE_STEPS.map(([, w]) => w)) ?? 0]?.[0] ?? 0;
    const degree = first ? center : shiftDegree(center, distance);
    return {
      instrument: 'bass',
      step,
      length: ((starts[i + 1] ?? end) - step) as StepLength,
      pitch: bassPitch(ctx.key, degree, !first && rolls.octave < OCTAVE_JUMP_CHANCE),
      velocity: BASS_VELOCITY,
    };
  });
  return { style, notes };
}
