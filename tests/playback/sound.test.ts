import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TARGETS,
  GATE_REOPEN_SECONDS,
  fxAutomation,
  restingValue,
  type AutomationPoint,
  type AutomationTarget,
} from '../../src/engine/automation.ts';
import { createTally, peakDbfs, scanBlock } from '../../src/engine/clip.ts';
import { DUCK_ATTACK, duckPoints, type Dip, type DuckPoint, type Seconds } from '../../src/engine/ducking.ts';
import {
  PAD_MAX_RELEASE,
  PAD_PATCHES,
  REESE_PATCHES,
  STAB_MAX_RELEASE,
  STAB_PATCHES,
} from '../../src/engine/patches.ts';
import { DEFAULT_SOUND_TUNING } from '../../src/engine/tuning.ts';
import {
  CHANNEL_IDS,
  DEFAULT_MIXER,
  SOLOABLE_IDS,
  audibleChannels,
  type MixerSettings,
} from '../../src/params/mixer.ts';
import { GAP_START, dropLeadIn, leadsIntoDrop } from '../../src/structure/arrangement.ts';
import { clampUnit } from '../../src/units.ts';
import { SEEDS, liveParams, run } from '../support/helpers.ts';

const STEP = 0.1;

const FX = DEFAULT_SOUND_TUNING.fx;

const { riser: RISER, highpass: HIGHPASS, lowpass: LOWPASS, throwSend: THROW_SEND } = FX;

const RESTING_VALUE = restingValue(FX);

/** Automation of every 2 bars, laid end to end as playback would schedule it. */
function automate(seed: number, bars: number) {
  return run(seed, bars).map((pair, i) => ({ pair, points: fxAutomation(pair.fx, (i * 32 * STEP) as Seconds, STEP, FX) }));
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

describe('sound: fx automation', () => {
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
      pairs.flatMap((pair, i) => fxAutomation(pair.fx, (i * 32 * STEP + shift(i)) as Seconds, STEP, FX));
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

describe('sound: duckPoints', () => {
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

describe('sound: ducking', () => {
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

describe('sound: clip detection', () => {
  it('counts a single sample just beyond 0 dBFS and nothing below it', () => {
    const block = new Float32Array(128).map((_, i) => 0.9 * Math.sin(i / 5));
    const quiet = createTally();
    scanBlock(block, quiet);
    expect(quiet.clips).toBe(0);
    expect(quiet.peak).toBeLessThan(1);

    const loud = createTally();
    block[77] = -1.0001;
    scanBlock(block, loud);
    expect(loud.clips).toBe(1);
    expect(loud.peak).toBeCloseTo(1.0001);
    expect(peakDbfs(loud.peak)).toBeGreaterThan(0);
  });

  it('accumulates over blocks until the tally is reset', () => {
    const tally = createTally();
    scanBlock([0.2, 1, -0.5], tally);
    scanBlock([1.5, 0.1], tally);
    expect(tally).toEqual({ peak: 1.5, clips: 2 });
  });
});

describe('sound: solo', () => {
  const withFlags = (soloed: readonly string[], muted: readonly string[] = []): MixerSettings =>
    Object.fromEntries(
      CHANNEL_IDS.map((id) => {
        const channel = DEFAULT_MIXER[id];
        const flags = { muted: muted.includes(id), ...('soloed' in channel ? { soloed: soloed.includes(id) } : {}) };
        return [id, { ...channel, ...flags }];
      }),
    ) as unknown as MixerSettings;

  it('plays every unmuted channel when nothing is soloed', () => {
    expect(Object.values(audibleChannels(withFlags([])))).toEqual(CHANNEL_IDS.map(() => true));
    expect(audibleChannels(withFlags([], ['kick', 'reverbReturn']))).toMatchObject({ kick: false, reverbReturn: false, snare: true });
  });

  it('plays only the soloed channels and the reverb return once any is soloed, adding solos together', () => {
    const audible = audibleChannels(withFlags(['snare', 'pad']));
    for (const id of SOLOABLE_IDS) expect(audible[id]).toBe(id === 'snare' || id === 'pad');
    expect(audible.reverbReturn).toBe(true);
  });

  it('lets a mute win over a solo, on the reverb return too', () => {
    expect(audibleChannels(withFlags(['snare'], ['snare'])).snare).toBe(false);
    expect(audibleChannels(withFlags(['snare'], ['reverbReturn'])).reverbReturn).toBe(false);
  });
});

describe('sound: patches', () => {
  it('keeps every sound within the envelopes the pad gate and the polyphony were worked out for', () => {
    for (const patch of Object.values(PAD_PATCHES)) {
      expect(patch.envelope.attack).toBeGreaterThanOrEqual(GATE_REOPEN_SECONDS);
      expect(patch.envelope.release).toBeLessThanOrEqual(PAD_MAX_RELEASE);
    }
    for (const patch of Object.values(STAB_PATCHES)) {
      expect(patch.envelope.release).toBeLessThanOrEqual(STAB_MAX_RELEASE);
    }
  });

  it('only ever turns a sound down, and keeps the FM ratios whole so that no part sounds an octave down', () => {
    const patches = [...Object.values(REESE_PATCHES), ...Object.values(STAB_PATCHES), ...Object.values(PAD_PATCHES)];
    for (const patch of patches) {
      expect(patch.gainDb).toBeLessThanOrEqual(0);
      if ('harmonicity' in patch.oscillator) {
        expect(Number.isInteger(patch.oscillator.harmonicity)).toBe(true);
        expect(patch.oscillator.harmonicity).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
