import { noteNameIn, type Key, type PitchClass } from './key.ts';

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

/** Name such as iv or ♭IImaj7 of the chord without its tension, independent of the key. */
export function romanSymbol(symbol: ChordSymbol): string {
  return ROMAN[symbol];
}

/** Name such as iv or VI(♯11), independent of the key. */
export function romanName(chord: ColoredChord): string {
  return chord.tension === null ? ROMAN[chord.symbol] : `${ROMAN[chord.symbol]}(${TENSION_NAME[chord.tension]})`;
}
