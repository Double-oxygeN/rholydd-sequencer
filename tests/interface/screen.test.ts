import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, initialParams } from '../../src/params/config.ts';
import { clampLevel, clampRelease } from '../../src/params/mixer.ts';
import { isReset, resetValues } from '../../src/params/reset.ts';
import { clampBpm, type Params } from '../../src/params/store.ts';
import { toSeed } from '../../src/random/rng.ts';
import { clampUnit } from '../../src/units.ts';
import { MEDIA_ACTIONS, interruptionCommand, mediaCommand, toggleCommand } from '../../src/ui/playback.ts';
import { BAND_CENTERS, FLOOR_DB, SEGMENTS, bandLevels, holdPeaks, litSegments } from '../../src/ui/spectrum.ts';

describe('screen: playback commands', () => {
  const STATES = ['stopped', 'playing', 'paused'] as const;

  it('plays, pauses and resumes from one button', () => {
    expect(STATES.map(toggleCommand)).toEqual(['start', 'pause', 'resume']);
  });

  it('takes play, pause and stop from the OS as the table says, never pausing on play', () => {
    const table = Object.fromEntries(
      MEDIA_ACTIONS.map((action) => [action, STATES.map((state) => mediaCommand(action, state))]),
    );
    expect(table).toEqual({
      play: ['start', null, 'resume'],
      pause: [null, 'pause', null],
      stop: [null, 'stop', 'stop'],
    });
  });

  it('pauses when the system stops the audio during playback, and does nothing otherwise', () => {
    const table = Object.fromEntries(
      (['running', 'suspended', 'interrupted', 'closed'] as const).map((audio) => [
        audio,
        STATES.map((state) => interruptionCommand(audio, state)),
      ]),
    );
    expect(table).toEqual({
      running: [null, null, null],
      suspended: [null, 'pause', null],
      interrupted: [null, 'pause', null],
      closed: [null, 'pause', null],
    });
  });
});

describe('screen: spectrum analyser', () => {
  const SAMPLE_RATE = 48000;

  const BINS = 2048;

  const binOf = (hz: number) => Math.round((hz * 2 * BINS) / SAMPLE_RATE);

  const spectrumWith = (peaks: Readonly<Record<number, number>>) => {
    const bins = new Float32Array(BINS).fill(-120);
    for (const [hz, db] of Object.entries(peaks)) bins[binOf(Number(hz))] = db;
    return { bins, sampleRate: SAMPLE_RATE };
  };

  it('splits 31.5 Hz to 16 kHz into half-octave bands, telling the kick and the sub from the hats', () => {
    expect(BAND_CENTERS).toHaveLength(19);
    expect(BAND_CENTERS[0]).toBeCloseTo(31.5);
    expect(BAND_CENTERS.at(-1)).toBeCloseTo(16128);
    const bandOf = (hz: number) => BAND_CENTERS.findIndex((c) => hz >= c * 2 ** -0.25 && hz < c * 2 ** 0.25);
    // A full-scale sine reads about −13.6 dB in its loudest bin on the analyser, its Blackman main lobe 4.5 dB and
    // 20.4 dB lower in the bins either side, and lights its band to the top.
    const lobe = SAMPLE_RATE / (2 * BINS);
    const sine = bandLevels(
      spectrumWith({ [1000 - 2 * lobe]: -34, [1000 - lobe]: -18.1, 1000: -13.6, [1000 + lobe]: -18.1, [1000 + 2 * lobe]: -34 }),
    );
    expect(litSegments(sine[bandOf(1000)]!)).toBe(SEGMENTS);
    expect(sine.filter((level) => litSegments(level) > 0)).toHaveLength(1);
    // Hats spread thinly over many bins, each below the floor, and still light their band.
    const noise: Record<number, number> = {};
    for (let hz = 6800; hz < 9400; hz += SAMPLE_RATE / (2 * BINS)) noise[hz] = -60;
    const hats = bandLevels(spectrumWith(noise));
    expect(-60).toBeLessThan(FLOOR_DB);
    expect(litSegments(hats[bandOf(8000)]!)).toBeGreaterThan(SEGMENTS / 4);
  });

  it('lights no segment at the floor or below, and all of them at 0 dBFS and above', () => {
    expect(litSegments(-Infinity)).toBe(0);
    expect(litSegments(FLOOR_DB)).toBe(0);
    expect(litSegments(FLOOR_DB + 0.1)).toBe(1);
    expect(litSegments(-3)).toBe(SEGMENTS - 3);
    expect(litSegments(-2.5)).toBe(SEGMENTS - 2);
    expect(litSegments(0)).toBe(SEGMENTS);
    expect(litSegments(6)).toBe(SEGMENTS);
  });

  it('holds a peak for a second, then lets it fall no lower than the level', () => {
    let peaks = holdPeaks([], [12], 0.016);
    for (let t = 0; t < 0.9; t += 0.1) peaks = holdPeaks(peaks, [2], 0.1);
    expect(peaks[0]!.segment).toBe(12);
    for (let t = 0; t < 0.5; t += 0.1) peaks = holdPeaks(peaks, [2], 0.1);
    expect(peaks[0]!.segment).toBeLessThan(12);
    for (let t = 0; t < 5; t += 0.1) peaks = holdPeaks(peaks, [2], 0.1);
    expect(peaks[0]!.segment).toBe(2);
    expect(holdPeaks(peaks, [9], 0.1)[0]).toEqual({ segment: 9, age: 0 });
  });
});

describe('screen: resets', () => {
  const initial = initialParams(DEFAULT_CONFIG, toSeed(1));
  const moved: Params = {
    ...initial,
    m2: clampUnit(0.9),
    energyDepth: clampUnit(0),
    bpm: clampBpm(160),
    volume: clampUnit(0.2),
    seed: toSeed(2),
    mixer: {
      ...initial.mixer,
      kick: { ...initial.mixer.kick, muted: true, soloed: true },
      snare: { ...initial.mixer.snare, level: clampLevel(-6) },
    },
    ducking: { ...initial.ducking, release: clampRelease(100) },
  };
  const apply = (scope: 'live' | 'mix', params: Params): Params => ({ ...params, ...resetValues(scope, initial) });

  it('puts back the five live parameters alone, leaving the tempo, the key, the seed and the volume', () => {
    expect(Object.keys(resetValues('live', initial)).sort()).toEqual(['energyDepth', 'fillIntensity', 'm2', 'm32', 'm8']);
    const reset = apply('live', moved);
    expect(isReset('live', reset, initial)).toBe(true);
    expect(reset).toEqual({ ...moved, m2: initial.m2, energyDepth: initial.energyDepth });
  });

  it('puts back the whole mixer and the ducking, leaving the parameters and the volume', () => {
    expect(Object.keys(resetValues('mix', initial)).sort()).toEqual(['ducking', 'mixer']);
    const reset = apply('mix', moved);
    expect(isReset('mix', reset, initial)).toBe(true);
    expect(reset).toEqual({ ...moved, mixer: initial.mixer, ducking: initial.ducking });
  });

  it('puts back the values the page opened with, those of a config file included', () => {
    const config = { ...DEFAULT_CONFIG, params: { ...DEFAULT_CONFIG.params, m8: clampUnit(1) } };
    const opened = initialParams(config, toSeed(1));
    expect(resetValues('live', opened).m8).toBe(1);
    expect(isReset('live', initial, opened)).toBe(false);
  });

  it('tells the values at their defaults by value, whatever objects hold them', () => {
    expect(isReset('live', initial, initial)).toBe(true);
    expect(isReset('mix', structuredClone(initial), initial)).toBe(true);
    expect(isReset('live', moved, initial)).toBe(false);
    expect(isReset('mix', moved, initial)).toBe(false);
    // Moving what a reset leaves alone keeps it unavailable.
    const elsewhere = { ...initial, bpm: clampBpm(170), volume: clampUnit(1), seed: toSeed(9) };
    expect(isReset('live', elsewhere, initial)).toBe(true);
    expect(isReset('mix', elsewhere, initial)).toBe(true);
    expect(isReset('mix', { ...initial, ducking: { ...initial.ducking, depth: clampUnit(0) } }, initial)).toBe(false);
  });
});
