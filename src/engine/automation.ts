import { startsEffect, type FxEvent, type FxSpan } from '../generators/fx/index.ts';
import { STEPS_PER_PAIR } from '../generators/types.ts';
import type { Seconds } from './ducking.ts';

/**
 * Parameters that the effects move. Each has one value it rests at whenever no effect is under way.
 * highpassShare is the share of the mix taken through the swept high-pass rather than the one resting open beside it.
 */
export type AutomationTarget =
  | 'riserGain'
  | 'riserFrequency'
  | 'highpass'
  | 'highpassShare'
  | 'lowpass'
  | 'throwSend'
  | 'padGate';

/** How the value gets to a point from the one before: jumps there, or moves in a straight or exponential line. */
export type Ramp = 'set' | 'linear' | 'exponential';

export interface AutomationPoint {
  readonly target: AutomationTarget;
  readonly time: Seconds;
  readonly value: number;
  readonly ramp: Ramp;
}

export const RISER = { peakGain: 0.5, lowHz: 300, highHz: 8000 } as const;
export const HIGHPASS = { openHz: 20, closedHz: 600 } as const;
export const LOWPASS = { closedHz: 400, openHz: 18000 } as const;
/** Taken after the snare's trim, so a full send matches the dry snare's level. */
export const THROW_SEND = 1;

export const RESTING_VALUE: Readonly<Record<AutomationTarget, number>> = {
  riserGain: 0,
  riserFrequency: RISER.lowHz,
  highpass: HIGHPASS.openHz,
  highpassShare: 0,
  lowpass: LOWPASS.openHz,
  throwSend: 0,
  padGate: 1,
};

export const AUTOMATION_TARGETS = Object.keys(RESTING_VALUE) as readonly AutomationTarget[];

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
export function riserGain(progress: number): number {
  return RISER.peakGain * progress * progress;
}

/** Frequencies move in equal ratios, which the ear hears as moving at an even speed. */
function logBetween(from: number, to: number, progress: number): number {
  return from * (to / from) ** progress;
}

export const riserFrequency = (progress: number) => logBetween(RISER.lowHz, RISER.highHz, progress);
export const highpassFrequency = (progress: number) => logBetween(HIGHPASS.openHz, HIGHPASS.closedHz, progress);
export const lowpassFrequency = (progress: number) => logBetween(LOWPASS.closedHz, LOWPASS.openHz, progress);

/** Points for the effects of one 2-bar unit. Impacts are notes rather than automation, so they are left out. */
export function fxAutomation(events: readonly FxEvent[], pairStart: Seconds, stepSeconds: number): readonly AutomationPoint[] {
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
          ...along('riserGain', event.span, riserGain, 'linear'),
          ...along('riserFrequency', event.span, riserFrequency, 'exponential'),
        ];
        if (event.span.endProgress < 1) return points;
        return [...points, { target: 'riserGain', time: after(at(event.span.to), RISER_CUT_SECONDS), value: 0, ramp: 'linear' }];
      }
      case 'sweep':
        return event.filter === 'highpass'
          ? along('highpass', event.span, highpassFrequency, 'exponential', [
              // Both high-passes stand open here, so the mix moves over to the swept one unheard.
              { target: 'highpass', time: at(0), value: HIGHPASS.openHz, ramp: 'set' },
              { target: 'highpassShare', time: at(0), value: 0, ramp: 'set' },
              { target: 'highpassShare', time: after(at(0), HIGHPASS_HANDOVER_SECONDS), value: 1, ramp: 'linear' },
            ])
          : along('lowpass', event.span, lowpassFrequency, 'exponential', [
              { target: 'lowpass', time: at(0), value: LOWPASS.openHz, ramp: 'set' },
              { target: 'lowpass', time: after(at(0), LOWPASS_CLOSE_SECONDS), value: LOWPASS.closedHz, ramp: 'exponential' },
            ]);
      case 'filterReset': {
        const end = at(STEPS_PER_PAIR);
        return [
          { target: 'highpassShare', time: after(end, -HIGHPASS_HANDOVER_SECONDS), value: 1, ramp: 'set' },
          { target: 'highpassShare', time: end, value: 0, ramp: 'linear' },
          { target: 'highpass', time: end, value: HIGHPASS.openHz, ramp: 'set' },
          { target: 'lowpass', time: end, value: LOWPASS.openHz, ramp: 'set' },
        ];
      }
      case 'throw': {
        const hit = at(event.step);
        return [
          { target: 'throwSend', time: after(hit, -THROW_LEAD_SECONDS), value: THROW_SEND, ramp: 'set' },
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
