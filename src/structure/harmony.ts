import { TAG, createRng, hash, type Seed } from '../random/rng.ts';
import type { UnitInterval } from '../units.ts';
import { noteNameIn, pitchClassOf, shiftDegree, type Key, type ScaleDegree } from './key.ts';

/**
 * Position of a chord's root in the natural minor scale. ii (1) is left out: its diminished 5th would let the
 * sub bass sound a tritone against the root.
 */
export type ChordRoot = 0 | 2 | 3 | 4 | 5 | 6;

/** Diatonic seventh chord stacked in scale thirds on the root. */
export interface Chord {
  readonly root: ChordRoot;
}

export type TonicChord = Chord & { readonly root: 0 };
export type OffTonicChord = Chord & { readonly root: Exclude<ChordRoot, 0> };

/** One chord per 2 bars of an 8-bar section. Sections A, A' and A'' play it. */
export type MainProgression = readonly [TonicChord, Chord, Chord, Chord];
/** Section B plays it. Starting away from i moves the centre the way B moved the bass in phase 1. */
export type TransitionProgression = readonly [OffTonicChord, Chord, Chord, Chord];
export type Progression = MainProgression | TransitionProgression;

const i = { root: 0 } as const;
const III = { root: 2 } as const;
const iv = { root: 3 } as const;
const v = { root: 4 } as const;
const VI = { root: 5 } as const;
const VII = { root: 6 } as const;

export const MAIN_PROGRESSIONS: readonly MainProgression[] = [
  [i, VI, III, VII],
  [i, VII, VI, VII],
  [i, iv, VI, VII],
  [i, VI, iv, v],
  [i, i, VI, VII],
  [i, III, VII, VI],
];

export const TRANSITION_PROGRESSIONS: readonly TransitionProgression[] = [
  [VI, VII, i, i],
  [iv, v, VI, VII],
  [VI, III, VII, VII],
  [iv, VI, VII, VII],
  [VI, VII, iv, v],
];

/** Scale steps from the root to each chord tone: root, 3rd, 5th and 7th. */
export const CHORD_TONE_STEPS = [0, 2, 4, 6] as const;

export function rootDegree(chord: Chord): ScaleDegree {
  return chord.root as ScaleDegree;
}

export function chordDegrees(chord: Chord): readonly ScaleDegree[] {
  return CHORD_TONE_STEPS.map((steps) => shiftDegree(rootDegree(chord), steps));
}

export function isChordTone(chord: Chord, degree: ScaleDegree): boolean {
  return chordDegrees(chord).includes(degree);
}

const SUFFIX: Readonly<Record<ChordRoot, string>> = { 0: 'm7', 2: 'maj7', 3: 'm7', 4: 'm7', 5: 'maj7', 6: '7' };

/** Name such as D♭maj7 in the given key. */
export function chordName(key: Key, chord: Chord): string {
  return `${noteNameIn(key, pitchClassOf(key, rootDegree(chord)))}${SUFFIX[chord.root]}`;
}

export interface PhraseProgressions {
  readonly main: MainProgression;
  readonly transition: TransitionProgression;
}

/**
 * Progressions of a 32-bar phrase. The main one carries over from the previous phrase unless a draw under m32
 * replaces it, so that one knob sets how much each phrase changes, as it does for the drum reference.
 */
export function phraseProgressions(
  previousMain: MainProgression | undefined,
  phraseSeed: Seed,
  m32: UnitInterval,
): PhraseProgressions {
  const rng = createRng(hash(phraseSeed, TAG.progression));
  const changeRoll = rng.float();
  const mainRoll = rng.float();
  const transitionRoll = rng.float();
  const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)] ?? list[0]!;
  const main =
    previousMain === undefined
      ? pick(MAIN_PROGRESSIONS, mainRoll)
      : changeRoll < m32
        ? pick(
            MAIN_PROGRESSIONS.filter((p) => p !== previousMain),
            mainRoll,
          )
        : previousMain;
  return { main, transition: pick(TRANSITION_PROGRESSIONS, transitionRoll) };
}

const ROMAN: Readonly<Record<ChordRoot, string>> = { 0: 'i', 2: 'III', 3: 'iv', 4: 'v', 5: 'VI', 6: 'VII' };

/** Name such as i–VI–III–VII, independent of the key. */
export function progressionName(progression: Progression): string {
  return progression.map((chord) => ROMAN[chord.root]).join('–');
}
