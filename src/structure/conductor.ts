import { REL, TAG, hash, type Seed } from '../random/rng.ts';
import type { Brand, UnitInterval } from '../units.ts';
import {
  cycleScenes,
  cycleSections,
  drawLayout,
  sceneEnergy,
  type CycleIndex,
  type CycleLayout,
  type Scene,
  type SceneRole,
  type SectionInCycle,
} from './arrangement.ts';
import {
  cycleMainProgression,
  cycleModulation,
  phraseTransitionProgression,
  type Chord,
  type MainProgression,
  type TransitionProgression,
} from './harmony.ts';
import { AT_INITIAL_KEY, keyAt, type FifthsFromInitial, type Key } from './key.ts';
import { cycleTimbre, type CycleTimbre } from './timbre.ts';
import type { StructureTuning } from './tuning.ts';
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
  /** Shared by every 32 bars of a cycle: the theme that the drops bring back. */
  readonly cycle: Seed;
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
  /** Key of the cycle. Only transposes pitches and never feeds a seed, so another initial key keeps the same piece. */
  readonly key: Key;
  /** Sounds of the cycle. Playback picks the synths from it; the generators never read it. */
  readonly timbre: CycleTimbre;
  readonly cycle: CycleIndex;
  readonly layout: CycleLayout;
  readonly sectionInCycle: SectionInCycle;
  readonly sceneRole: SceneRole;
  // Contexts are made one at a time, so what comes after this section has to travel with it.
  /** Scene of the next 8 bars. The last section of a cycle is followed by the next cycle's intro. */
  readonly nextScene: Scene;
  readonly seeds: Seeds;
  readonly params: GenerationParams;
};

/** Chord of the 2 bars. Derived rather than stored so that it can never disagree with the progression. */
export function chordOf(ctx: PairRole & SectionHarmony): Chord {
  return ctx.progression[ctx.pairIn8];
}

function sectionHarmony(role: SectionRole, main: MainProgression, transition: TransitionProgression): SectionHarmony {
  return role.relation === 'transition'
    ? { sectionRole: role, progression: transition }
    : { sectionRole: role, progression: main };
}

/** Where the conductor is within the current cycle. Replaced as a whole at every cycle boundary. */
interface CycleState {
  readonly index: CycleIndex;
  readonly seed: Seed;
  readonly layout: CycleLayout;
  readonly scenes: readonly SceneRole[];
  /** Section count from the start of playback at which the cycle starts. */
  readonly firstSection: number;
  readonly main: MainProgression;
  readonly fifths: FifthsFromInitial;
  readonly timbre: CycleTimbre;
}

/** Fixed for the whole session: changing any of them needs a new conductor. */
export interface ConductorSettings {
  readonly seed: Seed;
  readonly initialKey: Key;
  readonly tuning: StructureTuning;
}

export interface Conductor {
  /** Context for the next 2 bars. */
  next(live: LiveParams): Context;
}

export function createConductor({ seed: master, initialKey, tuning }: ConductorSettings): Conductor {
  let pair = 0;
  let sectionParams: SectionParams | undefined;
  let phraseParams: PhraseParams | undefined;
  let energy: UnitInterval | undefined;
  let cycle: CycleState | undefined;
  let transition: TransitionProgression | undefined;
  return {
    next(live) {
      const section = Math.floor(pair / PAIRS_PER_SECTION);
      const phrase = Math.floor(section / SECTIONS_PER_PHRASE);
      const role = pairRole((pair % PAIRS_PER_SECTION) as PairIn8, live.fillIntensity);
      const inPhrase = sectionRole((section % SECTIONS_PER_PHRASE) as SectionIn32);
      const phraseSeed = hash(master, TAG.phrase, phrase);
      const phraseStarts = role.isSectionStart && inPhrase.isPhraseStart;
      if (phraseStarts || phraseParams === undefined || transition === undefined) {
        phraseParams = { m32: live.m32 };
        transition = phraseTransitionProgression(phraseSeed);
      }
      // Cycles always start on a 32-bar boundary, after m32 has been latched for the phrase.
      if (cycle === undefined || section === cycle.firstSection + cycleSections(cycle.layout)) {
        cycle = nextCycle(master, cycle, section, phraseParams.m32, tuning);
      }
      const sectionInCycle = (section - cycle.firstSection) as SectionInCycle;
      const sceneRole = cycle.scenes[sectionInCycle]!;
      if (role.isSectionStart || sectionParams === undefined || energy === undefined) {
        sectionParams = { m2: live.m2, m8: live.m8 };
        energy = sceneEnergy(sceneRole, inPhrase.sectionIn32, live.energyDepth, tuning.energy);
      }
      const sectionSeed = hash(phraseSeed, TAG.section, inPhrase.sectionIn32);
      const ctx: Context = {
        ...role,
        bar: (pair * BARS_PER_PAIR) as BarIndex,
        pair: pair as PairIndex,
        section: section as SectionIndex,
        phrase: phrase as PhraseIndex,
        ...sectionHarmony(inPhrase, cycle.main, transition),
        energy,
        key: keyAt(initialKey, cycle.fifths),
        timbre: cycle.timbre,
        cycle: cycle.index,
        layout: cycle.layout,
        sectionInCycle,
        sceneRole,
        nextScene: cycle.scenes[sectionInCycle + 1]?.scene ?? 'intro',
        seeds: {
          cycle: cycle.seed,
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

function nextCycle(
  master: Seed,
  previous: CycleState | undefined,
  firstSection: number,
  m32: UnitInterval,
  tuning: StructureTuning,
): CycleState {
  const index = (previous === undefined ? 0 : previous.index + 1) as CycleIndex;
  const seed = hash(master, TAG.cycle, index);
  const layout = drawLayout(seed, tuning.layout);
  return {
    index,
    seed,
    layout,
    scenes: cycleScenes(layout),
    firstSection,
    main: cycleMainProgression(previous?.main, seed, m32),
    fifths: previous === undefined ? AT_INITIAL_KEY : cycleModulation(previous.fifths, seed, m32, tuning.harmony.modulationShare),
    timbre: cycleTimbre(previous?.timbre, seed, m32),
  };
}
