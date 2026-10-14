import { REL, TAG, hash, type Seed } from '../random/rng.ts';
import type { Brand, UnitInterval } from '../units.ts';
import {
  BARS_PER_PAIR,
  PAIRS_PER_SECTION,
  SECTIONS_PER_PHRASE,
  pairRole,
  type PairIn8,
  type PairRole,
  type SectionIn32,
} from './form.ts';

/** Bar count from the start of playback (0-based). */
export type BarIndex = Brand<number, 'BarIndex'>;
/** 2-bar unit count from the start of playback (0-based). */
export type PairIndex = Brand<number, 'PairIndex'>;
/** 8-bar section count from the start of playback (0-based). */
export type SectionIndex = Brand<number, 'SectionIndex'>;

export interface Seeds {
  readonly section: Seed;
  readonly ornament: Seed;
  readonly fill: Seed;
}

/** Parameters that affect generation and only change at 8-bar boundaries. */
export interface SectionParams {
  readonly m2: UnitInterval;
  readonly m8: UnitInterval;
}

/** Values read from the UI each time a 2-bar unit is generated. */
export interface LiveParams extends SectionParams {
  readonly fillIntensity: UnitInterval;
}

export type Context = PairRole & {
  readonly bar: BarIndex;
  readonly pair: PairIndex;
  readonly section: SectionIndex;
  readonly sectionIn32: SectionIn32;
  readonly seeds: Seeds;
  readonly params: SectionParams;
};

export interface Conductor {
  /** Context for the next 2 bars. */
  next(live: LiveParams): Context;
}

export function createConductor(master: Seed): Conductor {
  let pair = 0;
  let latched: SectionParams | undefined;
  return {
    next(live) {
      const pairIn8 = (pair % PAIRS_PER_SECTION) as PairIn8;
      const section = Math.floor(pair / PAIRS_PER_SECTION);
      const role = pairRole(pairIn8, live.fillIntensity);
      if (role.isSectionStart || latched === undefined) latched = { m2: live.m2, m8: live.m8 };
      const sectionSeed = hash(master, TAG.section, section);
      const ctx: Context = {
        ...role,
        bar: (pair * BARS_PER_PAIR) as BarIndex,
        pair: pair as PairIndex,
        section: section as SectionIndex,
        sectionIn32: (section % SECTIONS_PER_PHRASE) as SectionIn32,
        seeds: {
          section: sectionSeed,
          ornament: hash(sectionSeed, REL[role.relation]),
          fill: hash(sectionSeed, TAG.fill),
        },
        params: latched,
      };
      pair++;
      return ctx;
    },
  };
}
