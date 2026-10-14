import * as Tone from 'tone';
import { PARTS, type Part, type Pitch, type Velocity } from '../generators/types.ts';
import type { UnitInterval } from '../units.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
const ROOT_NOTE = 'C3';

// Balances the self-made samples against each other; velocities still come from the generator.
const PART_TRIM_DB: Readonly<Record<Part, number>> = { kick: 0, snare: -2, hat: -6, ghost: 0 };
const BASS_TRIM_DB = -6;

// A pure sine has no harmonics, so small speakers would lose the bass pitch entirely.
const BASS_DRIVE = 0.15;

// A mono synth may click or drop the next note when a release and an attack land on the same instant.
const LEGATO_GAP_SECONDS = 0.005;

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls (N-02).
const LOOK_AHEAD_SECONDS = 0.25;

export interface Instruments {
  drum(part: Part, time: number, velocity: Velocity): void;
  bass(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
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
  const bassBus = new Tone.Distortion(BASS_DRIVE).chain(new Tone.Volume(BASS_TRIM_DB), gate);
  const createBass = () =>
    new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 1, release: 0.03 },
    }).connect(bassBus);
  let bass = createBass();
  await Tone.loaded();

  return {
    drum(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    bass(pitch, time, seconds, velocity) {
      const frequency = Tone.Frequency(pitch, 'midi').toFrequency();
      bass.triggerAttackRelease(frequency, Math.max(LEGATO_GAP_SECONDS, seconds - LEGATO_GAP_SECONDS), time, velocity);
    },
    open(time) {
      // Notes of the previous session stay scheduled on the synth's timelines, and the gate would let them
      // collide with the new ones on this mono voice. A fresh synth drops them all at once.
      bass.dispose();
      bass = createBass();
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(1, time);
    },
    silence() {
      const now = Tone.now();
      gate.gain.cancelScheduledValues(now);
      gate.gain.rampTo(0, 0.01, now);
      for (const sampler of Object.values(samplers)) sampler.releaseAll(now);
      bass.triggerRelease(now);
    },
    setVolume(volume) {
      master.volume.rampTo(Tone.gainToDb(volume), 0.05);
    },
  };
}
