import * as Tone from 'tone';
import { PARTS, type Part, type Velocity } from '../generators/types.ts';
import type { UnitInterval } from '../units.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
const ROOT_NOTE = 'C3';

// Balances the self-made samples against each other; velocities still come from the generator.
const PART_TRIM_DB: Readonly<Record<Part, number>> = { kick: 0, snare: -2, hat: -6, ghost: 0 };

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls (N-02).
const LOOK_AHEAD_SECONDS = 0.25;

export interface DrumKit {
  trigger(part: Part, time: number, velocity: Velocity): void;
  /** Lets scheduled hits through from the given time on. */
  open(time: number): void;
  /** Cuts every hit, including those already scheduled ahead of time. */
  silence(): void;
  setVolume(volume: UnitInterval): void;
}

export function configureAudioContext(): void {
  Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: LOOK_AHEAD_SECONDS }));
}

export async function loadDrumKit(baseUrl: string): Promise<DrumKit> {
  const master = new Tone.Volume().toDestination();
  // Samples scheduled within the look-ahead window keep playing after Transport.stop, so stop needs a gate.
  const gate = new Tone.Gain(0).connect(master);
  const samplers = Object.fromEntries(
    PARTS.map((part) => [
      part,
      new Tone.Sampler({ urls: { [ROOT_NOTE]: `${part}.wav` }, baseUrl, release: 0.02 }).connect(
        new Tone.Volume(PART_TRIM_DB[part]).connect(gate),
      ),
    ]),
  ) as Record<Part, Tone.Sampler>;
  await Tone.loaded();

  return {
    trigger(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    open(time) {
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(1, time);
    },
    silence() {
      const now = Tone.now();
      gate.gain.cancelScheduledValues(now);
      gate.gain.rampTo(0, 0.01, now);
      for (const sampler of Object.values(samplers)) sampler.releaseAll(now);
    },
    setVolume(volume) {
      master.volume.rampTo(Tone.gainToDb(volume), 0.05);
    },
  };
}
