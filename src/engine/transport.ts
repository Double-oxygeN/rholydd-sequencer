import * as Tone from 'tone';
import { createEnsemble, type SessionSettings } from '../generators/ensemble.ts';
import { STEPS_PER_BAR, type NoteEvent, type Step } from '../generators/types.ts';
import type { Bpm } from '../params/store.ts';
import type { DuckingSettings } from '../params/mixer.ts';
import type { Context, LiveParams } from '../structure/conductor.ts';
import type { Instruments } from './audio.ts';
import type { Seconds } from './ducking.ts';

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

/** What the sequencer reads each time it schedules 2 bars. */
export interface PlaybackParams extends LiveParams {
  readonly ducking: DuckingSettings;
}

export function createSequencer(
  instruments: Instruments,
  readParams: () => PlaybackParams,
  listener: PlaybackListener,
): Sequencer {
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
          const { ducking, ...live } = readParams();
          const { ctx, events } = ensemble.next(liveOnly(live));
          for (const event of events) {
            const at = time + event.step * stepSeconds;
            switch (event.instrument) {
              case 'drums':
                instruments.drum(event.part, at, event.velocity);
                break;
              case 'sub':
                instruments.sub(event.pitch, at, event.length * stepSeconds, event.velocity);
                break;
              case 'reese':
                instruments.reese(event.pitch, at, event.length * stepSeconds, event.velocity);
                break;
              case 'stab':
              case 'pad':
                instruments.chord(event.instrument, event.voicing, at, event.length * stepSeconds, event.velocity);
                break;
            }
          }
          // The kicks that actually sound, not the ones a fill replaced: a dropped kick needs no room.
          const kicks = ctx.drums.hits.filter((hit) => hit.part === 'kick').map((hit) => (time + hit.step * stepSeconds) as Seconds);
          instruments.duck(kicks, ducking);
          draw.schedule(() => listener.pairStarted(ctx, events), time);
          for (let step = 0; step < STEPS_PER_BAR * 2; step++) {
            draw.schedule(() => listener.stepStarted(ctx, step as Step), time + step * stepSeconds);
          }
        },
        '2m',
        0,
      );
      const startTime = Tone.now();
      instruments.open(startTime);
      transport.start(startTime);
    },
    stop() {
      transport.stop();
      transport.cancel(0);
      draw.cancel(0);
      instruments.silence();
    },
  };
}

/** Copies just the generation parameters, so that nothing about the sound reaches the ensemble (N-11). */
function liveOnly({ m2, m8, m32, fillIntensity, energyDepth }: LiveParams): LiveParams {
  return { m2, m8, m32, fillIntensity, energyDepth };
}
