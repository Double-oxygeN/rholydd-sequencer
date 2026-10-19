import type { ChordTone } from '../structure/chords.ts';
import type { CrashPlace } from './cymbal/index.ts';
import { DEFAULT_STRUCTURE_TUNING, type StructureTuning } from '../structure/tuning.ts';
import type { UnitInterval, Weight } from '../units.ts';
import type { FillLength, PhraseFillLength } from './drums/fill.ts';
import type { Velocity } from './types.ts';

export interface FillTuning {
  /** How often each length of the fill at the end of 8 bars comes up. */
  readonly sectionLength: Readonly<Record<FillLength, Weight>>;
  /** How often each length of the big fill at the end of 32 bars comes up. */
  readonly phraseLength: Readonly<Record<PhraseFillLength, Weight>>;
}

export type ToneWeights = Readonly<Record<ChordTone, Weight>>;

export interface LineTuning {
  readonly subOctaveJumpChance: UnitInterval;
  readonly subToneWeights: ToneWeights;
  readonly reeseToneWeights: ToneWeights;
  /** Level differences between parts are left to the mixer, so these only shape each part's own dynamics. */
  readonly velocity: Readonly<Record<'sub' | 'reese' | 'stab' | 'pad' | 'pickup', Velocity>>;
}

export interface CymbalTuning {
  readonly crash: Readonly<Record<CrashPlace, Velocity>>;
  /** The ride's beats, and its offbeat 8ths when it plays every 8th. */
  readonly ride: { readonly accent: Velocity; readonly soft: Velocity };
}

/** Every number of generation that listening tunes. */
export interface GenerationTuning extends StructureTuning {
  readonly fill: FillTuning;
  readonly lines: LineTuning;
  readonly cymbal: CymbalTuning;
}

const unit = (x: number) => x as UnitInterval;
const weight = (x: number) => x as Weight;
const velocity = (x: number) => x as Velocity;

export const DEFAULT_GENERATION_TUNING: GenerationTuning = {
  ...DEFAULT_STRUCTURE_TUNING,
  fill: {
    // Longer fills are rarer so that they keep their impact.
    sectionLength: { 4: weight(0.4), 8: weight(0.4), 16: weight(0.15), 32: weight(0.05) },
    phraseLength: { 16: weight(0.6), 32: weight(0.4) },
  },
  lines: {
    subOctaveJumpChance: unit(0.2),
    subToneWeights: { root: weight(0.5), third: weight(0.1), fifth: weight(0.15), seventh: weight(0.1) },
    // Leans on the root and the 5th more than the sub does, so the two basses rarely sound a 3rd against each other.
    reeseToneWeights: { root: weight(0.6), third: weight(0.1), fifth: weight(0.2), seventh: weight(0.1) },
    velocity: { sub: velocity(0.8), reese: velocity(0.8), stab: velocity(0.7), pad: velocity(0.6), pickup: velocity(0.9) },
  },
  cymbal: {
    // Strongest where the drop lands, the boundary the whole build leads up to.
    crash: { drop: velocity(1), dropPhrase: velocity(0.8), intro: velocity(0.7), build: velocity(0.7) },
    ride: { accent: velocity(0.7), soft: velocity(0.45) },
  },
};
