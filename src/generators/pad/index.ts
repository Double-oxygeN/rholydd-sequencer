import { chordToneClass, tensionClass, type ColoredChord } from '../../structure/chords.ts';
import type { Context } from '../../structure/conductor.ts';
import type { Key, PitchClass } from '../../structure/key.ts';
import { stackUp } from '../pitch.ts';
import {
  STEPS_PER_PAIR,
  type Generator,
  type PadChord,
  type Pitch,
  type Step,
  type StepLength,
  type Voicing,
} from '../types.ts';
import type { LineTuning } from '../tuning.ts';

/** F3 to E5. */
export const PAD_LOWEST = 53 as Pitch;
export const PAD_HIGHEST = 76 as Pitch;
const PAD_CENTER = (PAD_LOWEST + PAD_HIGHEST) / 2;

export type PadGenerator = Generator<Context, PadChord>;

/** Stateless and random-free: the progression alone decides the pad. */
export function createPadGenerator(tuning: LineTuning): PadGenerator {
  return { generate: (ctx) => padChord(ctx, tuning) };
}

/** Plays through the big fill too, keeping the harmony while the basses stop. */
export function padChord(ctx: Context, tuning: LineTuning): PadChord {
  return {
    instrument: 'pad',
    step: 0 as Step,
    length: STEPS_PER_PAIR as StepLength,
    voicing: sectionVoicings(ctx.key, ctx.progression.chords.slice(0, ctx.pairIn8 + 1)).at(-1)!,
    velocity: tuning.velocity.pad,
  };
}

/**
 * Voicings of the chords so far in the section. Each section starts over from root position, so a voicing never
 * depends on earlier sections and any 2 bars can be generated alone. A chord with a tension spans up to 17
 * semitones in root position, which does not always fit the range; it then starts from whichever inversion fits.
 */
export function sectionVoicings(key: Key, chords: readonly ColoredChord[]): readonly Voicing[] {
  const voicings: Voicing[] = [];
  for (const chord of chords) {
    const previous = voicings.at(-1);
    const all = closeVoicings(key, chord);
    const rootPosition = all.filter(({ inversion }) => inversion === 0);
    const candidates = (previous === undefined && rootPosition.length > 0 ? rootPosition : all).map(({ voicing }) => voicing);
    const cost = (v: Voicing) => (previous === undefined ? 0 : movement(previous, v));
    const best = candidates.reduce((a, b) => {
      const diff = cost(b) - cost(a);
      return diff < 0 || (diff === 0 && distanceFromCenter(b) < distanceFromCenter(a)) ? b : a;
    });
    voicings.push(best);
  }
  return voicings;
}

interface Candidate {
  /** 0 is root position. */
  readonly inversion: number;
  readonly voicing: Voicing;
}

/**
 * The chord's four notes, the 5th giving way to the tension when there is one: the 5th blends into the root and
 * leaves the chord's kind unchanged when it goes, and swapping rather than adding keeps the polyphony budget.
 */
export function padTones(key: Key, chord: ColoredChord): readonly PitchClass[] {
  const tone = (t: 'root' | 'third' | 'fifth' | 'seventh') => chordToneClass(key, chord, t);
  const tension = tensionClass(key, chord);
  return tension === null
    ? [tone('root'), tone('third'), tone('fifth'), tone('seventh')]
    : [tone('root'), tone('third'), tone('seventh'), tension];
}

/** Every inversion stacked as closely as possible, at every octave that fits the range. */
function closeVoicings(key: Key, chord: ColoredChord): readonly Candidate[] {
  const classes = padTones(key, chord);
  const result: Candidate[] = [];
  for (let inversion = 0; inversion < classes.length; inversion++) {
    const order = [...classes.slice(inversion), ...classes.slice(0, inversion)];
    for (let floor: number = PAD_LOWEST; floor <= PAD_HIGHEST; floor += 12) {
      const voicing = stackUp(order, floor) as unknown as Voicing;
      if (voicing.at(-1)! <= PAD_HIGHEST) result.push({ inversion, voicing });
    }
  }
  return result;
}

/** Total distance the voices travel, pairing them from the bottom up. */
function movement(from: Voicing, to: Voicing): number {
  return from.reduce((sum, pitch, i) => sum + Math.abs(pitch - (to[i] ?? pitch)), 0);
}

function distanceFromCenter(voicing: Voicing): number {
  return Math.abs(voicing.reduce((sum, p) => sum + p, 0) / voicing.length - PAD_CENTER);
}
