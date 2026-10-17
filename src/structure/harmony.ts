import { TAG, createRng, hash, type Seed } from '../random/rng.ts';
import type { UnitInterval } from '../units.ts';
import {
  CHORDS,
  romanSymbol,
  type BorrowedSymbol,
  type ChordSymbol,
  type Colored,
  type ColoredChord,
  type DiatonicSymbol,
  type OffTonic,
  type TensionOf,
} from './chords.ts';
import { stepFifths, type FifthsFromInitial } from './key.ts';
import type { HarmonyTuning } from './tuning.ts';

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
 * Section B plays it. Starting away from i moves the centre, as B's own bass style does. Ending away
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
  ['i', 'iv', 'VII', 'III'],
  ['i', 'VI', 'VII', 'v'],
];

export const TRANSITION_SKELETONS: readonly TransitionSkeleton[] = [
  ['VI', 'VII', 'i', 'VII'],
  ['iv', 'v', 'VI', 'VII'],
  ['VI', 'III', 'VII', 'VII'],
  ['iv', 'VI', 'VII', 'VII'],
  ['VI', 'VII', 'iv', 'v'],
];

/** Name such as i–VI–III–VII, independent of the key. */
export function skeletonName(skeleton: MainSkeleton | TransitionSkeleton): string {
  return skeleton.map(romanSymbol).join('–');
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
  // The main progression used to come from the first two draws; skipping them keeps every seed's transitions
  // as they were before the main progression moved to the cycle.
  rng.float();
  rng.float();
  return colorTransition(pick(TRANSITION_SKELETONS, rng.float()), phraseSeed, tuning);
}
