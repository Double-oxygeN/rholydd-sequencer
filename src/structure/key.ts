import type { Brand } from '../units.ts';

/** Pitch name as an integer in [0, 11], C = 0. */
export type PitchClass = Brand<number, 'PitchClass'>;

/** Tonic of the piece. The mode is always natural minor, so the tonic alone fixes the scale. */
export type Key = PitchClass;

/** Position within the 7-note scale: integer in [0, 6], 0 = tonic. */
export type ScaleDegree = Brand<number, 'ScaleDegree'>;

export const KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
export const ALL_KEYS: readonly Key[] = KEY_NAMES.map((_, i) => i as Key);
export const DEFAULT_KEY = 5 as Key;

const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
export const DEGREES_PER_OCTAVE = NATURAL_MINOR.length;
export const TONIC = 0 as ScaleDegree;

export function toKey(n: number): Key | undefined {
  return Number.isInteger(n) && n >= 0 && n < KEY_NAMES.length ? (n as Key) : undefined;
}

/** Moves along the scale, wrapping within the octave, so the result never leaves the key. */
export function shiftDegree(degree: ScaleDegree, steps: number): ScaleDegree {
  return ((((degree + steps) % DEGREES_PER_OCTAVE) + DEGREES_PER_OCTAVE) % DEGREES_PER_OCTAVE) as ScaleDegree;
}

export function pitchClassOf(key: Key, degree: ScaleDegree): PitchClass {
  return ((key + (NATURAL_MINOR[degree] ?? 0)) % 12) as PitchClass;
}

/** Scale degree of a MIDI note or pitch class, or undefined when it lies outside the key. */
export function degreeOf(key: Key, note: number): ScaleDegree | undefined {
  const fromTonic = (((note - key) % 12) + 12) % 12;
  const degree = NATURAL_MINOR.indexOf(fromTonic as (typeof NATURAL_MINOR)[number]);
  return degree < 0 ? undefined : (degree as ScaleDegree);
}

// Enharmonic spellings that KEY_NAMES does not use.
const KEY_ALIASES: Readonly<Record<string, Key>> = {
  'D♭': 1 as Key,
  'D♯': 3 as Key,
  'G♭': 6 as Key,
  'G♯': 8 as Key,
  'A♯': 10 as Key,
};

/** Accepts names such as F, F#, F♯, Bb and B♭. */
export function parseKey(text: string): Key | undefined {
  const name = text.trim().replace('#', '♯').replace(/^([A-G])b$/, '$1♭');
  const index = KEY_NAMES.findIndex((k) => k === name);
  return index >= 0 ? (index as Key) : KEY_ALIASES[name];
}
