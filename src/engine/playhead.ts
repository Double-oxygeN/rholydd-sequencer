import type { EnsemblePair } from '../generators/ensemble.ts';
import { STEPS_PER_PAIR, type Step } from '../generators/types.ts';
import type { Seconds } from './ducking.ts';

/** 2 bars handed to Web Audio, when they start, and the step they sound from: past 0 only where playback resumed. */
export interface ScheduledPair {
  readonly start: Seconds;
  readonly from: Step;
  readonly pair: EnsemblePair;
}

/** The step sounding at some moment, in the 2 bars it belongs to. */
export interface Playhead {
  readonly scheduled: ScheduledPair;
  readonly step: Step;
}

/**
 * Where to carry on after a pause: the 2 bars to resume within, from a step, then the 2 bars generated after them
 * that never sounded. With none pending, playback goes on with the next 2 bars the ensemble generates, from their
 * first step: at the start of a session, or after a pause that came once everything scheduled had been heard.
 */
export type ResumePoint =
  | { readonly pending: readonly []; readonly step: Step & 0 }
  | { readonly pending: readonly [EnsemblePair, ...EnsemblePair[]]; readonly step: Step };

export const NOTHING_PENDING: ResumePoint = { pending: [], step: 0 as Step & 0 };

/**
 * The first step not yet heard at the moment of the pause, and every pair from its own on. The pairs after it were
 * generated ahead of time; keeping them, rather than generating again, keeps the piece as it would have gone on.
 */
export function locate(scheduled: readonly ScheduledPair[], cutTime: Seconds, stepSeconds: number): ResumePoint {
  const pairSeconds = STEPS_PER_PAIR * stepSeconds;
  const index = scheduled.findIndex(({ start }) => cutTime < start + pairSeconds);
  if (index === -1) return NOTHING_PENDING;
  const { start, from: sounded } = scheduled[index]!;
  // A pause before the resumed pair's first step sounds keeps the resume point, rather than going back to steps heard.
  const step = Math.max(sounded, Math.ceil((cutTime - start) / stepSeconds - EPSILON));
  const from = step >= STEPS_PER_PAIR ? index + 1 : index;
  const [first, ...rest] = scheduled.slice(from).map(({ pair }) => pair);
  if (first === undefined) return NOTHING_PENDING;
  return { pending: [first, ...rest], step: (from === index ? step : 0) as Step };
}

// The start times of steps are sums of floats, so a cut right at a step must not count as just after it.
const EPSILON = 1e-9;

/**
 * The step sounding at a moment: the latest that began by then, counted from the same start times the notes were
 * scheduled at. None before the first step a pair sounds from, nor once every pair has ended.
 */
export function playheadAt(scheduled: readonly ScheduledPair[], time: Seconds, stepSeconds: number): Playhead | null {
  // The latest pair wins, since one scheduled from the transport's clock may start a hair before the last ends.
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const pair = scheduled[i]!;
    const step = Math.floor((time - pair.start) / stepSeconds + EPSILON);
    if (step < pair.from) continue;
    return step < STEPS_PER_PAIR ? { scheduled: pair, step: step as Step } : null;
  }
  return null;
}

/** The 2 bars to play next: those pending from a pause first, then fresh ones, so that none is generated twice. */
export function pairSource(pending: readonly EnsemblePair[], generate: () => EnsemblePair): () => EnsemblePair {
  const queue = [...pending];
  return () => queue.shift() ?? generate();
}
