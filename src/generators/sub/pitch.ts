import type { PitchClass } from '../../structure/key.ts';
import { foldPitch, octaveUp } from '../pitch.ts';
import type { Pitch } from '../types.ts';

/** F1. Every note is folded into the octave from here, whatever the key, so the sub stays in the same register. */
export const LOWEST_PITCH = 29 as Pitch;
export const HIGHEST_PITCH = (LOWEST_PITCH + 23) as Pitch;

export function subPitch(pitchClass: PitchClass, jump: boolean): Pitch {
  const pitch = foldPitch(LOWEST_PITCH, pitchClass);
  return jump ? octaveUp(pitch) : pitch;
}
