import { createHash } from 'node:crypto';
import type { LiveParams } from '../src/structure/conductor.ts';
import { DEFAULT_LIVE, liveParams, run, type GeneratedPair } from './helpers.ts';

/** Seeds and parameters whose generation phase 4 must keep as phase 3 left it, apart from the pitched parts. */
export const FINGERPRINT_RUNS: readonly { readonly seed: number; readonly live: LiveParams }[] = [
  { seed: 1, live: DEFAULT_LIVE },
  { seed: 42, live: DEFAULT_LIVE },
  { seed: 0xffffffff, live: DEFAULT_LIVE },
  { seed: 7, live: liveParams(1, 1, 1, 1, 1) },
  { seed: 123456789, live: liveParams(0, 0, 0, 0, 0) },
];

export const FINGERPRINT_BARS = 2048;

/** The drums, the layout, each cycle's key and sounds, and the effects: everything the harmony must not touch. */
export function unpitchedFingerprint(seed: number, live: LiveParams): string {
  return digest(run(seed, FINGERPRINT_BARS, () => live), ({ ctx, heard, fx }) => [
    ctx.drums,
    heard.filter((e) => e.instrument === 'drums'),
    ctx.layout,
    ctx.key,
    ctx.timbre,
    fx,
  ]);
}

function digest(pairs: readonly GeneratedPair[], pick: (pair: GeneratedPair) => unknown): string {
  const hash = createHash('sha256');
  for (const pair of pairs) hash.update(JSON.stringify(pick(pair)));
  return hash.digest('hex');
}
