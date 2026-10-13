import * as Tone from 'tone';
import { createDrumGenerator } from '../generators/drums/index.ts';
import { STEPS_PER_BAR, type NoteEvent, type Step } from '../generators/types.ts';
import type { Bpm } from '../params/store.ts';
import type { Seed } from '../random/rng.ts';
import { createConductor, type Context, type LiveParams } from '../structure/conductor.ts';
import type { DrumKit } from './audio.ts';

/** Fixed for the whole session: BPM and seed only change between stop and play. */
export interface SessionSettings {
  readonly bpm: Bpm;
  readonly seed: Seed;
}

export interface PlaybackListener {
  /** Called in sync with the audio when a 2-bar unit starts. */
  pairStarted(ctx: Context, events: readonly NoteEvent[]): void;
  /** Called in sync with the audio on every 16th note. */
  stepStarted(ctx: Context, step: Step): void;
}

export interface Sequencer {
  start(settings: SessionSettings): void;
  stop(): void;
}

export function createSequencer(kit: DrumKit, readLive: () => LiveParams, listener: PlaybackListener): Sequencer {
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();

  return {
    start({ bpm, seed }) {
      // A fresh conductor and generator per session replays the same seed from the very beginning (F-02).
      const conductor = createConductor(seed);
      const generator = createDrumGenerator();
      const stepSeconds = 60 / bpm / (STEPS_PER_BAR / 4);
      transport.bpm.value = bpm;
      transport.scheduleRepeat(
        (time) => {
          const ctx = conductor.next(readLive());
          const events = generator.generate(ctx);
          for (const { step, part, velocity } of events) kit.trigger(part, time + step * stepSeconds, velocity);
          draw.schedule(() => listener.pairStarted(ctx, events), time);
          for (let step = 0; step < STEPS_PER_BAR * 2; step++) {
            draw.schedule(() => listener.stepStarted(ctx, step as Step), time + step * stepSeconds);
          }
        },
        '2m',
        0,
      );
      const startTime = Tone.now();
      kit.open(startTime);
      transport.start(startTime);
    },
    stop() {
      transport.stop();
      transport.cancel(0);
      draw.cancel(0);
      kit.silence();
    },
  };
}
