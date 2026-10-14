import { describe, expect, it } from 'vitest';
import { DUCK_ATTACK, duckPoints, type Dip, type DuckPoint, type Seconds } from '../src/engine/ducking.ts';
import { clampUnit } from '../src/units.ts';
import { SEEDS, liveParams, run } from './helpers.ts';

const shape = { floor: clampUnit(0.4), release: 0.1 as Seconds };
const s = (x: number) => x as Seconds;

/** Gain of the envelope at a time, as Web Audio's linear ramps would play it. */
function gainAt(points: readonly DuckPoint[], time: number): number {
  const after = points.findIndex((p) => p.time >= time);
  if (after < 0) return points.at(-1)?.gain ?? 1;
  const b = points[after]!;
  const a = points[after - 1];
  if (a === undefined || b.time === time) return a === undefined && b.time > time ? 1 : b.gain;
  return a.gain + ((b.gain - a.gain) * (time - a.time)) / (b.time - a.time);
}

describe('duckPoints', () => {
  it('is fully down on the kick and back to full gain after the release', () => {
    const { points, last } = duckPoints([s(1)], null, shape);
    expect(points).toEqual([
      { time: 1 - DUCK_ATTACK, gain: 1 },
      { time: 1, gain: 0.4 },
      { time: 1.1, gain: 1 },
    ]);
    expect(last).toEqual({ kick: 1, ...shape });
  });

  it('starts the next dip from where the recovery has got to', () => {
    const { points } = duckPoints([s(1), s(1.05)], null, shape);
    const start = 1.05 - DUCK_ATTACK;
    const expected = [1 - DUCK_ATTACK, 1, start, 1.05, 1.15];
    expect(points).toHaveLength(expected.length);
    points.forEach((p, i) => expect(p.time).toBeCloseTo(expected[i]!));
    expect(points[2]!.gain).toBeCloseTo(0.4 + 0.6 * ((start - 1) / 0.1));
  });

  it('continues the previous 2 bars\' last dip across the boundary', () => {
    const carry: Dip = { kick: s(0.98), ...shape };
    const { points } = duckPoints([s(1)], carry, shape);
    expect(points[0]!.gain).toBeCloseTo(0.4 + 0.6 * ((1 - DUCK_ATTACK - 0.98) / 0.1));
  });

  it('carries the previous dip on when no kick sounds', () => {
    const carry: Dip = { kick: s(0.98), ...shape };
    expect(duckPoints([], carry, shape)).toEqual({ points: [], last: carry });
  });
});

describe('phase 2 acceptance: ducking', () => {
  it('dips on every kick that sounds and stays at full gain where no kick sounds', () => {
    const stepSeconds = 60 / 174 / 4;
    let checkedSteps = 0;
    for (const seed of SEEDS) {
      const kicks: number[] = [];
      const steps: number[] = [];
      // Built the way the engine schedules it: each 2 bars cancel what lies after their first point.
      let envelope: DuckPoint[] = [];
      let carry: Dip | null = null;
      for (const [index, pair] of run(seed, 512, () => liveParams(0.3, 0.35, 1)).entries()) {
        const start = index * 32 * stepSeconds;
        const pairKicks = pair.events.filter((e) => e.part === 'kick').map((e) => s(start + e.step * stepSeconds));
        const plan = duckPoints(pairKicks, carry, shape);
        carry = plan.last;
        const first = plan.points[0];
        if (first !== undefined) envelope = [...envelope.filter((p) => p.time < first.time), ...plan.points];
        kicks.push(...pairKicks);
        for (let step = 0; step < 32; step++) steps.push(start + step * stepSeconds);
      }
      for (const kick of kicks) expect(gainAt(envelope, kick)).toBeCloseTo(shape.floor);
      for (const time of steps) {
        const settled = kicks.every((kick) => time - kick >= shape.release || kick - DUCK_ATTACK > time);
        if (!settled) continue;
        checkedSteps++;
        expect(gainAt(envelope, time)).toBeCloseTo(1);
      }
    }
    expect(checkedSteps).toBeGreaterThan(1000);
  });
});
