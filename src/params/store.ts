import { toSeed, type Seed } from '../random/rng.ts';
import type { LiveParams } from '../structure/conductor.ts';
import { clampUnit, type Brand, type UnitInterval } from '../units.ts';

/** Tempo in [160, 180] BPM. */
export type Bpm = Brand<number, 'Bpm'>;

export const BPM_RANGE = { min: 160, max: 180 } as const;

export function clampBpm(x: number): Bpm {
  if (Number.isNaN(x)) return DEFAULT_BPM;
  return Math.round(Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, x))) as Bpm;
}

const DEFAULT_BPM = 174 as Bpm;

export interface Params extends LiveParams {
  readonly bpm: Bpm;
  readonly volume: UnitInterval;
  readonly seed: Seed;
}

export function randomSeed(): Seed {
  // Math.random is banned for generation; crypto is only used to pick a fresh master seed.
  return toSeed(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
}

export const DEFAULT_LIVE_PARAMS: LiveParams = {
  m2: clampUnit(0.3),
  // 0.25 from the requirements rounded every kick and hat mutation count to 0, freezing them for good.
  m8: clampUnit(0.35),
  fillIntensity: clampUnit(0.7),
};

export function defaultParams(): Params {
  return {
    ...DEFAULT_LIVE_PARAMS,
    bpm: DEFAULT_BPM,
    volume: clampUnit(0.8),
    seed: randomSeed(),
  };
}

export interface ParamStore {
  get(): Params;
  update(patch: Partial<Params>): void;
  subscribe(listener: (params: Params) => void): () => void;
}

export function createParamStore(initial: Params): ParamStore {
  let params = initial;
  const listeners = new Set<(params: Params) => void>();
  return {
    get: () => params,
    update(patch) {
      params = { ...params, ...patch };
      for (const listener of listeners) listener(params);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
