import * as Tone from 'tone';
import { PARTS, type Part, type Pitch, type Velocity, type Voicing } from '../generators/types.ts';
import type { UnitInterval } from '../units.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
const ROOT_NOTE = 'C3';

// Balances the self-made samples against each other; velocities still come from the generator.
const PART_TRIM_DB: Readonly<Record<Part, number>> = { kick: 0, snare: -2, hat: -6, ghost: 0 };
const SUB_TRIM_DB = -6;
const REESE_TRIM_DB = -14;
const STAB_TRIM_DB = -16;
const PAD_TRIM_DB = -20;

// A pure sine has no harmonics, so small speakers would lose the bass pitch entirely.
const BASS_DRIVE = 0.15;

// A mono synth may click or drop the next note when a release and an attack land on the same instant.
const LEGATO_GAP_SECONDS = 0.005;

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls (N-02).
const LOOK_AHEAD_SECONDS = 0.25;

export interface Instruments {
  drum(part: Part, time: number, velocity: Velocity): void;
  sub(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  reese(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  chord(part: 'stab' | 'pad', voicing: Voicing, time: number, seconds: number, velocity: Velocity): void;
  /** Lets scheduled notes through from the given time on. */
  open(time: number): void;
  /** Cuts every note, including those already scheduled ahead of time. */
  silence(): void;
  setVolume(volume: UnitInterval): void;
}

export function configureAudioContext(): void {
  Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: LOOK_AHEAD_SECONDS }));
}

export async function loadInstruments(drumSamplesUrl: string): Promise<Instruments> {
  const master = new Tone.Volume().toDestination();
  // Notes scheduled within the look-ahead window keep playing after Transport.stop, so stop needs a gate.
  const gate = new Tone.Gain(0).connect(master);
  const samplers = Object.fromEntries(
    PARTS.map((part) => [
      part,
      new Tone.Sampler({ urls: { [ROOT_NOTE]: `${part}.wav` }, baseUrl: drumSamplesUrl, release: 0.02 }).connect(
        new Tone.Volume(PART_TRIM_DB[part]).connect(gate),
      ),
    ]),
  ) as Record<Part, Tone.Sampler>;
  const subIn = new Tone.Distortion(BASS_DRIVE).chain(new Tone.Volume(SUB_TRIM_DB), gate);
  // Cut below the sub so that the two basses never stack up in the lowest octave.
  const reeseIn = new Tone.Filter(REESE_HIGHPASS_HZ, 'highpass').chain(new Tone.Volume(REESE_TRIM_DB), gate);
  const stabIn = new Tone.Filter(STAB_LOWPASS_HZ, 'lowpass').chain(new Tone.Volume(STAB_TRIM_DB), gate);
  const padIn = new Tone.Filter(PAD_LOWPASS_HZ, 'lowpass').chain(new Tone.Volume(PAD_TRIM_DB), gate);
  let voices = createVoices({ sub: subIn, reese: reeseIn, stab: stabIn, pad: padIn });
  await Tone.loaded();

  return {
    drum(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    sub(pitch, time, seconds, velocity) {
      voices.sub.triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    reese(pitch, time, seconds, velocity) {
      voices.reese.triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    chord(part, voicing, time, seconds, velocity) {
      voices[part].triggerAttackRelease(voicing.map(frequencyOf), legatoSeconds(seconds), time, velocity);
    },
    open(time) {
      // Notes of the previous session stay scheduled on the synths' timelines, and the gate would let them
      // collide with the new ones on the mono voices or hold on to poly voices. Fresh synths drop them all at once.
      disposeVoices(voices);
      voices = createVoices({ sub: subIn, reese: reeseIn, stab: stabIn, pad: padIn });
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(1, time);
    },
    silence() {
      const now = Tone.now();
      gate.gain.cancelScheduledValues(now);
      gate.gain.rampTo(0, 0.01, now);
      for (const sampler of Object.values(samplers)) sampler.releaseAll(now);
      voices.sub.triggerRelease(now);
      voices.reese.triggerRelease(now);
      voices.stab.releaseAll(now);
      voices.pad.releaseAll(now);
    },
    setVolume(volume) {
      master.volume.rampTo(Tone.gainToDb(volume), 0.05);
    },
  };
}

const REESE_HIGHPASS_HZ = 120;
const STAB_LOWPASS_HZ = 3000;
const PAD_LOWPASS_HZ = 1500;

interface Voices {
  readonly sub: Tone.Synth;
  readonly reese: Tone.MonoSynth;
  readonly stab: Tone.PolySynth;
  readonly pad: Tone.PolySynth;
}

type VoiceInputs = { readonly [P in keyof Voices]: Tone.InputNode };

function createVoices(to: VoiceInputs): Voices {
  return {
    sub: new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 1, release: 0.03 },
    }).connect(to.sub),
    // Detuned saws beating against each other are what make a reese.
    reese: new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.05 },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.1, baseFrequency: 200, octaves: 3 },
    }).connect(to.reese),
    stab: new Tone.PolySynth({
      maxPolyphony: 8,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'fatsquare', count: 2, spread: 15 },
        envelope: { attack: 0.003, decay: 0.12, sustain: 0.15, release: 0.15 },
      },
    }).connect(to.stab),
    // Re-struck every 2 bars while the previous chord still releases, hence more voices than 4 notes need.
    pad: new Tone.PolySynth({
      maxPolyphony: 12,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
        envelope: { attack: 0.4, decay: 0.6, sustain: 0.7, release: 1.2 },
      },
    }).connect(to.pad),
  };
}

function disposeVoices(voices: Voices): void {
  for (const voice of Object.values(voices)) voice.dispose();
}

function frequencyOf(pitch: Pitch): number {
  return Tone.Frequency(pitch, 'midi').toFrequency();
}

function legatoSeconds(seconds: number): number {
  return Math.max(LEGATO_GAP_SECONDS, seconds - LEGATO_GAP_SECONDS);
}
