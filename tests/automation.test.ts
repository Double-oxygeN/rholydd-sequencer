import { describe, expect, it } from 'vitest';
import type { Seconds } from '../src/engine/ducking.ts';
import {
  HIGHPASS,
  LOWPASS,
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

describe('fx automation', () => {
  it('raises the riser\'s gain and pitch through each build and cuts it at the gap or the drop', () => {
    let builds = 0;
    let previousGain = 0;
    for (const { pair, points } of automate(42, 2048)) {
      const gains = of(points, 'riserGain');
      if (pair.ctx.sceneRole.scene !== 'build') {
        expect(gains).toEqual([]);
        continue;
      }
      expect(gains[0]!.value).toBeCloseTo(previousGain);
      expect(gains[1]!.value).toBeGreaterThan(gains[0]!.value);
      previousGain = gains[1]!.value;
      const frequencies = of(points, 'riserFrequency');
      expect(frequencies[1]!.value).toBeGreaterThan(frequencies[0]!.value);
      if (leadsIntoDrop(pair.ctx)) {
        builds++;
        const silences = pair.fx.some((event) => event.fx === 'gap' && event.pad === 'cut');
        const peak = silences ? GAP_START : 32;
        expect(gains[1]!).toMatchObject({ value: RISER.peakGain, time: pair.ctx.pair * 32 * STEP + peak * STEP });
        expect(frequencies[1]!.value).toBeCloseTo(RISER.highHz);
        expect(gains.at(-1)).toMatchObject({ value: 0, ramp: 'linear' });
        previousGain = 0;
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
      const [, closing, reset] = of(points, 'highpass');
      expect(closing!.value).toBeCloseTo(HIGHPASS.closedHz);
      expect(closing!.time).toBeLessThanOrEqual(end);
      expect(reset).toEqual({ target: 'highpass', time: end, value: HIGHPASS.openHz, ramp: 'set' });
      // Scheduled in this order, a reset on the very instant the ramp ends still wins.
      expect(points.indexOf(reset!)).toBeGreaterThan(points.indexOf(closing!));
      expect(of(points, 'lowpass')).toEqual([{ target: 'lowpass', time: end, value: LOWPASS.openHz, ramp: 'set' }]);
    }
    expect(builds).toBeGreaterThan(5);
  });

  it('leaves the high-pass alone in the drop, whose start can fall a hair before the end of the build\'s ramp', () => {
    for (const { pair, points } of automate(7, 2048)) {
      if (pair.ctx.sceneRole.scene !== 'build') expect(of(points, 'highpass')).toEqual([]);
    }
  });

  it('opens the low-pass from closed at the start of every intro', () => {
    const intros = automate(3, 2048).filter(
      ({ pair }) => pair.ctx.sceneRole.scene === 'intro' && pair.ctx.sectionRole.isPhraseStart && pair.ctx.pairIn8 === 0,
    );
    expect(intros.length).toBeGreaterThan(5);
    for (const { points } of intros) expect(of(points, 'lowpass')[0]).toMatchObject({ value: LOWPASS.closedHz, ramp: 'set' });
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
