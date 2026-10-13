import type { UnitInterval } from '../units.ts';

export type Relation = 'repeat' | 'variant';

export const PAIRS_PER_SECTION = 4;
export const SECTIONS_PER_PHRASE = 4;
export const BARS_PER_PAIR = 2;

export type PairIn8 = 0 | 1 | 2 | 3;
export type SectionIn32 = 0 | 1 | 2 | 3;

/** First 2 bars of an 8-bar section: the base pattern may be mutated here. */
export interface OpeningPair {
  readonly pairIn8: 0;
  readonly isSectionStart: true;
  readonly isSectionEnd: false;
  readonly relation: 'repeat';
}

export interface MiddlePair {
  readonly pairIn8: 1 | 2;
  readonly isSectionStart: false;
  readonly isSectionEnd: false;
  readonly relation: 'repeat';
}

/** Last 2 bars of an 8-bar section: the only place a fill can occur. */
export interface ClosingPair {
  readonly pairIn8: 3;
  readonly isSectionStart: false;
  readonly isSectionEnd: true;
  readonly relation: 'variant';
  readonly fillIntensity: UnitInterval;
}

export type PairRole = OpeningPair | MiddlePair | ClosingPair;

/** 8bar = 2bar × 4 as repeat, repeat, repeat, variant. */
export function pairRole(pairIn8: PairIn8, fillIntensity: UnitInterval): PairRole {
  switch (pairIn8) {
    case 0:
      return { pairIn8, isSectionStart: true, isSectionEnd: false, relation: 'repeat' };
    case 1:
    case 2:
      return { pairIn8, isSectionStart: false, isSectionEnd: false, relation: 'repeat' };
    case 3:
      return { pairIn8, isSectionStart: false, isSectionEnd: true, relation: 'variant', fillIntensity };
  }
}
