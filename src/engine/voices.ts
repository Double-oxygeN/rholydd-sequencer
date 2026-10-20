import * as Tone from 'tone';
import { CYMBALS, PARTS, type Cymbal, type Part, type Pitch } from '../generators/types.ts';
import type { CycleTimbre, PadTimbre, ReeseTimbre, StabTimbre } from '../structure/timbre.ts';
import {
  CHORD_POLYPHONY,
  PAD_PATCHES,
  REESE_PATCHES,
  STAB_PATCHES,
  type ChordPatch,
  type FatOscillator,
  type FmOscillator,
  type ReesePatch,
} from './patches.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
export const ROOT_NOTE = 'C3';

// A mono synth may click or drop the next note when a release and an attack land on the same instant.
const LEGATO_GAP_SECONDS = 0.005;

/** Everything played from a sample of the kit: the drums and the cymbals. */
export type Sample = Part | Cymbal;
const SAMPLES: readonly Sample[] = [...PARTS, ...CYMBALS];

export type DrumBuffers = Readonly<Record<Sample, Tone.ToneAudioBuffer>>;

export function loadDrumBuffers(drumSamplesUrl: string): DrumBuffers {
  return Object.fromEntries(
    SAMPLES.map((sample) => [sample, new Tone.ToneAudioBuffer(`${drumSamplesUrl}${sample}.wav`)]),
  ) as Record<Sample, Tone.ToneAudioBuffer>;
}

export type DrumSamplers = Readonly<Record<Sample, Tone.Sampler>>;

/**
 * Evens out samples that share a channel, as the sound tables do for synths. Listening put the ride 2 dB under the
 * crash; the channel's trim would have taken the crash down with it, and lower velocities would change what a seed
 * generates.
 */
export const SAMPLE_GAIN_DB: Readonly<Record<Sample, number>> = { kick: 0, snare: 0, hat: 0, ghost: 0, crash: 0, ride: -2 };

export function createSamplers(buffers: DrumBuffers, to: Readonly<Record<Sample, Tone.InputNode>>): DrumSamplers {
  return Object.fromEntries(
    SAMPLES.map((sample) => [
      sample,
      new Tone.Sampler({ urls: { [ROOT_NOTE]: buffers[sample] }, release: 0.02, volume: SAMPLE_GAIN_DB[sample] }).connect(
        to[sample],
      ),
    ]),
  ) as Record<Sample, Tone.Sampler>;
}

export type ChordPart = 'stab' | 'pad';

/** Parts with a table of sounds hold one synth per sound, all feeding the part's input. */
export interface Voices {
  readonly sub: Tone.Synth;
  readonly reese: Readonly<Record<ReeseTimbre, Tone.MonoSynth>>;
  readonly stab: Readonly<Record<StabTimbre, Tone.PolySynth>>;
  readonly pad: Readonly<Record<PadTimbre, Tone.PolySynth>>;
  readonly impactBoom: Tone.MembraneSynth;
  readonly impactNoise: Tone.NoiseSynth;
}

export function chordSynth<P extends ChordPart>(voices: Voices, part: P, timbre: CycleTimbre[P]): Tone.PolySynth {
  // The generic index loses the link between part and timbre, so the two tables are looked up apart.
  return part === 'stab' ? voices.stab[timbre as StabTimbre] : voices.pad[timbre as PadTimbre];
}

export type VoiceInputs = {
  readonly [P in Exclude<keyof Voices, 'impactBoom' | 'impactNoise'>]: Tone.InputNode;
} & { readonly impact: Tone.InputNode };

// Falls from about 98 Hz, and the high-pass keeps it clear of the kick's and the sub's fundamentals.
export const IMPACT_BOOM_NOTE = 'G2';
export const IMPACT_SECONDS = 1.2;
export function createVoices(to: VoiceInputs, impactVolumeDb: number): Voices {
  return {
    sub: new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 1, release: 0.03 },
    }).connect(to.sub),
    reese: mapValues(REESE_PATCHES, (patch) => buildReeseSynth(patch).connect(to.reese)),
    stab: mapValues(STAB_PATCHES, (patch) => buildChordSynth(patch).connect(to.stab)),
    pad: mapValues(PAD_PATCHES, (patch) => buildChordSynth(patch).connect(to.pad)),
    impactBoom: new Tone.MembraneSynth({
      pitchDecay: 0.4,
      octaves: 3,
      envelope: { attack: 0.002, decay: 1, sustain: 0, release: 0.4 },
      volume: impactVolumeDb,
    }).connect(to.impact),
    impactNoise: new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.002, decay: IMPACT_SECONDS, sustain: 0, release: 0.2 },
      volume: impactVolumeDb,
    }).connect(to.impact),
  };
}

function buildReeseSynth(patch: ReesePatch): Tone.MonoSynth {
  return new Tone.MonoSynth({
    oscillator: oscillatorOptions(patch.oscillator),
    envelope: patch.envelope,
    filter: { type: 'lowpass', Q: patch.filterQ, rolloff: -24 },
    filterEnvelope: patch.filterEnvelope,
    volume: patch.gainDb,
  });
}

function buildChordSynth(patch: ChordPatch): Tone.PolySynth {
  return new Tone.PolySynth({
    maxPolyphony: CHORD_POLYPHONY,
    voice: Tone.Synth,
    options: { oscillator: oscillatorOptions(patch.oscillator), envelope: patch.envelope },
    volume: patch.gainDb,
  });
}

function oscillatorOptions(oscillator: FatOscillator<number> | FmOscillator) {
  return 'count' in oscillator
    ? { type: oscillator.type, count: oscillator.count, spread: oscillator.spread }
    : // Tone modulates with a square unless told otherwise, which would make every FM sound harsh.
      { type: oscillator.type, harmonicity: oscillator.harmonicity, modulationIndex: oscillator.modulationIndex, modulationType: 'sine' as const };
}

function mapValues<K extends string, A, B>(record: Readonly<Record<K, A>>, f: (value: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries<A>(record).map(([key, value]) => [key, f(value)])) as Record<K, B>;
}

export function disposeVoices(voices: Voices): void {
  voices.sub.dispose();
  for (const synth of [...Object.values(voices.reese), ...Object.values(voices.stab), ...Object.values(voices.pad)]) {
    synth.dispose();
  }
  voices.impactBoom.dispose();
  voices.impactNoise.dispose();
}

export function frequencyOf(pitch: Pitch): number {
  return Tone.Frequency(pitch, 'midi').toFrequency();
}

export function legatoSeconds(seconds: number): number {
  return Math.max(LEGATO_GAP_SECONDS, seconds - LEGATO_GAP_SECONDS);
}
