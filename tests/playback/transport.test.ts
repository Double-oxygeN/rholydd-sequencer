import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TARGETS,
  GATE_REOPEN_SECONDS,
  fxAutomation,
  fxStateAt,
  restingValue,
  type AutomationPoint,
  type AutomationTarget,
} from '../../src/engine/automation.ts';
import type { Seconds } from '../../src/engine/ducking.ts';
import { NOTHING_PENDING, locate, pairSource, playheadAt, type ScheduledPair } from '../../src/engine/playhead.ts';
import { eventsFrom } from '../../src/engine/resume.ts';
import { DEFAULT_SOUND_TUNING } from '../../src/engine/tuning.ts';
import { createEnsemble, type EnsemblePair } from '../../src/generators/ensemble.ts';
import { ALL_STEPS, type NoteEvent, type Step } from '../../src/generators/types.ts';
import { toSeed } from '../../src/random/rng.ts';
import { DEFAULT_KEY } from '../../src/structure/key.ts';
import { DEFAULT_LIVE, TUNING, run } from '../support/helpers.ts';

const STEP = 0.1;

const PAIR = 32 * STEP;

const FX = DEFAULT_SOUND_TUNING.fx;

const at = (pair: number, step: number) => pair * PAIR + step * STEP;

/** The values parameters take under scheduled points, following Web Audio's rules for set and ramps. */
function timelineOf(points: readonly AutomationPoint[]) {
  const byTarget = new Map<AutomationTarget, AutomationPoint[]>();
  // Points at the same time take effect in the order they were scheduled, which a stable sort keeps.
  for (const point of [...points].sort((a, b) => a.time - b.time)) {
    byTarget.set(point.target, [...(byTarget.get(point.target) ?? []), point]);
  }
  return (target: AutomationTarget, time: number): number => {
    const list = byTarget.get(target) ?? [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    const before = list[lo - 1];
    const previous = before === undefined ? { time: -Infinity, value: resting[target] } : before;
    const next = list[lo];
    if (next === undefined || next.ramp === 'set') return previous.value;
    const t = (time - previous.time) / (next.time - previous.time);
    return next.ramp === 'linear'
      ? previous.value + (next.value - previous.value) * t
      : previous.value * (next.value / previous.value) ** t;
  };
}

const resting = restingValue(FX);

function expectClose(actual: number, expected: number, what: string) {
  const tolerance = Math.max(1e-6, Math.abs(expected) * 0.03);
  if (Math.abs(actual - expected) > tolerance) expect.fail(`${what}: ${actual} against ${expected}`);
}

const pairs = run(42, 1024).map((pair) => pair.fx);

/**
 * The targets to compare. The riser's pitch stays wherever it ended while its gain is at 0, unheard. The pad's gate
 * opens slowly after a gap only so that the tail of the chord it cut does not come back; resuming leaves no tail,
 * so the gate opens at once there.
 */

const COMPARED = (timeline: ReturnType<typeof timelineOf>, time: number): readonly AutomationTarget[] => {
  const pair = Math.floor(time / PAIR + 1e-9);
  const reopening =
    (pairs[pair - 1] ?? []).some((e) => e.fx === 'gap' && e.pad === 'cut') && time - at(pair, 0) < GATE_REOPEN_SECONDS;
  return AUTOMATION_TARGETS.filter(
    (target) => !(target === 'riserFrequency' && timeline('riserGain', time) === 0) && !(target === 'padGate' && reopening),
  );
};

const uninterrupted = timelineOf(pairs.flatMap((fx, i) => fxAutomation(fx, at(i, 0) as Seconds, STEP, FX)));

describe('transport: resuming the events of 2 bars', () => {
  it('keeps what starts from the step on, replays what sounds across it for the rest, and drops the rest', () => {
    for (const { heard } of run(7, 256)) {
      for (const from of ALL_STEPS) {
        const left = eventsFrom(heard, from);
        const expected = heard.flatMap((e): NoteEvent[] => {
          if (e.step >= from) return [e];
          if (e.instrument === 'drums' || e.step + e.length <= from) return [];
          return [{ ...e, step: from, length: (e.step + e.length - from) as typeof e.length }];
        });
        expect(left).toEqual(expected);
        for (const e of left) expect(e.step).toBeGreaterThanOrEqual(from);
      }
    }
  });
});

describe('transport: the effects at a resumed step', () => {
  it('match what the uninterrupted automation holds at the start of every step but the first of each 2 bars', () => {
    pairs.forEach((fx, i) => {
      for (const step of ALL_STEPS.slice(1)) {
        const state = fxStateAt(fx, step, STEP, FX);
        for (const target of COMPARED(uninterrupted, at(i, step))) {
          expectClose(state[target], uninterrupted(target, at(i, step)), `${target} in pair ${i} at step ${step}`);
        }
      }
    });
  });

  it('carry on along the same curves after resuming from any step', () => {
    pairs.forEach((fx, i) => {
      // Only 2 bars with effects have anything to carry on.
      if (fx.length === 0) return;
      const later = pairs.slice(i + 1, i + 2).flatMap((next) => fxAutomation(next, at(i + 1, 0) as Seconds, STEP, FX));
      for (const from of ALL_STEPS) {
        const state = fxStateAt(fx, from, STEP, FX);
        const resumedAt = at(i, from) as Seconds;
        const resumed = timelineOf([
          ...AUTOMATION_TARGETS.map((target) => ({ target, time: resumedAt, value: state[target], ramp: 'set' as const })),
          ...fxAutomation(fx, at(i, 0) as Seconds, STEP, FX, from),
          ...later,
        ]);
        // A few milliseconds in, past the handovers that resuming makes in one step.
        for (let time = resumedAt + 0.03; time < at(i + 2, 0); time += STEP) {
          for (const target of COMPARED(uninterrupted, time)) {
            expectClose(resumed(target, time), uninterrupted(target, time), `${target} resumed in pair ${i} at step ${from}`);
          }
        }
      }
    });
  });
});

const fake = (n: number) => ({ n }) as unknown as EnsemblePair;

const scheduledFrom = (n: number, from = 0): ScheduledPair => ({ start: at(n, 0) as Seconds, from: from as Step, pair: fake(n) });

describe('transport: the point to resume from', () => {
  const scheduled: ScheduledPair[] = [0, 1, 2].map((n) => scheduledFrom(n));

  const cut = (time: number) => locate(scheduled, time as Seconds, STEP);

  it('is the first step not yet heard, with every pair from its own on', () => {
    expect(cut(-1)).toEqual({ pending: [fake(0), fake(1), fake(2)], step: 0 });
    expect(cut(0)).toEqual({ pending: [fake(0), fake(1), fake(2)], step: 0 });
    expect(cut(0.05)).toEqual({ pending: [fake(0), fake(1), fake(2)], step: 1 });
    expect(cut(at(0, 5))).toEqual({ pending: [fake(0), fake(1), fake(2)], step: 5 });
    expect(cut(at(0, 31) + 0.01)).toEqual({ pending: [fake(1), fake(2)], step: 0 });
    expect(cut(at(2, 3) + 0.01)).toEqual({ pending: [fake(2)], step: 4 });
    expect(cut(at(3, 1))).toEqual(NOTHING_PENDING);
    expect(locate([], 1 as Seconds, STEP)).toEqual(NOTHING_PENDING);
  });

  it('keeps the piece as it would have gone on, however often playback pauses', () => {
    const fresh = () => createEnsemble({ seed: toSeed(9), initialKey: DEFAULT_KEY, tuning: TUNING });
    const uninterrupted = fresh();
    const expected = Array.from({ length: 64 }, () => uninterrupted.next(DEFAULT_LIVE));
    // Plays pair by pair with one pair generated ahead, pausing every few pairs somewhere inside the current one.
    const ensemble = fresh();
    let next = pairSource([], () => ensemble.next(DEFAULT_LIVE));
    const played: EnsemblePair[] = [];
    let ahead: ScheduledPair[] = [];
    const time = 0;
    const pausedAt = new Set<number>();
    while (played.length < 64) {
      if (ahead.length < 2) ahead.push({ start: (time + ahead.length * PAIR) as Seconds, from: 0 as Step, pair: next() });
      if (ahead.length < 2) continue;
      if (played.length % 5 === 4 && !pausedAt.has(played.length)) {
        pausedAt.add(played.length);
        const point = locate(ahead, (time + 7.3 * STEP) as Seconds, STEP);
        next = pairSource(point.pending, () => ensemble.next(DEFAULT_LIVE));
        ahead = [];
        continue;
      }
      played.push(ahead.shift()!.pair);
      ahead = ahead.map((s) => ({ ...s, start: (s.start - PAIR) as Seconds }));
    }
    expect(played.map((p) => p.ctx.pair)).toEqual(expected.map((p) => p.ctx.pair));
    expect(played).toEqual(expected);
  });
});

describe('transport: the step on screen', () => {
  const scheduled: ScheduledPair[] = [0, 1, 2].map((n) => scheduledFrom(n));

  const shown = (list: readonly ScheduledPair[], time: number) => {
    const playhead = playheadAt(list, time as Seconds, STEP);
    return playhead === null ? null : { pair: list.indexOf(playhead.scheduled), step: playhead.step };
  };

  it('is the latest step begun within the 2 bars sounding', () => {
    expect(shown(scheduled, -0.01)).toBeNull();
    expect(shown(scheduled, 0)).toEqual({ pair: 0, step: 0 });
    expect(shown(scheduled, 0.05)).toEqual({ pair: 0, step: 0 });
    expect(shown(scheduled, at(0, 5))).toEqual({ pair: 0, step: 5 });
    expect(shown(scheduled, at(0, 31) + 0.05)).toEqual({ pair: 0, step: 31 });
    expect(shown(scheduled, at(2, 3) + 0.05)).toEqual({ pair: 2, step: 3 });
  });

  it('moves to the next 2 bars right at their start, even where the start times are sums of floats', () => {
    for (const n of [1, 2]) expect(shown(scheduled, at(n, 0))).toEqual({ pair: n, step: 0 });
    let time = 0;
    for (let step = 0; step < 32; step++) time += STEP;
    expect(shown(scheduled, time)).toEqual({ pair: 1, step: 0 });
    for (let step = 1; step < 96; step++) expect(shown(scheduled, at(0, step))).toEqual({ pair: Math.floor(step / 32), step: step % 32 });
  });

  it('shows nothing before the step a resumed pair sounds from, nor anything already shown before the pause', () => {
    const resumed = [scheduledFrom(0, 12), scheduledFrom(1)];
    expect(shown(resumed, at(0, 11) + 0.05)).toBeNull();
    expect(shown(resumed, at(0, 12))).toEqual({ pair: 0, step: 12 });
    expect(shown(resumed, at(1, 4))).toEqual({ pair: 1, step: 4 });
  });

  it('shows nothing once every pair has ended', () => {
    expect(shown(scheduled, at(3, 0))).toBeNull();
    expect(shown(scheduled, at(5, 7))).toBeNull();
    expect(playheadAt([], 1 as Seconds, STEP)).toBeNull();
  });

  it('stays one step behind the point to resume from, wherever playback pauses', () => {
    for (let time = 0; time < at(3, 0) - 0.01; time += 0.0173) {
      const playhead = playheadAt(scheduled, time as Seconds, STEP)!;
      const point = locate(scheduled, time as Seconds, STEP);
      const index = scheduled.indexOf(playhead.scheduled);
      const begun = time - at(index, playhead.step) > 1e-6;
      // A pause right as a step begins resumes from that step; any later, from the one after.
      const next = begun ? playhead.step + 1 : playhead.step;
      const expected = next < 32 ? { pair: index, step: next } : { pair: index + 1, step: 0 };
      if (expected.pair > 2) expect(point).toEqual(NOTHING_PENDING);
      else expect({ pair: (point.pending[0] as unknown as { n: number }).n, step: point.step }).toEqual(expected);
    }
  });
});
