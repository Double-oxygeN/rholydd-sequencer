import type { PitchClass } from '../structure/key.ts';
import type { Pitch } from './types.ts';

const OCTAVE = 12;

/** The note of the pitch class within the octave from the lowest note, so a part stays in its register whatever the key. */
export function foldPitch(lowest: Pitch, pitchClass: PitchClass): Pitch {
  return (lowest + ((pitchClass - (lowest % OCTAVE) + OCTAVE) % OCTAVE)) as Pitch;
}

/** Pitch classes placed upwards in order, starting from the first at or above the floor. */
export function stackUp(order: readonly PitchClass[], floor: number): readonly Pitch[] {
  const pitches: Pitch[] = [];
  let below = floor - 1;
  for (const pc of order) {
    const next = below + 1 + ((pc - ((below + 1) % OCTAVE) + OCTAVE) % OCTAVE);
    pitches.push(next as Pitch);
    below = next;
  }
  return pitches;
}

export function octaveUp(pitch: Pitch): Pitch {
  return (pitch + OCTAVE) as Pitch;
}
