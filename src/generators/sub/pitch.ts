import { pitchClassOf, type Key, type ScaleDegree } from '../../structure/key.ts';
import type { ChordToneWeights } from '../line.ts';
import { foldPitch, octaveUp } from '../pitch.ts';
import type { Pitch } from '../types.ts';

/** F1. Every note is folded into the octave from here, whatever the key, so the sub stays in the same register. */
export const LOWEST_PITCH = 29 as Pitch;
export const HIGHEST_PITCH = (LOWEST_PITCH + 23) as Pitch;

export const OCTAVE_JUMP_CHANCE = 0.2;

/** The weights of phase 1 without the 4th and 6th, which are not chord tones on every chord. */
export const SUB_TONE_WEIGHTS: ChordToneWeights = [0.5, 0.1, 0.15, 0.1];

export function subPitch(key: Key, degree: ScaleDegree, jump: boolean): Pitch {
  const pitch = foldPitch(LOWEST_PITCH, pitchClassOf(key, degree));
  return jump ? octaveUp(pitch) : pitch;
}
