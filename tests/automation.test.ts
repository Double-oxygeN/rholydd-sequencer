import { describe, expect, it } from 'vitest';
import type { Seconds } from '../src/engine/ducking.ts';
import {
  AUTOMATION_TARGETS,
  HIGHPASS,
  LOWPASS,
  RESTING_VALUE,
  RISER,
  THROW_SEND,
  fxAutomation,
  type AutomationPoint,
  type AutomationTarget,
} from '../src/engine/automation.ts';
import { GAP_START, dropLeadIn, leadsIntoDrop } from '../src/structure/arrangement.ts';
import { run } from './helpers.ts';

const STEP = 0.1;

/** Automation of every 2 bars, laid end to end as playback would schedule it. */
function automate(seed: number, bars: number) {
  return run(seed, bars).map((pair, i) => ({ pair, points: fxAutomation(pair.fx, (i * 32 * STEP) as Seconds, STEP) }));
}

const of = (points: readonly AutomationPoint[], target: AutomationTarget) => points.filter((p) => p.target === target);

/**
 * Value of a target over time, as Web Audio computes it: points sort by time, later-scheduled ones after earlier ones
 * at the same time, and a ramp runs from the point before it, whenever that was scheduled.
 */
function curveOf(points: readonly AutomationPoint[], target: AutomationTarget): (time: number) => number {
  const timeline = of(points, target)
    .map((point, order) => ({ point, order }))
    .sort((a, b) => a.point.time - b.point.time || a.order - b.order)
    .map(({ point }) => point);
  return (time) => {
    const next = timeline.findIndex((point) => point.time > time);
    const from = timeline[(next === -1 ? timeline.length : next) - 1] ?? { time: 0, value: RESTING_VALUE[target] };
    const to = timeline[next];
    if (to === undefined || to.ramp === 'set') return from.value;
    const progress = (time - from.time) / (to.time - from.time);
    return to.ramp === 'linear'
      ? from.value + (to.value - from.value) * progress
      : from.value * (to.value / from.value) ** progress;
  };
}

describe('fx automation', () => {
  it('raises the riser\'s gain and pitch through each build and cuts it at the gap or the drop', () => {
    let builds = 0;
    let previousGain = 0;
    let previousFrequency: number = RISER.lowHz;
    for (const { pair, points } of automate(42, 2048)) {
      const gains = of(points, 'riserGain');
      if (pair.ctx.sceneRole.scene !== 'build') {
        expect(gains).toEqual([]);
        continue;
      }
      // Only the first 2 bars of a build set the riser; the rest ramp on from where the previous 2 bars ended.
      const startsBuild = previousGain === 0;
      if (startsBuild) expect(gains[0]).toMatchObject({ value: 0, ramp: 'set', time: pair.ctx.pair * 32 * STEP });
      const ramps = startsBuild ? gains.slice(1) : gains;
      expect(ramps.every((point) => point.ramp !== 'set')).toBe(true);
      expect(ramps[0]!.value).toBeGreaterThan(previousGain);
      previousGain = ramps[0]!.value;
      const frequencies = of(points, 'riserFrequency');
      expect(frequencies.at(-1)).toMatchObject({ ramp: 'exponential' });
      expect(frequencies.at(-1)!.value).toBeGreaterThan(previousFrequency);
      previousFrequency = frequencies.at(-1)!.value;
      if (leadsIntoDrop(pair.ctx)) {
        builds++;
        const silences = pair.fx.some((event) => event.fx === 'gap' && event.pad === 'cut');
        const peak = silences ? GAP_START : 32;
        expect(ramps[0]!).toMatchObject({ value: RISER.peakGain, time: pair.ctx.pair * 32 * STEP + peak * STEP });
        expect(frequencies.at(-1)!.value).toBeCloseTo(RISER.highHz);
        expect(gains.at(-1)).toMatchObject({ value: 0, ramp: 'linear' });
        previousGain = 0;
        previousFrequency = RISER.lowHz;
      }
    }
    expect(builds).toBeGreaterThan(5);
  });

  it('closes the high-pass through each build and opens both filters after it as the drop lands', () => {
    let builds = 0;
    for (const { pair, points } of automate(7, 2048)) {
      if (!leadsIntoDrop(pair.ctx)) continue;
      builds++;
      const end = pair.ctx.pair * 32 * STEP + 32 * STEP;
      const [closing, reset] = of(points, 'highpass').slice(-2);
      expect(closing!.value).toBeCloseTo(HIGHPASS.closedHz);
      expect(closing!.time).toBeLessThanOrEqual(end);
      expect(reset).toEqual({ target: 'highpass', time: end, value: HIGHPASS.openHz, ramp: 'set' });
      // Scheduled in this order, a reset on the very instant the ramp ends still wins.
      expect(points.indexOf(reset!)).toBeGreaterThan(points.indexOf(closing!));
      expect(of(points, 'lowpass')).toEqual([{ target: 'lowpass', time: end, value: LOWPASS.openHz, ramp: 'set' }]);
    }
    expect(builds).toBeGreaterThan(5);
  });

  it('joins every effect up across 2-bar boundaries, whichever way the next 2 bars start a hair off', () => {
    const pairs = run(42, 2048);
    const lay = (shift: (i: number) => number) =>
      pairs.flatMap((pair, i) => fxAutomation(pair.fx, (i * 32 * STEP + shift(i)) as Seconds, STEP));
    const exact = lay(() => 0);
    // The transport times each 2 bars apart from the steps of the previous 2 bars, and rounding goes either way.
    const drifted = lay((i) => (i % 2 === 0 ? 0 : -1e-9) + (i % 4 === 0 ? 1e-9 : 0));
    for (const target of AUTOMATION_TARGETS) {
      const [want, got] = [curveOf(exact, target), curveOf(drifted, target)];
      for (let i = 0; i < pairs.length; i++) {
        for (const step of [0.5, 8.5, 16.5, 24.5, 31.5]) {
          const time = (i * 32 + step) * STEP;
          expect(got(time), `${target} in 2 bars ${i} at step ${step}`).toBeCloseTo(want(time), 3);
        }
      }
    }
  });

  it('opens the low-pass from closed at the start of every intro, closing it first within a moment', () => {
    const intros = automate(3, 2048).filter(
      ({ pair }) => pair.ctx.sceneRole.scene === 'intro' && pair.ctx.sectionRole.isPhraseStart && pair.ctx.pairIn8 === 0,
    );
    expect(intros.length).toBeGreaterThan(5);
    for (const { pair, points } of intros) {
      const [open, closed] = of(points, 'lowpass');
      const start = pair.ctx.pair * 32 * STEP;
      expect(open).toEqual({ target: 'lowpass', time: start, value: LOWPASS.openHz, ramp: 'set' });
      expect(closed).toMatchObject({ value: LOWPASS.closedHz, ramp: 'exponential' });
      expect(closed!.time - start).toBeGreaterThan(0);
      expect(closed!.time - start).toBeLessThan(STEP / 2);
    }
  });

  it('moves a filter\'s frequency in one step only where none of it is heard', () => {
    const points = automate(42, 2048).flatMap(({ points }) => points);
    const share = curveOf(points, 'highpassShare');
    let jumps = 0;
    for (const target of ['highpass', 'lowpass'] as const) {
      const frequency = curveOf(points, target);
      for (const point of of(points, target).filter((p) => p.ramp === 'set')) {
        // A filter whose frequency jumps while sound flows through it thumps far louder than the sound itself.
        if (Math.abs(frequency(point.time - 1e-9) - point.value) < 1e-6) continue;
        jumps++;
        expect(target).toBe('highpass');
        expect(share(point.time)).toBe(0);
      }
    }
    expect(jumps).toBeGreaterThan(5);
  });

  it('sends one snare hit to the reverb and closes the send before the next 16th', () => {
    for (const { pair, points } of automate(42, 2048)) {
      const thrown = pair.fx.find((event) => event.fx === 'throw');
      const sends = of(points, 'throwSend');
      if (thrown === undefined) {
        expect(sends).toEqual([]);
        continue;
      }
      const hit = pair.ctx.pair * 32 * STEP + thrown.step * STEP;
      expect(sends.map((p) => p.value)).toEqual([THROW_SEND, 0]);
      expect(sends[0]!.time).toBeLessThan(hit);
      expect(sends[1]!.time).toBeGreaterThan(hit);
      expect(sends[1]!.time).toBeLessThan(hit + STEP * 2);
    }
  });

  it('closes the pad\'s gate for a silent gap and opens it again from the drop', () => {
    for (const { pair, points } of automate(42, 2048)) {
      const gate = of(points, 'padGate');
      const leadIn = dropLeadIn(pair.ctx);
      if (leadIn !== 'silence' && leadIn !== 'pickup') {
        expect(gate).toEqual([]);
        continue;
      }
      const start = pair.ctx.pair * 32 * STEP;
      expect(gate.map((p) => p.value)).toEqual([1, 0, 0, 1]);
      expect(gate[0]!.time).toBeCloseTo(start + GAP_START * STEP);
      expect(gate[2]!.time).toBeCloseTo(start + 32 * STEP);
    }
  });

});
