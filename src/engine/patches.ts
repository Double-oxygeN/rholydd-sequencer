import type { PadTimbre, ReeseTimbre, StabTimbre } from '../structure/timbre.ts';
import type { UnitInterval } from '../units.ts';
import type { Seconds } from './ducking.ts';

/** Envelope times in seconds; sustain as a share of the peak. */
export interface Envelope {
  readonly attack: Seconds;
  readonly decay: Seconds;
  readonly sustain: UnitInterval;
  readonly release: Seconds;
}

/** Detuned copies of one waveform. The count is capped per part by the type argument (N-12). */
export interface FatOscillator<C extends number> {
  readonly type: 'fatsawtooth' | 'fatsquare' | 'fattriangle';
  readonly count: C;
  /** Detune between the outermost copies in cents. */
  readonly spread: number;
}

/**
 * A carrier frequency-modulated by a sine. The ratio of the reese and the pad stays a whole number of at least 1:
 * anything else puts sidebands below the note or off its harmonic series, which reads as an octave down or a sour
 * chord, and a reese heard an octave down lands on the sub.
 */
export interface FmOscillator {
  readonly type: 'fmsine' | 'fmsawtooth';
  readonly harmonicity: number;
  readonly modulationIndex: number;
}

/** Makes up for how loud a sound is against the others of its part. Never above 0 dB (see the tables). */
type GainDb = number;

export interface ReesePatch {
  // One note at a time, so it can afford more copies than the chords.
  readonly oscillator: FatOscillator<2 | 3 | 4 | 5> | FmOscillator;
  readonly envelope: Envelope;
  readonly filterQ: number;
  readonly filterEnvelope: Envelope & { readonly baseFrequency: number; readonly octaves: number };
  readonly gainDb: GainDb;
}

export interface ChordPatch {
  // Up to 4 notes per chord on up to 12 voices, so each note gets no more than 3 oscillators.
  readonly oscillator: FatOscillator<2 | 3> | FmOscillator;
  readonly envelope: Envelope;
  readonly gainDb: GainDb;
}

const envelope = (attack: number, decay: number, sustain: number, release: number): Envelope => ({
  attack: attack as Seconds,
  decay: decay as Seconds,
  sustain: sustain as UnitInterval,
  release: release as Seconds,
});

// The first sound of every table is the one phase 2 played. The trims and the limiter's headroom were set with
// those, so they stay at 0 dB and every other sound is only ever turned down to match: a boost could clip (N-10).
// The corrections match the RMS of an offline render through the part's fixed filter to that of the first sound,
// to be settled by listening. Tone scales a fat oscillator down by its copies but plays FM at full scale, which is
// why the FM sounds need the deepest cuts. Sounds quieter than the first one stay at 0 dB rather than being boosted.

export const REESE_PATCHES: Readonly<Record<ReeseTimbre, ReesePatch>> = {
  // Detuned saws beating against each other are what make a reese.
  classic: {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
    envelope: envelope(0.005, 0.2, 0.8, 0.05),
    filterQ: 2,
    filterEnvelope: { ...envelope(0.01, 0.25, 0.3, 0.1), baseFrequency: 200, octaves: 3 },
    gainDb: 0,
  },
  wide: {
    oscillator: { type: 'fatsawtooth', count: 5, spread: 40 },
    envelope: envelope(0.005, 0.3, 0.9, 0.05),
    filterQ: 1,
    filterEnvelope: { ...envelope(0.02, 0.4, 0.5, 0.1), baseFrequency: 300, octaves: 2.5 },
    gainDb: -2,
  },
  hollow: {
    oscillator: { type: 'fatsquare', count: 3, spread: 20 },
    envelope: envelope(0.005, 0.15, 0.8, 0.05),
    filterQ: 4,
    filterEnvelope: { ...envelope(0.01, 0.2, 0.2, 0.1), baseFrequency: 250, octaves: 2 },
    gainDb: -5,
  },
  growl: {
    oscillator: { type: 'fmsawtooth', harmonicity: 1, modulationIndex: 2 },
    envelope: envelope(0.005, 0.25, 0.8, 0.05),
    filterQ: 6,
    filterEnvelope: { ...envelope(0.005, 0.35, 0.1, 0.1), baseFrequency: 150, octaves: 4 },
    gainDb: -3.5,
  },
};

export const STAB_PATCHES: Readonly<Record<StabTimbre, ChordPatch>> = {
  square: { oscillator: { type: 'fatsquare', count: 2, spread: 15 }, envelope: envelope(0.003, 0.12, 0.15, 0.15), gainDb: 0 },
  pluck: { oscillator: { type: 'fatsawtooth', count: 2, spread: 10 }, envelope: envelope(0.002, 0.2, 0, 0.1), gainDb: 0 },
  bell: {
    // A whole-number ratio too, so that the bell keeps the chord in tune.
    oscillator: { type: 'fmsine', harmonicity: 3, modulationIndex: 4 },
    envelope: envelope(0.002, 0.25, 0.05, 0.15),
    gainDb: -11.5,
  },
};

export const PAD_PATCHES: Readonly<Record<PadTimbre, ChordPatch>> = {
  saw: { oscillator: { type: 'fatsawtooth', count: 3, spread: 30 }, envelope: envelope(0.4, 0.6, 0.7, 1.2), gainDb: 0 },
  warm: { oscillator: { type: 'fattriangle', count: 3, spread: 20 }, envelope: envelope(0.5, 0.8, 0.8, 1.2), gainDb: -2 },
  glass: {
    oscillator: { type: 'fmsine', harmonicity: 2, modulationIndex: 1.5 },
    envelope: envelope(0.6, 1, 0.6, 1),
    gainDb: -3.5,
  },
};

/**
 * Voices per stab or pad synth. A voice is held from about a look-ahead before its note until the oscillator's
 * ended event reaches the main thread: stabs 2 steps apart then overlap three or four deep, and each pad chord
 * overlaps the release of the one before. 8 voices for 3-note chords dropped notes.
 */
export const CHORD_POLYPHONY = 12;

// The longest releases the polyphony above was worked out for. Each sound has its own synth, so the tail of the
// previous cycle's sound never takes voices from the next one.
export const STAB_MAX_RELEASE = 0.15 as Seconds;
export const PAD_MAX_RELEASE = 1.2 as Seconds;
