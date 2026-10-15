import { pitchClassOf, type Key, type ScaleDegree } from '../../structure/key.ts';
import { foldPitch, octaveUp } from '../pitch.ts';
import type { Pitch } from '../types.ts';

/** F1. Every note is folded into the octave from here, whatever the key, so the sub stays in the same register. */
export const LOWEST_PITCH = 29 as Pitch;
export const HIGHEST_PITCH = (LOWEST_PITCH + 23) as Pitch;

export function subPitch(key: Key, degree: ScaleDegree, jump: boolean): Pitch {
  const pitch = foldPitch(LOWEST_PITCH, pitchClassOf(key, degree));
  return jump ? octaveUp(pitch) : pitch;
}
