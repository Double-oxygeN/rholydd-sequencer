import { REL, TAG, hash, type Seed } from '../random/rng.ts';
import type { Brand, UnitInterval } from '../units.ts';
import { sectionEnergy } from './energy.ts';
import {
  phraseProgressions,
  type Chord,
  type MainProgression,
  type PhraseProgressions,
  type TransitionProgression,
} from './harmony.ts';
import { DEFAULT_KEY, type Key } from './key.ts';
import {
  BARS_PER_PAIR,
  PAIRS_PER_SECTION,
  SECTIONS_PER_PHRASE,
  pairRole,
  sectionRole,
  type PairIn8,
  type PairRole,
  type ClosingSection,
  type ReferenceSection,
  type SectionIn32,
  type SectionRole,
  type TransitionSection,
  type VariantSection,
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

/** The kind of progression follows from the section's role, so B can never carry the main progression. */
export type SectionHarmony =
  | {
      readonly sectionRole: ReferenceSection | VariantSection | ClosingSection;
      readonly progression: MainProgression;
    }
  | { readonly sectionRole: TransitionSection; readonly progression: TransitionProgression };

export type Context = PairRole &
  SectionHarmony & {
  readonly bar: BarIndex;
  readonly pair: PairIndex;
  readonly section: SectionIndex;
  readonly phrase: PhraseIndex;
  /** Fixed for the whole 8-bar section so that its repeat units stay identical. */
  readonly energy: UnitInterval;
  /** Fixed for the session. Only transposes pitches and never feeds a seed, so changing it keeps the same piece. */
  readonly key: Key;
  readonly seeds: Seeds;
  readonly params: GenerationParams;
};

/** Chord of the 2 bars. Derived rather than stored so that it can never disagree with the progression. */
export function chordOf(ctx: PairRole & SectionHarmony): Chord {
  return ctx.progression[ctx.pairIn8];
}

function sectionHarmony(role: SectionRole, progressions: PhraseProgressions): SectionHarmony {
  return role.relation === 'transition'
    ? { sectionRole: role, progression: progressions.transition }
    : { sectionRole: role, progression: progressions.main };
}

export interface Conductor {
  /** Context for the next 2 bars. */
  next(live: LiveParams): Context;
}

export function createConductor(master: Seed, key: Key = DEFAULT_KEY): Conductor {
  let pair = 0;
  let sectionParams: SectionParams | undefined;
  let phraseParams: PhraseParams | undefined;
  let energy: UnitInterval | undefined;
  let progressions: PhraseProgressions | undefined;
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
      const phraseSeed = hash(master, TAG.phrase, phrase);
      if ((role.isSectionStart && inPhrase.isPhraseStart) || phraseParams === undefined || progressions === undefined) {
        phraseParams = { m32: live.m32 };
        progressions = phraseProgressions(progressions?.main, phraseSeed, phraseParams.m32);
      }
      const sectionSeed = hash(phraseSeed, TAG.section, inPhrase.sectionIn32);
      const ctx: Context = {
        ...role,
        bar: (pair * BARS_PER_PAIR) as BarIndex,
        pair: pair as PairIndex,
        section: section as SectionIndex,
        phrase: phrase as PhraseIndex,
        ...sectionHarmony(inPhrase, progressions),
        energy,
        key,
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
