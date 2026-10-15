import type { FxEvent, FxSpan } from '../generators/fx/index.ts';
import { STEPS_PER_PAIR } from '../generators/types.ts';
import type { Seconds } from './ducking.ts';

/** Parameters that the effects move. Each has one value it rests at whenever no effect is under way. */
export type AutomationTarget = 'riserGain' | 'riserFrequency' | 'highpass' | 'lowpass' | 'throwSend' | 'padGate';

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
  const along = (target: AutomationTarget, span: FxSpan, value: (p: number) => number, ramp: Ramp): AutomationPoint[] => [
    { target, time: at(span.from), value: value(span.startProgress), ramp: 'set' },
    { target, time: at(span.to), value: value(span.endProgress), ramp },
  ];
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
          ? along('highpass', event.span, highpassFrequency, 'exponential')
          : along('lowpass', event.span, lowpassFrequency, 'exponential');
      case 'filterReset':
        return [
          { target: 'highpass', time: at(event.step), value: HIGHPASS.openHz, ramp: 'set' },
          { target: 'lowpass', time: at(event.step), value: LOWPASS.openHz, ramp: 'set' },
        ];
      case 'throw': {
        const hit = at(event.step);
        return [
          { target: 'throwSend', time: after(hit, -THROW_LEAD_SECONDS), value: THROW_SEND, ramp: 'set' },
          { target: 'throwSend', time: after(hit, THROW_HOLD_SECONDS), value: 0, ramp: 'set' },
        ];
      }
      case 'gap': {
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
