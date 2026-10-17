import { TAG, createRng } from '../../random/rng.ts';
import { chordOf } from '../../structure/conductor.ts';
import { chordToneClass, tensionClass, type ChordTone } from '../../structure/chords.ts';
import { motifSeed, playableEnd, styleOf, stylePlan } from '../line.ts';
import { foldPitch, stackUp } from '../pitch.ts';
import {
  ALL_STEPS,
  type ContextWithDrums,
  type Generator,
  type Pitch,
  type StabHit,
  type Step,
  type StepLength,
  type Voicing,
} from '../types.ts';
import type { LineTuning } from '../tuning.ts';
import { STAB_STYLES, stabChance, type StabStyle } from './styles.ts';

/** C4. The lowest note of every voicing lies in the octave from here. */
export const STAB_LOWEST = 60 as Pitch;
/** Semitones a voicing with a tension may span above its lowest note. */
export const STAB_SPAN = 14;
export const STAB_HIGHEST = (STAB_LOWEST + 11 + STAB_SPAN) as Pitch;
export const STAB_LENGTH = 2 as StepLength;

export interface StabLine {
  readonly style: StabStyle;
  readonly hits: readonly StabHit[];
}

export type StabGenerator = Generator<ContextWithDrums, StabLine>;

export function createStabGenerator(tuning: LineTuning): StabGenerator {
  return { generate: (ctx) => stabLine(ctx, tuning) };
}

export function stabLine(ctx: ContextWithDrums, tuning: LineTuning): StabLine {
  const style = styleOf(ctx, stylePlan(ctx.seeds, TAG.stabStyle, STAB_STYLES));
  const rhythm = createRng(motifSeed(ctx, TAG.stabRhythm));
  const rolls = ALL_STEPS.map(() => rhythm.float());
  const end = playableEnd(ctx);
  const voicing = stabVoicing(ctx);

  const starts: Step[] = [];
  for (const step of ALL_STEPS) {
    const last = starts.at(-1);
    const clear = last === undefined || step - last >= STAB_LENGTH;
    if (clear && step + STAB_LENGTH <= end && (rolls[step] ?? 1) < stabChance(style, step, ctx.energy)) starts.push(step);
  }
  const hits = starts.map((step): StabHit => ({ instrument: 'stab', step, length: STAB_LENGTH, voicing, velocity: tuning.velocity.stab }));
  return { style, hits };
}

/**
 * The 3rd, 5th and 7th: the basses already sound the root, and leaving it out keeps the mid range light. A tension
 * takes the 5th's place, stacked above the 3rd and the 7th so that no two neighbours lie a semitone apart.
 */
function stabVoicing(ctx: ContextWithDrums): Voicing {
  const chord = chordOf(ctx);
  const tone = (t: ChordTone) => chordToneClass(ctx.key, chord, t);
  const tension = tensionClass(ctx.key, chord);
  if (tension === null) {
    const pitches = [tone('third'), tone('fifth'), tone('seventh')].map((pc) => foldPitch(STAB_LOWEST, pc));
    return pitches.sort((a, b) => a - b) as unknown as Voicing;
  }
  // Stacked as 3rd, 7th, 13th, the 13th would sit a major 7th above the 7th and spread the stab over two octaves.
  const order = chord.tension === 'thirteenth' ? [tone('seventh'), tone('third'), tension] : [tone('third'), tone('seventh'), tension];
  return stackUp(order, STAB_LOWEST) as unknown as Voicing;
}
