import * as Tone from 'tone';
import { createEnsemble, type SessionSettings } from '../generators/ensemble.ts';
import { STEPS_PER_BAR, type NoteEvent, type Step } from '../generators/types.ts';
import type { Bpm } from '../params/store.ts';
import type { Context, LiveParams } from '../structure/conductor.ts';
import type { DrumKit } from './audio.ts';

/** Fixed for the whole session: BPM, seed and key only change between stop and play. */
export interface PlaybackSettings extends SessionSettings {
  readonly bpm: Bpm;
}

export interface PlaybackListener {
  /** Called in sync with the audio when a 2-bar unit starts. */
  pairStarted(ctx: Context, events: readonly NoteEvent[]): void;
  /** Called in sync with the audio on every 16th note. */
  stepStarted(ctx: Context, step: Step): void;
}

export interface Sequencer {
  start(settings: PlaybackSettings): void;
  stop(): void;
}

export function createSequencer(kit: DrumKit, readLive: () => LiveParams, listener: PlaybackListener): Sequencer {
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();

  return {
    start({ bpm, seed, key }) {
      // A fresh ensemble per session replays the same seed from the very beginning (F-02).
      const ensemble = createEnsemble({ seed, key });
      const stepSeconds = 60 / bpm / (STEPS_PER_BAR / 4);
      transport.bpm.value = bpm;
      transport.scheduleRepeat(
        (time) => {
          const { ctx, events } = ensemble.next(readLive());
          for (const event of events) {
            if (event.instrument === 'drums') kit.trigger(event.part, time + event.step * stepSeconds, event.velocity);
          }
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
