import { REL, TAG, hash, type Seed } from '../random/rng.ts';
import type { Brand, UnitInterval } from '../units.ts';
import { sectionEnergy } from './energy.ts';
import {
  BARS_PER_PAIR,
  PAIRS_PER_SECTION,
  SECTIONS_PER_PHRASE,
  pairRole,
  sectionRole,
  type PairIn8,
  type PairRole,
  type SectionIn32,
  type SectionRole,
} from './form.ts';

/** Bar count from the start of playback (0-based). */
export type BarIndex = Brand<number, 'BarIndex'>;
/** 2-bar unit count from the start of playback (0-based). */
export type PairIndex = Brand<number, 'PairIndex'>;
/** 8-bar section count from the start of playback (0-based). */
export type SectionIndex = Brand<number, 'SectionIndex'>;
/** 32-bar phrase count from the start of playback (0-based). */
export type PhraseIndex = Brand<number, 'PhraseIndex'>;

export interface Seeds {
  readonly phrase: Seed;
  readonly section: Seed;
  readonly ornament: Seed;
  readonly fill: Seed;
}

/** Parameters that only change at 8-bar boundaries. */
export interface SectionParams {
  readonly m2: UnitInterval;
  readonly m8: UnitInterval;
}

/** Parameters that only change at 32-bar boundaries. */
export interface PhraseParams {
  readonly m32: UnitInterval;
}

export type GenerationParams = SectionParams & PhraseParams;

/** Values read from the UI each time a 2-bar unit is generated. */
export interface LiveParams extends SectionParams, PhraseParams {
  readonly fillIntensity: UnitInterval;
  /** How far the energy curve dips below full energy. Read at 8-bar boundaries. */
  readonly energyDepth: UnitInterval;
}

export type Context = PairRole & {
  readonly bar: BarIndex;
  readonly pair: PairIndex;
  readonly section: SectionIndex;
  readonly phrase: PhraseIndex;
  readonly sectionRole: SectionRole;
  /** Fixed for the whole 8-bar section so that its repeat units stay identical. */
  readonly energy: UnitInterval;
  readonly seeds: Seeds;
  readonly params: GenerationParams;
};

export interface Conductor {
  /** Context for the next 2 bars. */
  next(live: LiveParams): Context;
}

export function createConductor(master: Seed): Conductor {
  let pair = 0;
  let sectionParams: SectionParams | undefined;
  let phraseParams: PhraseParams | undefined;
  let energy: UnitInterval | undefined;
  return {
    next(live) {
      const section = Math.floor(pair / PAIRS_PER_SECTION);
      const phrase = Math.floor(section / SECTIONS_PER_PHRASE);
      const role = pairRole((pair % PAIRS_PER_SECTION) as PairIn8, live.fillIntensity);
      const inPhrase = sectionRole((section % SECTIONS_PER_PHRASE) as SectionIn32);
      if (role.isSectionStart || sectionParams === undefined || energy === undefined) {
        sectionParams = { m2: live.m2, m8: live.m8 };
        energy = sectionEnergy(inPhrase.sectionIn32, live.energyDepth);
      }
      if ((role.isSectionStart && inPhrase.isPhraseStart) || phraseParams === undefined) {
        phraseParams = { m32: live.m32 };
      }
      const phraseSeed = hash(master, TAG.phrase, phrase);
      const sectionSeed = hash(phraseSeed, TAG.section, inPhrase.sectionIn32);
      const ctx: Context = {
        ...role,
        bar: (pair * BARS_PER_PAIR) as BarIndex,
        pair: pair as PairIndex,
        section: section as SectionIndex,
        phrase: phrase as PhraseIndex,
        sectionRole: inPhrase,
        energy,
        seeds: {
          phrase: phraseSeed,
          section: sectionSeed,
          ornament: hash(sectionSeed, TAG.ornament, REL[role.relation]),
          fill: hash(sectionSeed, TAG.fill),
        },
        params: { ...sectionParams, ...phraseParams },
      };
      pair++;
      return ctx;
    },
  };
}
