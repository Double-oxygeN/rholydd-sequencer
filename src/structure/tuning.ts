import type { UnitInterval, Weight } from '../units.ts';
import type { SectionIn32 } from './form.ts';

/**
 * Numbers that listening tunes, as opposed to the rules and tables they tune. Each has a default here and may be
 * overridden by the config file, so a session takes them as a whole when it starts and never reads them again.
 */

export interface HarmonyTuning {
  /** Chance that a chord of a progression takes a tension. */
  readonly tensionChance: UnitInterval;
  /** Chance that a iv or a v of a progression gives way to a chord borrowed from a parallel mode. */
  readonly borrowChance: UnitInterval;
  /** Share of m32 that a cycle modulates with. */
  readonly modulationShare: UnitInterval;
}

/** Energy of the drop's sections A, A', B and A'' before the depth applies. */
export type PhraseCurve = Readonly<Record<SectionIn32, UnitInterval>>;

export interface SceneCurve {
  readonly intro: UnitInterval;
  /** First 8 bars of a 16-bar build. */
  readonly buildFirst: UnitInterval;
  /** Last 8 bars of every build. */
  readonly buildLast: UnitInterval;
  readonly breakdown: UnitInterval;
}

export interface EnergyTuning {
  readonly phrase: PhraseCurve;
  readonly scene: SceneCurve;
}

/** Which drops of a cycle run to 64 bars instead of 32. */
export const DROP_EXTENSIONS = ['none', 'first', 'second', 'both'] as const;
export type DropExtension = (typeof DROP_EXTENSIONS)[number];

export interface LayoutTuning {
  /** Chance of a 24-bar intro rather than a 16-bar one. */
  readonly longIntroChance: UnitInterval;
  readonly longBreakdownChance: UnitInterval;
  readonly dropExtension: Readonly<Record<DropExtension, Weight>>;
}

/** What the conductor needs. */
export interface StructureTuning {
  readonly harmony: HarmonyTuning;
  readonly energy: EnergyTuning;
  readonly layout: LayoutTuning;
}

const unit = (x: number) => x as UnitInterval;
const weight = (x: number) => x as Weight;

export const DEFAULT_STRUCTURE_TUNING: StructureTuning = {
  harmony: { tensionChance: unit(0.4), borrowChance: unit(0.2), modulationShare: unit(0.5) },
  energy: {
    // Low in the transition and highest in the last section, so the big fill leads into the next phrase at full energy.
    phrase: { 0: unit(0.75), 1: unit(0.9), 2: unit(0.5), 3: unit(1) },
    // Builds top out at the drop's A so that the drop never starts thinner than the build before it.
    scene: { intro: unit(0.5), buildFirst: unit(0.6), buildLast: unit(0.75), breakdown: unit(0.4) },
  },
  layout: {
    longIntroChance: unit(0.5),
    longBreakdownChance: unit(0.5),
    // Equal chances of 128, 160 and 192 bars: no extension, either drop alone, or both.
    dropExtension: { none: weight(1 / 3), first: weight(1 / 6), second: weight(1 / 6), both: weight(1 / 3) },
  },
};
