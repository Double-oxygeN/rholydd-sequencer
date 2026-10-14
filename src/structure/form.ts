import type { UnitInterval } from '../units.ts';

/** How a 2-bar unit relates to the first 2 bars of its 8-bar section. */
export type PairRelation = 'repeat' | 'variant';
/** How an 8-bar section relates to the first 8 bars of its 32-bar phrase. */
export type SectionRelation = 'repeat' | 'variant' | 'transition';

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

/** First 8 bars of a 32-bar phrase: the reference that the other sections relate to. */
export interface ReferenceSection {
  readonly sectionIn32: 0;
  readonly relation: 'repeat';
  readonly isPhraseStart: true;
  readonly isPhraseEnd: false;
}

export interface VariantSection {
  readonly sectionIn32: 1;
  readonly relation: 'variant';
  readonly isPhraseStart: false;
  readonly isPhraseEnd: false;
}

export interface TransitionSection {
  readonly sectionIn32: 2;
  readonly relation: 'transition';
  readonly isPhraseStart: false;
  readonly isPhraseEnd: false;
}

/** Last 8 bars of a 32-bar phrase: its closing 2 bars carry the big fill. */
export interface ClosingSection {
  readonly sectionIn32: 3;
  readonly relation: 'variant';
  readonly isPhraseStart: false;
  readonly isPhraseEnd: true;
}

export type SectionRole = ReferenceSection | VariantSection | TransitionSection | ClosingSection;

/** 32bar = 8bar × 4 as repeat, variant, transition, variant (A A' B A''). */
export function sectionRole(sectionIn32: SectionIn32): SectionRole {
  switch (sectionIn32) {
    case 0:
      return { sectionIn32, relation: 'repeat', isPhraseStart: true, isPhraseEnd: false };
    case 1:
      return { sectionIn32, relation: 'variant', isPhraseStart: false, isPhraseEnd: false };
    case 2:
      return { sectionIn32, relation: 'transition', isPhraseStart: false, isPhraseEnd: false };
    case 3:
      return { sectionIn32, relation: 'variant', isPhraseStart: false, isPhraseEnd: true };
  }
}
