import { compose } from '../src/generators/drums/compose.ts';
import { createDrumGenerator, type PairLayers } from '../src/generators/drums/index.ts';
import type { NoteEvent } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { toSeed } from '../src/random/rng.ts';
import { createConductor, type Context, type LiveParams } from '../src/structure/conductor.ts';
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
  readonly ctx: Context;
  readonly layers: PairLayers;
  readonly events: readonly NoteEvent[];
}

/** Generates the given number of bars (rounded up to whole 2-bar units) from a fresh conductor and generator. */
export function run(
  seed: number,
  bars: number,
  live: (pairIndex: number) => LiveParams = () => DEFAULT_LIVE,
): GeneratedPair[] {
  const conductor = createConductor(toSeed(seed));
  const generator = createDrumGenerator();
  return Array.from({ length: Math.ceil(bars / 2) }, (_, i) => {
    const ctx = conductor.next(live(i));
    const layers = generator.generateLayers(ctx);
    return { ctx, layers, events: compose(layers.base, layers.ornaments, layers.fill) };
  });
}

export function eventsAt(events: readonly NoteEvent[], part: NoteEvent['part'], step: number): NoteEvent[] {
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
