import { chordDegrees, type Chord } from '../../structure/harmony.ts';
import type { Context } from '../../structure/conductor.ts';
import { pitchClassOf, type Key, type PitchClass } from '../../structure/key.ts';
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
    voicing: sectionVoicings(ctx.key, ctx.progression.slice(0, ctx.pairIn8 + 1)).at(-1)!,
    velocity: tuning.velocity.pad,
  };
}

/**
 * Voicings of the chords so far in the section. Each section starts over from root position, so a voicing never
 * depends on earlier sections and any 2 bars can be generated alone.
 */
export function sectionVoicings(key: Key, chords: readonly Chord[]): readonly Voicing[] {
  const voicings: Voicing[] = [];
  for (const chord of chords) {
    const previous = voicings.at(-1);
    const candidates = closeVoicings(key, chord)
      .filter(({ inversion }) => previous !== undefined || inversion === 0)
      .map(({ voicing }) => voicing);
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

/** Every inversion stacked as closely as possible, at every octave that fits the range. */
function closeVoicings(key: Key, chord: Chord): readonly Candidate[] {
  const classes = chordDegrees(chord).map((degree) => pitchClassOf(key, degree));
  const result: Candidate[] = [];
  for (let inversion = 0; inversion < classes.length; inversion++) {
    const order = [...classes.slice(inversion), ...classes.slice(0, inversion)];
    for (let floor: number = PAD_LOWEST; floor <= PAD_HIGHEST; floor += 12) {
      const voicing = stack(order, floor);
      if (voicing.at(-1)! <= PAD_HIGHEST) result.push({ inversion, voicing });
    }
  }
  return result;
}

/** Pitch classes placed upwards in order, starting from the first at or above the floor. */
function stack(order: readonly PitchClass[], floor: number): Voicing {
  const pitches: Pitch[] = [];
  let below = floor - 1;
  for (const pc of order) {
    const next = below + 1 + ((pc - ((below + 1) % 12) + 12) % 12);
    pitches.push(next as Pitch);
    below = next;
  }
  return pitches as unknown as Voicing;
}

/** Total distance the voices travel, pairing them from the bottom up. */
function movement(from: Voicing, to: Voicing): number {
  return from.reduce((sum, pitch, i) => sum + Math.abs(pitch - (to[i] ?? pitch)), 0);
}

function distanceFromCenter(voicing: Voicing): number {
  return Math.abs(voicing.reduce((sum, p) => sum + p, 0) / voicing.length - PAD_CENTER);
}
