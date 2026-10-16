import type { EnsemblePair } from '../generators/ensemble.ts';
import { STEPS_PER_PAIR, type Step } from '../generators/types.ts';
import type { Seconds } from './ducking.ts';

/** 2 bars handed to Web Audio, and when they start. */
export interface ScheduledPair {
  readonly start: Seconds;
  readonly pair: EnsemblePair;
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
  const step = Math.max(0, Math.ceil((cutTime - scheduled[index]!.start) / stepSeconds - EPSILON));
  const from = step >= STEPS_PER_PAIR ? index + 1 : index;
  const [first, ...rest] = scheduled.slice(from).map(({ pair }) => pair);
  if (first === undefined) return NOTHING_PENDING;
  return { pending: [first, ...rest], step: (from === index ? step : 0) as Step };
}

// The start times of steps are sums of floats, so a cut right at a step must not count as just after it.
const EPSILON = 1e-9;

/** The 2 bars to play next: those pending from a pause first, then fresh ones, so that none is generated twice. */
export function pairSource(pending: readonly EnsemblePair[], generate: () => EnsemblePair): () => EnsemblePair {
  const queue = [...pending];
  return () => queue.shift() ?? generate();
}
