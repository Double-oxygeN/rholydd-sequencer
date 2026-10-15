import { TAG, createRng, hash, type Seed } from '../random/rng.ts';
import type { UnitInterval } from '../units.ts';
import { noteNameIn, stepFifths, type FifthsFromInitial, type Key, type PitchClass } from './key.ts';
import type { HarmonyTuning } from './tuning.ts';

/**
 * Chords the progressions are built from: the diatonic seventh chords of natural minor. ii is left out: its
 * diminished 5th would let the sub bass sound a tritone against the root.
 */
export const DIATONIC_SYMBOLS = ['i', 'III', 'iv', 'v', 'VI', 'VII'] as const;
export type DiatonicSymbol = (typeof DIATONIC_SYMBOLS)[number];
export type OffTonic = Exclude<DiatonicSymbol, 'i'>;

/** Chords borrowed from modes sharing the tonic: dorian IV7, phrygian ♭IImaj7 and the dominant of harmonic minor. */
export const BORROWED_SYMBOLS = ['IV7', 'bIImaj7', 'V7'] as const;
export type BorrowedSymbol = (typeof BORROWED_SYMBOLS)[number];

export type ChordSymbol = DiatonicSymbol | BorrowedSymbol;

export type Quality = 'minor7' | 'major7' | 'dominant7';
export type Tension = 'ninth' | 'flatNinth' | 'eleventh' | 'sharpEleventh' | 'thirteenth';

interface ChordSpec {
  /** Semitones from the tonic to the root. */
  readonly root: number;
  readonly quality: Quality;
  /** Tensions that colour the chord without clashing with it: no avoid notes. */
  readonly tensions: readonly Tension[];
}

/** The four notes of a chord, which the basses choose from. */
export const CHORD_TONES = ['root', 'third', 'fifth', 'seventh'] as const;
export type ChordTone = (typeof CHORD_TONES)[number];

const QUALITY_INTERVALS: Readonly<Record<Quality, Readonly<Record<ChordTone, number>>>> = {
  minor7: { root: 0, third: 3, fifth: 7, seventh: 10 },
  major7: { root: 0, third: 4, fifth: 7, seventh: 11 },
  dominant7: { root: 0, third: 4, fifth: 7, seventh: 10 },
};

const TENSION_INTERVAL: Readonly<Record<Tension, number>> = {
  flatNinth: 1,
  ninth: 2,
  eleventh: 5,
  sharpEleventh: 6,
  thirteenth: 9,
};

/**
 * Every tension below lies in the key's natural minor, so only the borrowed chords' own tones ever leave the scale.
 * Left out: the 9th of v (D♭ would be a minor 9th, and D is outside the scale), the 11ths of III and VII (a minor
 * 9th above their 3rds).
 */
export const CHORDS = {
  i: { root: 0, quality: 'minor7', tensions: ['ninth', 'eleventh'] },
  III: { root: 3, quality: 'major7', tensions: ['ninth'] },
  iv: { root: 5, quality: 'minor7', tensions: ['ninth', 'eleventh'] },
  v: { root: 7, quality: 'minor7', tensions: ['eleventh'] },
  VI: { root: 8, quality: 'major7', tensions: ['ninth', 'sharpEleventh'] },
  VII: { root: 10, quality: 'dominant7', tensions: ['ninth', 'thirteenth'] },
  IV7: { root: 5, quality: 'dominant7', tensions: ['ninth'] },
  bIImaj7: { root: 1, quality: 'major7', tensions: ['ninth'] },
  V7: { root: 7, quality: 'dominant7', tensions: ['flatNinth'] },
} as const satisfies Readonly<Record<ChordSymbol, ChordSpec>>;

export type TensionOf<S extends ChordSymbol> = (typeof CHORDS)[S]['tensions'][number];

/** A chord with its tension, if any. Distributes over the symbols so that no chord can take another's tension. */
export type Colored<S extends ChordSymbol> = S extends ChordSymbol
  ? { readonly symbol: S; readonly tension: TensionOf<S> | null }
  : never;
export type ColoredChord = Colored<ChordSymbol>;

/**
 * Where a progression may borrow: iv and v keep their function (subdominant and dominant) under the borrowed chord,
 * so the chords around them still lead into it. i, III, VI and VII carry the sound of natural minor and stay.
 */
export const BORROWINGS = { iv: ['IV7', 'bIImaj7'], v: ['V7'] } as const satisfies Partial<
  Readonly<Record<DiatonicSymbol, readonly BorrowedSymbol[]>>
>;
type SubstituteOf<D extends DiatonicSymbol> =
  | D
  | (D extends keyof typeof BORROWINGS ? (typeof BORROWINGS)[D][number] : never);
/** What a chord of a skeleton may become once coloured. */
export type ColoredAt<D extends DiatonicSymbol> = Colored<SubstituteOf<D>>;

/** One chord per 2 bars of an 8-bar section. Sections A, A' and A'' play it. */
export type MainSkeleton = readonly ['i', DiatonicSymbol, DiatonicSymbol, DiatonicSymbol];
/**
 * Section B plays it. Starting away from i moves the centre the way B moved the bass in phase 1. Ending away
 * from i keeps the return to i in A'' fresh: ending on i ran into it and held i for up to 8 bars.
 */
export type TransitionSkeleton = readonly [OffTonic, DiatonicSymbol, DiatonicSymbol, OffTonic];

/** The skeleton picked from the table, kept to tell progressions apart, and the chords that actually sound. */
export interface MainProgression {
  readonly skeleton: MainSkeleton;
  readonly chords: readonly [Colored<'i'>, ColoredChord, ColoredChord, ColoredChord];
}
export interface TransitionProgression {
  readonly skeleton: TransitionSkeleton;
  readonly chords: readonly [ColoredAt<OffTonic>, ColoredChord, ColoredChord, ColoredAt<OffTonic>];
}
export type Progression = MainProgression | TransitionProgression;

export const MAIN_SKELETONS: readonly MainSkeleton[] = [
  ['i', 'VI', 'III', 'VII'],
  ['i', 'VII', 'VI', 'VII'],
  ['i', 'iv', 'VI', 'VII'],
  ['i', 'VI', 'iv', 'v'],
  ['i', 'i', 'VI', 'VII'],
  ['i', 'III', 'VII', 'VI'],
  // Passes through the relative major's ii–V–I.
  ['i', 'iv', 'VII', 'III'],
  // Ends on v, which a borrowed V7 turns into a strong pull back to the i of the next section.
  ['i', 'VI', 'VII', 'v'],
];

export const TRANSITION_SKELETONS: readonly TransitionSkeleton[] = [
  ['VI', 'VII', 'i', 'VII'],
  ['iv', 'v', 'VI', 'VII'],
  ['VI', 'III', 'VII', 'VII'],
  ['iv', 'VI', 'VII', 'VII'],
  ['VI', 'VII', 'iv', 'v'],
];

export function isBorrowed(chord: ColoredChord): boolean {
  return (BORROWED_SYMBOLS as readonly ChordSymbol[]).includes(chord.symbol);
}

function spec(chord: ColoredChord): ChordSpec {
  return CHORDS[chord.symbol];
}

/** Pitch class of one of the chord's four notes in the given key. */
export function chordToneClass(key: Key, chord: ColoredChord, tone: ChordTone): PitchClass {
  const { root, quality } = spec(chord);
  return ((key + root + QUALITY_INTERVALS[quality][tone]) % 12) as PitchClass;
}

export function tensionClass(key: Key, chord: ColoredChord): PitchClass | null {
  if (chord.tension === null) return null;
  return ((key + spec(chord).root + TENSION_INTERVAL[chord.tension]) % 12) as PitchClass;
}

/** The tones the upper parts may sound: the chord's four notes and its tension. */
export function chordClasses(key: Key, chord: ColoredChord): readonly PitchClass[] {
  const tension = tensionClass(key, chord);
  const tones = CHORD_TONES.map((tone) => chordToneClass(key, chord, tone));
  return tension === null ? tones : [...tones, tension];
}

const SUFFIX: Readonly<Record<Quality, string>> = { minor7: 'm7', major7: 'maj7', dominant7: '7' };
const TENSION_NAME: Readonly<Record<Tension, string>> = {
  ninth: '9',
  flatNinth: '♭9',
  eleventh: '11',
  sharpEleventh: '♯11',
  thirteenth: '13',
};

/** Name such as D♭maj7 or Fm7(9) in the given key. */
export function chordName(key: Key, chord: ColoredChord): string {
  const { quality } = spec(chord);
  const tension = chord.tension === null ? '' : `(${TENSION_NAME[chord.tension]})`;
  return `${noteNameIn(key, chordToneClass(key, chord, 'root'))}${SUFFIX[quality]}${tension}`;
}

const ROMAN: Readonly<Record<ChordSymbol, string>> = {
  i: 'i',
  III: 'III',
  iv: 'iv',
  v: 'v',
  VI: 'VI',
  VII: 'VII',
  IV7: 'IV7',
  bIImaj7: '♭IImaj7',
  V7: 'V7',
};

/** Name such as iv or VI(♯11), independent of the key. */
export function romanName(chord: ColoredChord): string {
  return chord.tension === null ? ROMAN[chord.symbol] : `${ROMAN[chord.symbol]}(${TENSION_NAME[chord.tension]})`;
}

/** Name such as i–VI–III–VII, independent of the key. */
export function skeletonName(skeleton: MainSkeleton | TransitionSkeleton): string {
  return skeleton.map((symbol) => ROMAN[symbol]).join('–');
}

const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)] ?? list[0]!;

/** Draws of one chord's colouring, always all four so that no chord shifts the stream of the next. */
type ColorRolls = readonly [borrow: number, borrowed: number, tension: number, which: number];

function withTension<S extends ChordSymbol>(symbol: S, [, , roll, which]: ColorRolls, tuning: HarmonyTuning): Colored<S> {
  const tensions: readonly TensionOf<S>[] = CHORDS[symbol].tensions;
  const tension = roll < tuning.tensionChance ? pick(tensions, which) : null;
  return { symbol, tension } as Colored<S>;
}

function colorChord<D extends DiatonicSymbol>(base: D, rolls: ColorRolls, tuning: HarmonyTuning): ColoredAt<D> {
  const borrowings = (base in BORROWINGS ? BORROWINGS[base as keyof typeof BORROWINGS] : []) as readonly SubstituteOf<D>[];
  const [borrow, borrowed] = rolls;
  const symbol: SubstituteOf<D> = borrowings.length > 0 && borrow < tuning.borrowChance ? pick(borrowings, borrowed) : base;
  return withTension(symbol, rolls, tuning) as ColoredAt<D>;
}

function colorRolls(seed: Seed): readonly ColorRolls[] {
  const rng = createRng(hash(seed, TAG.harmonyColor));
  return Array.from({ length: 4 }, (): ColorRolls => [rng.float(), rng.float(), rng.float(), rng.float()]);
}

export function colorMain(skeleton: MainSkeleton, seed: Seed, tuning: HarmonyTuning): MainProgression {
  const [r0, r1, r2, r3] = colorRolls(seed) as readonly [ColorRolls, ColorRolls, ColorRolls, ColorRolls];
  return {
    skeleton,
    chords: [
      colorChord(skeleton[0], r0, tuning),
      colorChord(skeleton[1], r1, tuning),
      colorChord(skeleton[2], r2, tuning),
      colorChord(skeleton[3], r3, tuning),
    ],
  };
}

export function colorTransition(skeleton: TransitionSkeleton, seed: Seed, tuning: HarmonyTuning): TransitionProgression {
  const [r0, r1, r2, r3] = colorRolls(seed) as readonly [ColorRolls, ColorRolls, ColorRolls, ColorRolls];
  return {
    skeleton,
    chords: [
      colorChord(skeleton[0], r0, tuning),
      colorChord(skeleton[1], r1, tuning),
      colorChord(skeleton[2], r2, tuning),
      colorChord(skeleton[3], r3, tuning),
    ],
  };
}

/**
 * Main progression of a cycle. It carries over from the previous cycle, colouring and all, unless a draw under m32
 * replaces it, so that one knob sets how much each cycle changes, as it does for the drum reference.
 */
export function cycleMainProgression(
  previousMain: MainProgression | undefined,
  cycleSeed: Seed,
  m32: UnitInterval,
  tuning: HarmonyTuning,
): MainProgression {
  const rng = createRng(hash(cycleSeed, TAG.progression));
  const changeRoll = rng.float();
  const mainRoll = rng.float();
  if (previousMain === undefined) return colorMain(pick(MAIN_SKELETONS, mainRoll), cycleSeed, tuning);
  if (changeRoll >= m32) return previousMain;
  const others = MAIN_SKELETONS.filter((skeleton) => skeleton !== previousMain.skeleton);
  return colorMain(pick(others, mainRoll), cycleSeed, tuning);
}

/**
 * Key of a cycle, as steps from the initial key. Each move goes one step round the circle of fifths from the
 * previous cycle's key, the keys a DJ can mix into without a clash, with no pull back towards the initial key:
 * like a DJ set, each track only has to suit the one before it.
 */
export function cycleModulation(
  previous: FifthsFromInitial,
  cycleSeed: Seed,
  m32: UnitInterval,
  // Below 1, because a new key stands out more than a new progression and feels restless when it comes too often.
  share: UnitInterval,
): FifthsFromInitial {
  const rng = createRng(hash(cycleSeed, TAG.modulation));
  const changeRoll = rng.float();
  const directionRoll = rng.float();
  if (changeRoll >= m32 * share) return previous;
  return stepFifths(previous, directionRoll < 0.5 ? 1 : -1);
}

/** Transition progression of a 32-bar phrase, chosen and coloured afresh for every B. */
export function phraseTransitionProgression(phraseSeed: Seed, tuning: HarmonyTuning): TransitionProgression {
  const rng = createRng(hash(phraseSeed, TAG.progression));
  // The main progression used to come from the first two draws; skipping them keeps the transitions of phase 2.
  rng.float();
  rng.float();
  return colorTransition(pick(TRANSITION_SKELETONS, rng.float()), phraseSeed, tuning);
}
