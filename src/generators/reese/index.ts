import { TAG, createRng, hash } from '../../random/rng.ts';
import { pitchClassOf } from '../../structure/key.ts';
import { chordRoot, chordTone, legato, motifSeed, playableEnd, styleOf, stylePlan, type ChordToneWeights } from '../line.ts';
import { foldPitch } from '../pitch.ts';
import { ALL_STEPS, type ContextWithDrums, type Generator, type Pitch, type ReeseNote, type Velocity } from '../types.ts';
import { REESE_STYLES, reeseChance, type ReeseStyle } from './styles.ts';

/** F2: an octave above the sub, folded within one octave and never jumping. */
export const REESE_LOWEST = 41 as Pitch;
export const REESE_HIGHEST = (REESE_LOWEST + 11) as Pitch;

// Leans on the root and the 5th more than the sub does, so the two basses rarely sound a 3rd against each other.
const REESE_TONE_WEIGHTS: ChordToneWeights = [0.6, 0.1, 0.2, 0.1];
const REESE_VELOCITY = 0.8 as Velocity;

export interface ReeseLine {
  readonly style: ReeseStyle;
  readonly notes: readonly ReeseNote[];
}

export type ReeseGenerator = Generator<ContextWithDrums, ReeseLine>;

export function createReeseGenerator(): ReeseGenerator {
  return { generate: reeseLine };
}

export function reeseLine(ctx: ContextWithDrums): ReeseLine {
  const style = styleOf(ctx, stylePlan(hash(ctx.seeds.phrase, TAG.reeseStyle), REESE_STYLES));
  const rhythm = createRng(motifSeed(ctx, TAG.reeseRhythm));
  const pitch = createRng(motifSeed(ctx, TAG.reesePitch));
  const attackRolls = ALL_STEPS.map(() => rhythm.float());
  const pitchRolls = ALL_STEPS.map(() => pitch.float());

  const end = playableEnd(ctx);
  const starts = ALL_STEPS.filter((step) => step < end && (attackRolls[step] ?? 1) < reeseChance(style, step, ctx.energy));
  const notes = legato(starts, end).map(({ step, length }, i): ReeseNote => {
    const degree = i === 0 ? chordRoot(ctx) : chordTone(ctx, pitchRolls[step] ?? 0, REESE_TONE_WEIGHTS);
    return {
      instrument: 'reese',
      step,
      length,
      pitch: foldPitch(REESE_LOWEST, pitchClassOf(ctx.key, degree)),
      velocity: REESE_VELOCITY,
    };
  });
  return { style, notes };
}
