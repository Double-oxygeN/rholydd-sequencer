import type { ChannelId } from '../params/mixer.ts';
import type { Brand, UnitInterval } from '../units.ts';
import type { Seconds } from './ducking.ts';

/**
 * Numbers of the sound that listening tunes. Like the generation's, each has a default here and may be overridden
 * by the config file; none of them ever reaches the ensemble, so they never change what a seed plays.
 */

/** Level change in decibels. Not limited to whole numbers, unlike a fader. */
export type Db = Brand<number, 'Db'>;
export type Hertz = Brand<number, 'Hertz'>;

export type SourceId = Exclude<ChannelId, 'reverbReturn'>;
export type DuckedPart = 'sub' | 'reese' | 'pad';

export interface CompressorTuning {
  readonly threshold: Db;
  readonly ratio: number;
  readonly attack: Seconds;
  readonly release: Seconds;
}

export interface FxTuning {
  readonly riser: { readonly peakGain: UnitInterval; readonly lowHz: Hertz; readonly highHz: Hertz };
  readonly highpass: { readonly openHz: Hertz; readonly closedHz: Hertz };
  readonly lowpass: { readonly closedHz: Hertz; readonly openHz: Hertz };
  /** Taken after the snare's trim, so a full send matches the dry snare's level. */
  readonly throwSend: UnitInterval;
  readonly impactVolumeDb: Db;
}

export interface SoundTuning {
  /** Evens out the sources so that every fader starts at 0 dB. */
  readonly trimDb: Readonly<Record<SourceId, Db>>;
  /** How deep each ducked part dips relative to the ducking depth. */
  readonly duckRatio: Readonly<Record<DuckedPart, UnitInterval>>;
  readonly reverb: { readonly decay: Seconds; readonly preDelay: Seconds };
  readonly dynamics: {
    readonly drumBus: CompressorTuning;
    readonly masterBus: CompressorTuning;
    readonly limiterThresholdDb: Db;
  };
  readonly fx: FxTuning;
}

const db = (x: number) => x as Db;
const hz = (x: number) => x as Hertz;
const s = (x: number) => x as Seconds;
const unit = (x: number) => x as UnitInterval;

export const DEFAULT_SOUND_TUNING: SoundTuning = {
  // Measured alone, the drums otherwise peaked right at full scale and left the limiter no headroom.
  // Listening put the sub's fader at -6 dB to sit right against the kick and the reese, so the trim takes it instead.
  trimDb: {
    kick: db(-8),
    snare: db(-10),
    hat: db(-14),
    ghost: db(-8),
    sub: db(-6),
    reese: db(-10),
    stab: db(-13),
    pad: db(-16),
    fx: db(-12),
  },
  // The sub clears the most room for the kick.
  duckRatio: { sub: unit(1), reese: unit(0.7), pad: unit(0.5) },
  reverb: { decay: s(2.5), preDelay: s(0.02) },
  dynamics: {
    drumBus: { threshold: db(-12), ratio: 3, attack: s(0.01), release: s(0.1) },
    masterBus: { threshold: db(-10), ratio: 2, attack: s(0.02), release: s(0.2) },
    limiterThresholdDb: db(-1),
  },
  fx: {
    riser: { peakGain: unit(0.5), lowHz: hz(300), highHz: hz(8000) },
    highpass: { openHz: hz(20), closedHz: hz(600) },
    lowpass: { closedHz: hz(400), openHz: hz(18000) },
    throwSend: unit(1),
    // Listening wanted the impact a little below the drop it lands with. Set on the synths, as the other per-sound
    // levels are, so that the riser on the same channel keeps its level.
    impactVolumeDb: db(-3),
  },
};
