import { TAG, createRng, hash } from '../../random/rng.ts';
import { ALL_STEPS, type ContextWithDrums, type Generator, type SubNote, type Velocity } from '../types.ts';
import { chordRoot, chordTone, legato, motifSeed, playableEnd, styleOf, stylePlan } from '../line.ts';
import { OCTAVE_JUMP_CHANCE, SUB_TONE_WEIGHTS, subPitch } from './pitch.ts';
import { SUB_STYLES, attackChance, type SubStyle } from './styles.ts';

// Level differences between parts are left to the mixer.
const SUB_VELOCITY = 0.8 as Velocity;

export interface SubLine {
  readonly style: SubStyle;
  readonly notes: readonly SubNote[];
}

export type SubGenerator = Generator<ContextWithDrums, SubLine>;

/** Stateless: everything comes from the context, including the kicks the drums decided. */
export function createSubGenerator(): SubGenerator {
  return { generate: subLine };
}

export function subLine(ctx: ContextWithDrums): SubLine {
  const style = styleOf(ctx, stylePlan(hash(ctx.seeds.phrase, TAG.subStyle), SUB_STYLES));
  const rhythm = createRng(motifSeed(ctx, TAG.subRhythm));
  const pitch = createRng(motifSeed(ctx, TAG.subPitch));
  // Every step draws the same number of times whether or not a note starts there.
  const attackRolls = ALL_STEPS.map(() => rhythm.float());
  const pitchRolls = ALL_STEPS.map(() => ({ degree: pitch.float(), octave: pitch.float() }));

  // Through 8-bar fills the sub keeps the groove of the kicks the fill replaced, even when the fill drops the kick.
  const end = playableEnd(ctx);
  const kicks = new Set(ctx.drums.kicksWithoutFill);
  const starts = ALL_STEPS.filter(
    (step) => step < end && (attackRolls[step] ?? 1) < attackChance(style, step, kicks.has(step)),
  );

  const notes = legato(starts, end).map(({ step, length }, i): SubNote => {
    const first = i === 0;
    const rolls = pitchRolls[step]!;
    const degree = first ? chordRoot(ctx) : chordTone(ctx, rolls.degree, SUB_TONE_WEIGHTS);
    return {
      instrument: 'sub',
      step,
      length,
      pitch: subPitch(ctx.key, degree, !first && rolls.octave < OCTAVE_JUMP_CHANCE),
      velocity: SUB_VELOCITY,
    };
  });
  return { style, notes };
}
