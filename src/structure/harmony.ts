import { TAG, createRng, hash, type Seed } from '../random/rng.ts';
import type { UnitInterval } from '../units.ts';
import { noteNameIn, pitchClassOf, shiftDegree, type FifthsFromInitial, type Key, type ScaleDegree } from './key.ts';

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
/**
 * Section B plays it. Starting away from i moves the centre the way B moved the bass in phase 1. Ending away
 * from i keeps the return to i in A'' fresh: ending on i ran into it and held i for up to 8 bars.
 */
export type TransitionProgression = readonly [OffTonicChord, Chord, Chord, OffTonicChord];
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
  [VI, VII, i, VII],
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

const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)] ?? list[0]!;

/**
 * Main progression of a cycle. It carries over from the previous cycle unless a draw under m32 replaces it, so
 * that one knob sets how much each cycle changes, as it does for the drum reference.
 */
export function cycleMainProgression(
  previousMain: MainProgression | undefined,
  cycleSeed: Seed,
  m32: UnitInterval,
): MainProgression {
  const rng = createRng(hash(cycleSeed, TAG.progression));
  const changeRoll = rng.float();
  const mainRoll = rng.float();
  if (previousMain === undefined) return pick(MAIN_PROGRESSIONS, mainRoll);
  return changeRoll < m32
    ? pick(
        MAIN_PROGRESSIONS.filter((p) => p !== previousMain),
        mainRoll,
      )
    : previousMain;
}

// Half of m32, because a new key stands out more than a new progression and feels restless when it comes too often.
const MODULATION_SHARE = 0.5;

/**
 * Key of a cycle, as steps from the initial key. It moves only between the initial key and its neighbours on the
 * circle of fifths, the keys a DJ can mix into without a clash, and never sees the initial key itself so that
 * the same seed moves by the same steps whatever key it starts in.
 */
export function cycleModulation(previous: FifthsFromInitial, cycleSeed: Seed, m32: UnitInterval): FifthsFromInitial {
  const rng = createRng(hash(cycleSeed, TAG.modulation));
  const changeRoll = rng.float();
  const directionRoll = rng.float();
  if (changeRoll >= m32 * MODULATION_SHARE) return previous;
  if (previous !== 0) return 0;
  return directionRoll < 0.5 ? 1 : -1;
}

/** Transition progression of a 32-bar phrase, chosen afresh for every B. */
export function phraseTransitionProgression(phraseSeed: Seed): TransitionProgression {
  const rng = createRng(hash(phraseSeed, TAG.progression));
  // The main progression used to come from the first two draws; skipping them keeps the transitions of phase 2.
  rng.float();
  rng.float();
  return pick(TRANSITION_PROGRESSIONS, rng.float());
}

const ROMAN: Readonly<Record<ChordRoot, string>> = { 0: 'i', 2: 'III', 3: 'iv', 4: 'v', 5: 'VI', 6: 'VII' };

/** Name such as i–VI–III–VII, independent of the key. */
export function progressionName(progression: Progression): string {
  return progression.map((chord) => ROMAN[chord.root]).join('–');
}
