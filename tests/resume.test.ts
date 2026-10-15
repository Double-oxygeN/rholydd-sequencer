import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TARGETS,
  GATE_REOPEN_SECONDS,
  fxAutomation,
  fxStateAt,
  restingValue,
  type AutomationPoint,
  type AutomationTarget,
} from '../src/engine/automation.ts';
import type { Seconds } from '../src/engine/ducking.ts';
import { NOTHING_PENDING, locate, pairSource, type ScheduledPair } from '../src/engine/playhead.ts';
import { eventsFrom } from '../src/engine/resume.ts';
import { DEFAULT_SOUND_TUNING } from '../src/engine/tuning.ts';
import { createEnsemble, type EnsemblePair } from '../src/generators/ensemble.ts';
import { ALL_STEPS, type NoteEvent } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { DEFAULT_KEY } from '../src/structure/key.ts';
import { DEFAULT_LIVE, TUNING, run } from './helpers.ts';

// Automated acceptance criteria for pausing and resuming, from docs/specs/phase4/requirements.md.

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

describe('resuming the events of 2 bars', () => {
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

describe('the effects at a resumed step', () => {
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

describe('the point to resume from', () => {
  const fake = (n: number) => ({ n }) as unknown as EnsemblePair;
  const scheduled: ScheduledPair[] = [0, 1, 2].map((n) => ({ start: at(n, 0) as Seconds, pair: fake(n) }));
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
      if (ahead.length < 2) ahead.push({ start: (time + ahead.length * PAIR) as Seconds, pair: next() });
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
