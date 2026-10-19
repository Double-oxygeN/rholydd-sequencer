import type { LiveParams } from '../structure/conductor.ts';
import type { Params } from './store.ts';

/**
 * What each reset puts back. The tempo, the key and the seed stay out: the first two only change while stopped, so a
 * reset would put back different things depending on playback, and the seed chooses the piece rather than tuning it.
 * The listening volume stays out too, as it has nothing to do with the piece or the mix.
 */
interface ResetValues {
  readonly live: LiveParams;
  readonly mix: Pick<Params, 'mixer' | 'ducking'>;
}

export type ResetScope = keyof ResetValues;

const PICK: { readonly [S in ResetScope]: (params: Params) => ResetValues[S] } = {
  live: ({ m2, m8, m32, fillIntensity, energyDepth }) => ({ m2, m8, m32, fillIntensity, energyDepth }),
  mix: ({ mixer, ducking }) => ({ mixer, ducking }),
};

/** The values to put back, taken from those the page opened with, the config file's included. */
export function resetValues<S extends ResetScope>(scope: S, initial: Params): ResetValues[S] {
  return PICK[scope](initial);
}

/** Compared by value: every move of a control makes new objects, so a mix moved and moved back is new but equal. */
export function isReset(scope: ResetScope, params: Params, initial: Params): boolean {
  return sameValues(PICK[scope](params), PICK[scope](initial));
}

function sameValues(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Object.is(a, b);
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && sameValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}
