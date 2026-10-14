import type { PairLayers } from '../src/generators/drums/index.ts';
import { createEnsemble } from '../src/generators/ensemble.ts';
import type { SubLine } from '../src/generators/sub/index.ts';
import type { ContextWithDrums, DrumHit, PitchedEvent } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { toSeed } from '../src/random/rng.ts';
import { chordOf, type LiveParams } from '../src/structure/conductor.ts';
import { rootDegree } from '../src/structure/harmony.ts';
import { DEFAULT_KEY, degreeOf, type Key } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';

export function liveParams(
  m2: number,
  m8: number,
  fillIntensity: number,
  m32: number = DEFAULT_LIVE_PARAMS.m32,
  energyDepth: number = DEFAULT_LIVE_PARAMS.energyDepth,
): LiveParams {
  return {
    m2: clampUnit(m2),
    m8: clampUnit(m8),
    m32: clampUnit(m32),
    fillIntensity: clampUnit(fillIntensity),
    energyDepth: clampUnit(energyDepth),
  };
}

export const DEFAULT_LIVE = DEFAULT_LIVE_PARAMS;

export interface GeneratedPair {
  readonly ctx: ContextWithDrums;
  readonly layers: PairLayers;
  /** Drum hits only: most tests look at one part at a time. */
  readonly events: readonly DrumHit[];
  readonly sub: SubLine;
}

/** Generates the given number of bars (rounded up to whole 2-bar units) from a fresh ensemble. */
export function run(
  seed: number,
  bars: number,
  live: (pairIndex: number) => LiveParams = () => DEFAULT_LIVE,
  key: Key = DEFAULT_KEY,
): GeneratedPair[] {
  const ensemble = createEnsemble({ seed: toSeed(seed), key });
  return Array.from({ length: Math.ceil(bars / 2) }, (_, i) => {
    const { ctx, drumLayers, sub } = ensemble.next(live(i));
    return { ctx, layers: drumLayers, events: ctx.drums.hits, sub };
  });
}

export function eventsAt(events: readonly DrumHit[], part: DrumHit['part'], step: number): DrumHit[] {
  return events.filter((e) => e.part === part && e.step === step);
}

/** Seeds and parameter sets used across the property-style tests, including the extremes. */
export const SEEDS = [0, 1, 42, 123456789, 0xffffffff];
export const PARAM_SETS: readonly LiveParams[] = [
  DEFAULT_LIVE,
  liveParams(0, 0, 0, 0, 0),
  liveParams(1, 1, 1, 1, 1),
  liveParams(1, 0.5, 1, 0.5, 0.5),
];

/** Position, length and scale steps above the chord root of each note: what repeat units must share. */
export function relativeShape(ctx: ContextWithDrums, events: readonly PitchedEvent[]): unknown[] {
  const root = rootDegree(chordOf(ctx));
  const steps = (pitch: number) => (((degreeOf(ctx.key, pitch) ?? NaN) - root) % 7 + 7) % 7;
  return events.map((e) => [
    e.step,
    e.length,
    'pitch' in e ? steps(e.pitch) : e.voicing.map(steps),
  ]);
}
