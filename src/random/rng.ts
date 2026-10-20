import type { Brand } from '../units.ts';

/** 32-bit unsigned integer seed. */
export type Seed = Brand<number, 'Seed'>;

export function toSeed(x: number): Seed {
  return (x >>> 0) as Seed;
}

/** Parses a decimal 32-bit unsigned integer. Returns undefined for anything else. */
export function parseSeed(text: string): Seed | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return n <= 0xffffffff ? toSeed(n) : undefined;
}

const GOLDEN = 0x9e3779b9;

function mix32(x: number): number {
  let t = (x + GOLDEN) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

// Tags are integers rather than strings so that hashing needs only 32-bit arithmetic.
// Every value is distinct: two uses sharing a tag would share a random stream.
export const TAG = {
  section: 1,
  fill: 2,
  base: 3,
  mutate: 4,
  phrase: 5,
  mutate32: 6,
  transition: 7,
  ornament: 8,
  thin: 9,
  subStyle: 10,
  subRhythm: 11,
  subPitch: 12,
  progression: 13,
  reeseStyle: 14,
  reeseRhythm: 15,
  reesePitch: 16,
  stabStyle: 17,
  stabRhythm: 18,
  cycle: 19,
  layout: 20,
  modulation: 21,
  timbre: 22,
  dropLeadIn: 23,
  harmonyColor: 24,
  introOrder: 25,
  rideStyle: 26,
} as const;
export const REL = { repeat: 1, variant: 2 } as const;

export function hash(...xs: readonly number[]): Seed {
  let h = 0;
  for (const x of xs) h = mix32(h ^ x);
  return h as Seed;
}

export interface Rng {
  /** Uniform 32-bit unsigned integer. */
  u32(): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  chance(p: number): boolean;
}

export function createRng(seed: Seed): Rng {
  let s = seed | 0;
  const next32 = () => ((s = (s + GOLDEN) | 0), mix32(s - GOLDEN));
  let a = next32();
  let b = next32();
  let c = next32();
  let d = next32();
  const u32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Similar initial states make sfc32's first outputs similar, so discard them.
  for (let i = 0; i < 15; i++) u32();
  const float = () => u32() / 4294967296;
  return {
    u32,
    float,
    int: (n) => Math.floor(float() * n),
    chance: (p) => float() < p,
  };
}

/**
 * Picks an index with probability proportional to its weight.
 * Always consumes exactly one draw so that the stream does not depend on the weights.
 */
export function pickWeighted(rng: Rng, weights: readonly number[]): number | undefined {
  return weightedIndex(rng.float(), weights);
}

/** Picks an index from a roll in [0, 1) drawn beforehand, for streams that must draw before knowing the weights. */
export function weightedIndex(r: number, weights: readonly number[]): number | undefined {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return undefined;
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] ?? 0;
    if (target < acc) return i;
  }
  return weights.length - 1;
}
