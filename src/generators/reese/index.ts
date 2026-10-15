import { TAG, createRng } from '../../random/rng.ts';
import { pitchClassOf } from '../../structure/key.ts';
import { chordRoot, chordTone, legato, motifSeed, playableEnd, styleOf, stylePlan } from '../line.ts';
import { foldPitch } from '../pitch.ts';
import type { LineTuning } from '../tuning.ts';
import { ALL_STEPS, type ContextWithDrums, type Generator, type Pitch, type ReeseNote } from '../types.ts';
import { REESE_STYLES, reeseChance, type ReeseStyle } from './styles.ts';

/** F2: an octave above the sub, folded within one octave and never jumping. */
export const REESE_LOWEST = 41 as Pitch;
export const REESE_HIGHEST = (REESE_LOWEST + 11) as Pitch;


export interface ReeseLine {
  readonly style: ReeseStyle;
  readonly notes: readonly ReeseNote[];
}

export type ReeseGenerator = Generator<ContextWithDrums, ReeseLine>;

export function createReeseGenerator(tuning: LineTuning): ReeseGenerator {
  return { generate: (ctx) => reeseLine(ctx, tuning) };
}

export function reeseLine(ctx: ContextWithDrums, tuning: LineTuning): ReeseLine {
  const style = styleOf(ctx, stylePlan(ctx.seeds, TAG.reeseStyle, REESE_STYLES));
  const rhythm = createRng(motifSeed(ctx, TAG.reeseRhythm));
  const pitch = createRng(motifSeed(ctx, TAG.reesePitch));
  const attackRolls = ALL_STEPS.map(() => rhythm.float());
  const pitchRolls = ALL_STEPS.map(() => pitch.float());

  const end = playableEnd(ctx);
  const starts = ALL_STEPS.filter((step) => step < end && (attackRolls[step] ?? 1) < reeseChance(style, step, ctx.energy));
  const notes = legato(starts, end).map(({ step, length }, i): ReeseNote => {
    const degree = i === 0 ? chordRoot(ctx) : chordTone(ctx, pitchRolls[step] ?? 0, tuning.reeseToneWeights);
    return {
      instrument: 'reese',
      step,
      length,
      pitch: foldPitch(REESE_LOWEST, pitchClassOf(ctx.key, degree)),
      velocity: tuning.velocity.reese,
    };
  });
  return { style, notes };
}
