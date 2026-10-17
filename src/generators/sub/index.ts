import { TAG, createRng } from '../../random/rng.ts';
import { ALL_STEPS, type ContextWithDrums, type Generator, type SubNote } from '../types.ts';
import { chordOf } from '../../structure/conductor.ts';
import { chordToneClass } from '../../structure/chords.ts';
import { chordTone, legato, motifSeed, playableEnd, styleOf, stylePlan } from '../line.ts';
import type { LineTuning } from '../tuning.ts';
import { subPitch } from './pitch.ts';
import { SUB_STYLES, attackChance, type SubStyle } from './styles.ts';

export interface SubLine {
  readonly style: SubStyle;
  readonly notes: readonly SubNote[];
}

export type SubGenerator = Generator<ContextWithDrums, SubLine>;

/** Stateless: everything comes from the context, including the kicks the drums decided. */
export function createSubGenerator(tuning: LineTuning): SubGenerator {
  return { generate: (ctx) => subLine(ctx, tuning) };
}

export function subLine(ctx: ContextWithDrums, tuning: LineTuning): SubLine {
  const style = styleOf(ctx, stylePlan(ctx.seeds, TAG.subStyle, SUB_STYLES));
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
    const tone = first ? 'root' : chordTone(rolls.degree, tuning.subToneWeights);
    return {
      instrument: 'sub',
      step,
      length,
      pitch: subPitch(chordToneClass(ctx.key, chordOf(ctx), tone), !first && rolls.octave < tuning.subOctaveJumpChance),
      velocity: tuning.velocity.sub,
    };
  });
  return { style, notes };
}
