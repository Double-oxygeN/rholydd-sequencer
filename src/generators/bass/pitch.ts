import { TONIC, pitchClassOf, shiftDegree, type Key, type ScaleDegree } from '../../structure/key.ts';
import type { Pitch } from '../types.ts';

/** F1. Every note is folded into the octave from here, whatever the key, so the sub stays in the same register. */
export const LOWEST_PITCH = 29 as Pitch;
export const HIGHEST_PITCH = (LOWEST_PITCH + 23) as Pitch;
const OCTAVE = 12;

export const OCTAVE_JUMP_CHANCE = 0.2;

/** Weights for the distance along the scale from the centre. The 2nd is left out as too tense for a sub. */
export const DEGREE_STEPS: readonly (readonly [number, number])[] = [
  [0, 0.5],
  [2, 0.1],
  [3, 0.05],
  [4, 0.15],
  [5, 0.1],
  [6, 0.1],
];

/** ♭6, ♭7 and 4: centres that section B moves to so the transition is heard in the bass too. */
export const TRANSITION_CENTERS: readonly ScaleDegree[] = [5, 6, 3].map((d) => shiftDegree(TONIC, d));

export function bassPitch(key: Key, degree: ScaleDegree, octaveUp: boolean): Pitch {
  const offset = (pitchClassOf(key, degree) - (LOWEST_PITCH % OCTAVE) + OCTAVE) % OCTAVE;
  return (LOWEST_PITCH + offset + (octaveUp ? OCTAVE : 0)) as Pitch;
}
