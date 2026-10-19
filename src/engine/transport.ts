import * as Tone from 'tone';
import { heardDrums } from '../generators/arrange.ts';
import { createEnsemble, type EnsemblePair, type SessionSettings } from '../generators/ensemble.ts';
import { STEPS_PER_BAR, STEPS_PER_PAIR, isStrike, type NoteEvent, type Step } from '../generators/types.ts';
import type { Bpm } from '../params/store.ts';
import type { DuckingSettings } from '../params/mixer.ts';
import type { Context, LiveParams } from '../structure/conductor.ts';
import type { Instruments } from './audio.ts';
import type { Seconds } from './ducking.ts';
import { NOTHING_PENDING, locate, pairSource, playheadAt, type Playhead, type ResumePoint, type ScheduledPair } from './playhead.ts';
import { eventsFrom } from './resume.ts';

/** Fixed for the whole session: BPM, seed, initial key and tuning only change between stop and play. */
export interface PlaybackSettings extends SessionSettings {
  readonly bpm: Bpm;
}

export interface PlaybackListener {
  /** Called on the first frame that a 2-bar unit sounds in, from its start or from where playback resumed within it. */
  pairStarted(ctx: Context, events: readonly NoteEvent[]): void;
  /** Called on the first frame that a 16th note sounds in; steps that start and end between two frames are skipped. */
  stepStarted(ctx: Context, step: Step): void;
}

/** A session can only be paused while it plays and only resumed while it is paused. */
export interface PlayingSession {
  readonly state: 'playing';
  pause(): PausedSession;
  stop(): void;
}

export interface PausedSession {
  readonly state: 'paused';
  resume(): PlayingSession;
  stop(): void;
}

export type PlaybackSession = PlayingSession | PausedSession;

export interface Sequencer {
  start(settings: PlaybackSettings): PlayingSession;
}

/** What the sequencer reads each time it schedules 2 bars. */
export interface PlaybackParams extends LiveParams {
  readonly ducking: DuckingSettings;
}

// Pairs that ended longer ago than this are dropped from the list a pause looks through.
const KEPT_SECONDS = 1;

export function createSequencer(
  instruments: Instruments,
  readParams: () => PlaybackParams,
  listener: PlaybackListener,
): Sequencer {
  const transport = Tone.getTransport();

  function play(settings: PlaybackSettings, generate: () => EnsemblePair, from: ResumePoint): PlayingSession {
    const stepSeconds = 60 / settings.bpm / (STEPS_PER_BAR / 4);
    const pairSeconds = STEPS_PER_PAIR * stepSeconds;
    const next = pairSource(from.pending, generate);
    const scheduled: ScheduledPair[] = [];

    const schedule = (pair: EnsemblePair, pairStart: number, fromStep: Step) => {
      const { ctx, fx } = pair;
      const events = eventsFrom(pair.events, fromStep);
      const at = (step: number) => pairStart + step * stepSeconds;
      for (const event of events) {
        const time = at(event.step);
        const seconds = isStrike(event) ? 0 : event.length * stepSeconds;
        switch (event.instrument) {
          case 'drums':
            instruments.drum(event.part, time, event.velocity);
            break;
          case 'sub':
            instruments.sub(event.pitch, time, seconds, event.velocity);
            break;
          case 'reese':
            instruments.reese(ctx.timbre.reese, event.pitch, time, seconds, event.velocity);
            break;
          case 'stab':
            instruments.chord('stab', ctx.timbre.stab, event.voicing, time, seconds, event.velocity);
            break;
          case 'pad':
            instruments.chord('pad', ctx.timbre.pad, event.voicing, time, seconds, event.velocity);
            break;
        }
      }
      // The kicks that actually sound, not the ones a fill replaced or the scene left out: a silent kick needs no room.
      const kicks = heardDrums(events)
        .filter((hit) => hit.part === 'kick')
        .map((hit) => at(hit.step) as Seconds);
      instruments.duck(kicks, readParams().ducking);
      instruments.fx(fx, pairStart as Seconds, stepSeconds, fromStep);
      scheduled.push({ start: pairStart as Seconds, from: fromStep, pair });
      while (scheduled.length > 0 && scheduled[0]!.start + pairSeconds < Tone.immediate() - KEPT_SECONDS) scheduled.shift();
    };

    const time = Tone.now();
    const first = from.pending[0];
    instruments.open(time, first === undefined ? undefined : { events: first.fx, step: from.step, stepSeconds });
    transport.bpm.value = settings.bpm;
    // The 2 bars resumed within play straight away; the transport takes over from the next ones.
    if (first !== undefined) schedule(next(), time - from.step * stepSeconds, from.step);
    const restSeconds = first === undefined ? 0 : (STEPS_PER_PAIR - from.step) * stepSeconds;
    transport.scheduleRepeat((pairStart) => schedule(next(), pairStart, 0 as Step), '2m', restSeconds);
    transport.start(time);

    let shown: Playhead | null = null;
    // Read against the audio clock rather than the frame's own time, since the notes were scheduled on it.
    const follow = (now: Seconds) => {
      const playhead = playheadAt(scheduled, now, stepSeconds);
      if (playhead === null) return;
      const { ctx, events } = playhead.scheduled.pair;
      if (playhead.scheduled !== shown?.scheduled) listener.pairStarted(ctx, events);
      if (playhead.scheduled !== shown?.scheduled || playhead.step !== shown.step) listener.stepStarted(ctx, playhead.step);
      shown = playhead;
    };
    let frame = requestAnimationFrame(function tick() {
      follow(Tone.immediate() as Seconds);
      frame = requestAnimationFrame(tick);
    });

    const halt = (cut: number) => {
      cancelAnimationFrame(frame);
      transport.stop();
      transport.cancel(0);
      instruments.silence(cut);
    };

    return {
      state: 'playing',
      pause() {
        const cut = Tone.immediate() as Seconds;
        const point = locate(scheduled, cut, stepSeconds);
        // A step may have begun since the last frame; showing it keeps the step left on screen just before the resume point.
        follow(cut);
        halt(cut);
        return paused(settings, next, point);
      },
      stop() {
        halt(Tone.now());
      },
    };
  }

  function paused(settings: PlaybackSettings, next: () => EnsemblePair, point: ResumePoint): PausedSession {
    return {
      state: 'paused',
      // The point's pairs were already taken from next, which may still hold pairs left pending by an earlier pause
      // and never scheduled, so the resumed session draws on next once the point's pairs are played.
      resume: () => play(settings, next, point),
      stop() {},
    };
  }

  return {
    start(settings) {
      // A fresh ensemble per session replays the same seed from the very beginning, so stop and play gives the same piece.
      const ensemble = createEnsemble(settings);
      const generate = () => {
        const { ducking: _ducking, ...live } = readParams();
        return ensemble.next(liveOnly(live));
      };
      return play(settings, generate, NOTHING_PENDING);
    },
  };
}

/** Copies just the generation parameters, so that no mixer or ducking move can change what a seed generates. */
function liveOnly({ m2, m8, m32, fillIntensity, energyDepth }: LiveParams): LiveParams {
  return { m2, m8, m32, fillIntensity, energyDepth };
}
