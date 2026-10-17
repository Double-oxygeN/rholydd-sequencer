import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DEFAULT_GENERATION_TUNING, type GenerationTuning } from '../src/generators/tuning.ts';
import { parseConfigText, type Config, type Decoded } from '../src/params/config.ts';
import { chordOf, type LiveParams } from '../src/structure/conductor.ts';
import { DEFAULT_KEY, type Key } from '../src/structure/key.ts';
import { DEFAULT_LIVE, liveParams, run, type GeneratedPair } from './helpers.ts';

/** Read through the same parser as the page's config.json, so that the file's path into generation is covered too. */
export const TUNED_CONFIG: Decoded<Config> = parseConfigText(
  readFileSync(new URL('./fixtures/tuned-config.json', import.meta.url), 'utf8'),
);

const tunedParams = TUNED_CONFIG.value.params;
const tunedLive = (): LiveParams =>
  liveParams(tunedParams.m2, tunedParams.m8, tunedParams.fillIntensity, tunedParams.m32, tunedParams.energyDepth);
const tuned = { live: tunedLive, initialKey: tunedParams.initialKey, tuning: TUNED_CONFIG.value.generation };

export interface BaselineRun {
  readonly seed: number;
  readonly live: (pairIndex: number) => LiveParams;
  readonly initialKey: Key;
  readonly tuning: GenerationTuning;
}

const defaults = { live: () => DEFAULT_LIVE, initialKey: DEFAULT_KEY, tuning: DEFAULT_GENERATION_TUNING };

/** Keyed by a readable name so that a mismatch says which run moved. */
export const BASELINE_RUNS: Readonly<Record<string, BaselineRun>> = {
  'seed 1': { ...defaults, seed: 1 },
  'seed 42': { ...defaults, seed: 42 },
  'seed 0xffffffff': { ...defaults, seed: 0xffffffff },
  'seed 7, every slider up': { ...defaults, seed: 7, live: () => liveParams(1, 1, 1, 1, 1) },
  'seed 123456789, every slider down': { ...defaults, seed: 123456789, live: () => liveParams(0, 0, 0, 0, 0) },
  // Sliders moved during playback reach the generators at 2-bar, 8-bar and 32-bar boundaries, each in its own way.
  'seed 2024, sliders moving': {
    ...defaults,
    seed: 2024,
    live: (i) => liveParams((i % 7) / 6, (i % 5) / 4, (i % 3) / 2, (i % 11) / 10, (i % 13) / 12),
  },
  'seed 1, tuned config': { ...tuned, seed: 1 },
  'seed 42, tuned config': { ...tuned, seed: 42 },
};

export const BASELINE_BARS = 2048;

// Only what decides the sound is hashed, so that reshaping the context or the generators' internals stays free.
const BASELINE_PARTS = {
  structure: ({ ctx }) => [ctx.layout, ctx.sceneRole, ctx.nextScene, ctx.energy, chordOf(ctx)],
  key: ({ ctx }) => ctx.key,
  timbre: ({ ctx }) => ctx.timbre,
  drums: ({ ctx }) => ctx.drums,
  sub: ({ sub }) => sub,
  reese: ({ reese }) => reese,
  stab: ({ stab }) => stab,
  pad: ({ pad }) => pad,
  heard: ({ heard }) => heard,
  fx: ({ fx }) => fx,
} as const satisfies Record<string, (pair: GeneratedPair) => unknown>;

export type BaselinePart = keyof typeof BASELINE_PARTS;
export type BaselineDigests = Readonly<Record<BaselinePart, string>>;

/** One hash per part, so that a mismatch points at the part that moved. */
export function baselineDigests({ seed, live, initialKey, tuning }: BaselineRun): BaselineDigests {
  const pairs = run(seed, BASELINE_BARS, live, initialKey, tuning);
  const parts = Object.keys(BASELINE_PARTS) as BaselinePart[];
  return Object.fromEntries(parts.map((part) => [part, digest(pairs, BASELINE_PARTS[part])])) as BaselineDigests;
}

function digest(pairs: readonly GeneratedPair[], pick: (pair: GeneratedPair) => unknown): string {
  const hash = createHash('sha256');
  for (const pair of pairs) hash.update(JSON.stringify(canonical(pick(pair))));
  return hash.digest('hex');
}

/** Sorts object keys, since JSON.stringify follows the order a value was built in and that is no part of the sound. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, v]) => [key, canonical(v)]));
}
