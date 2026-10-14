import type { PitchClass } from '../structure/key.ts';
import type { Pitch } from './types.ts';

const OCTAVE = 12;

/** The note of the pitch class within the octave from the lowest note, so a part stays in its register whatever the key. */
export function foldPitch(lowest: Pitch, pitchClass: PitchClass): Pitch {
  return (lowest + ((pitchClass - (lowest % OCTAVE) + OCTAVE) % OCTAVE)) as Pitch;
}

export function octaveUp(pitch: Pitch): Pitch {
  return (pitch + OCTAVE) as Pitch;
}
