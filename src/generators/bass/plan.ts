import { TAG, createRng, hash, type Seed } from '../../random/rng.ts';
import type { ScaleDegree } from '../../structure/key.ts';
import { TRANSITION_CENTERS } from './pitch.ts';
import { BASS_STYLES, type BassStyle } from './styles.ts';

/** Choices made once per 32-bar phrase. */
export interface BassPlan {
  /** Style of sections A, A' and A''. */
  readonly main: BassStyle;
  /** Style of section B. Always differs from main. */
  readonly transition: BassStyle;
  readonly transitionCenter: ScaleDegree;
}

export function bassPlan(phraseSeed: Seed): BassPlan {
  const rng = createRng(hash(phraseSeed, TAG.bassStyle));
  const main = BASS_STYLES[rng.int(BASS_STYLES.length)] ?? 'kickFollow';
  const others = BASS_STYLES.filter((style) => style !== main);
  const transition = others[rng.int(others.length)] ?? 'long';
  const transitionCenter = TRANSITION_CENTERS[rng.int(TRANSITION_CENTERS.length)] ?? TRANSITION_CENTERS[0]!;
  return { main, transition, transitionCenter };
}
