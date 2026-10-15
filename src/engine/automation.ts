import { startsEffect, type FxEvent, type FxSpan } from '../generators/fx/index.ts';
import { STEPS_PER_PAIR } from '../generators/types.ts';
import type { Seconds } from './ducking.ts';
import type { FxTuning } from './tuning.ts';

/**
 * Parameters that the effects move. Each has one value it rests at whenever no effect is under way.
 * highpassShare is the share of the mix taken through the swept high-pass rather than the one resting open beside it.
 */
export const AUTOMATION_TARGETS = [
  'riserGain',
  'riserFrequency',
  'highpass',
  'highpassShare',
  'lowpass',
  'throwSend',
  'padGate',
] as const;
export type AutomationTarget = (typeof AUTOMATION_TARGETS)[number];

/** How the value gets to a point from the one before: jumps there, or moves in a straight or exponential line. */
export type Ramp = 'set' | 'linear' | 'exponential';

export interface AutomationPoint {
  readonly target: AutomationTarget;
  readonly time: Seconds;
  readonly value: number;
  readonly ramp: Ramp;
}

export type AutomationValues = Readonly<Record<AutomationTarget, number>>;

export function restingValue(fx: FxTuning): AutomationValues {
  return {
    riserGain: 0,
    riserFrequency: fx.riser.lowHz,
    highpass: fx.highpass.openHz,
    highpassShare: 0,
    lowpass: fx.lowpass.openHz,
    throwSend: 0,
    padGate: 1,
  };
}

// Short enough to cut the riser with the gap, long enough not to click.
const RISER_CUT_SECONDS = 0.01;
// Opens just before the hit so that its transient reaches the reverb, and closes before the next 16th.
const THROW_LEAD_SECONDS = 0.005;
const THROW_HOLD_SECONDS = 0.12;
const GAP_FADE_SECONDS = 0.03;
// A filter whose frequency jumps while sound flows through it lets out a thump far louder than the sound itself.
// The low-pass closes over the tails of the drop before an intro, so it glides shut instead of jumping.
const LOWPASS_CLOSE_SECONDS = 0.02;
// Opening the high-pass in one step clipped the drop after a build that plays into it. The drop instead hands the
// mix over to the high-pass resting open, ending as the drop lands so that its first hit comes with all its low end,
// and the swept one opens once nothing of it is heard. Long enough not to click.
const HIGHPASS_HANDOVER_SECONDS = 0.005;
// Slow enough that the tail of the chord cut by the gap does not come back, and no slower than any pad's attack
// (checked against the sound table), so the gate never blunts the first chord of the drop.
export const GATE_REOPEN_SECONDS = 0.4;

/** Rises slowly at first and steeply at the end, as the build tightens towards the gap. */
export function riserGain(progress: number, fx: FxTuning): number {
  return fx.riser.peakGain * progress * progress;
}

/** Frequencies move in equal ratios, which the ear hears as moving at an even speed. */
function logBetween(from: number, to: number, progress: number): number {
  return from * (to / from) ** progress;
}

export const riserFrequency = (progress: number, fx: FxTuning) => logBetween(fx.riser.lowHz, fx.riser.highHz, progress);
export const highpassFrequency = (progress: number, fx: FxTuning) =>
  logBetween(fx.highpass.openHz, fx.highpass.closedHz, progress);
export const lowpassFrequency = (progress: number, fx: FxTuning) =>
  logBetween(fx.lowpass.closedHz, fx.lowpass.openHz, progress);

/** Points for the effects of one 2-bar unit. Impacts are notes rather than automation, so they are left out. */
export function fxAutomation(
  events: readonly FxEvent[],
  pairStart: Seconds,
  stepSeconds: number,
  fx: FxTuning,
): readonly AutomationPoint[] {
  const at = (step: number) => (pairStart + step * stepSeconds) as Seconds;
  const after = (time: Seconds, seconds: number) => (time + seconds) as Seconds;
  // A span carrying on from the previous 2 bars only ramps on from where those ended. Setting its start value again
  // would be timed from this pair's own start, which can fall a hair before the previous ramp's end and hold that
  // whole ramp at its start value.
  const along = (
    target: AutomationTarget,
    span: FxSpan,
    value: (p: number) => number,
    ramp: Ramp,
    onset: readonly AutomationPoint[] = [{ target, time: at(0), value: value(0), ramp: 'set' }],
  ): AutomationPoint[] => [...(startsEffect(span) ? onset : []), { target, time: at(span.to), value: value(span.endProgress), ramp }];
  return events.flatMap((event): AutomationPoint[] => {
    switch (event.fx) {
      case 'riser': {
        const points = [
          // Exponential ramps cannot reach 0, so the gain moves in straight lines.
          ...along('riserGain', event.span, (p) => riserGain(p, fx), 'linear'),
          ...along('riserFrequency', event.span, (p) => riserFrequency(p, fx), 'exponential'),
        ];
        if (event.span.endProgress < 1) return points;
        return [...points, { target: 'riserGain', time: after(at(event.span.to), RISER_CUT_SECONDS), value: 0, ramp: 'linear' }];
      }
      case 'sweep':
        return event.filter === 'highpass'
          ? along('highpass', event.span, (p) => highpassFrequency(p, fx), 'exponential', [
              // Both high-passes stand open here, so the mix moves over to the swept one unheard.
              { target: 'highpass', time: at(0), value: fx.highpass.openHz, ramp: 'set' },
              { target: 'highpassShare', time: at(0), value: 0, ramp: 'set' },
              { target: 'highpassShare', time: after(at(0), HIGHPASS_HANDOVER_SECONDS), value: 1, ramp: 'linear' },
            ])
          : along('lowpass', event.span, (p) => lowpassFrequency(p, fx), 'exponential', [
              { target: 'lowpass', time: at(0), value: fx.lowpass.openHz, ramp: 'set' },
              { target: 'lowpass', time: after(at(0), LOWPASS_CLOSE_SECONDS), value: fx.lowpass.closedHz, ramp: 'exponential' },
            ]);
      case 'filterReset': {
        const end = at(STEPS_PER_PAIR);
        return [
          { target: 'highpassShare', time: after(end, -HIGHPASS_HANDOVER_SECONDS), value: 1, ramp: 'set' },
          { target: 'highpassShare', time: end, value: 0, ramp: 'linear' },
          { target: 'highpass', time: end, value: fx.highpass.openHz, ramp: 'set' },
          { target: 'lowpass', time: end, value: fx.lowpass.openHz, ramp: 'set' },
        ];
      }
      case 'throw': {
        const hit = at(event.step);
        return [
          { target: 'throwSend', time: after(hit, -THROW_LEAD_SECONDS), value: fx.throwSend, ramp: 'set' },
          { target: 'throwSend', time: after(hit, THROW_HOLD_SECONDS), value: 0, ramp: 'set' },
        ];
      }
      case 'gap': {
        if (event.pad === 'held') return [];
        const start = at(event.from);
        const end = at(STEPS_PER_PAIR);
        return [
          { target: 'padGate', time: start, value: 1, ramp: 'set' },
          { target: 'padGate', time: after(start, GAP_FADE_SECONDS), value: 0, ramp: 'linear' },
          { target: 'padGate', time: end, value: 0, ramp: 'set' },
          { target: 'padGate', time: after(end, GATE_REOPEN_SECONDS), value: 1, ramp: 'linear' },
        ];
      }
      case 'impact':
        return [];
    }
  });
}
