import { parseSeed, type Seed } from '../random/rng.ts';

/** The seed a shared link names, such as ?seed=12345. Anything that is not a valid seed counts as none. */
export function seedFromQuery(search: string): Seed | undefined {
  const value = new URLSearchParams(search).get('seed');
  return value === null ? undefined : parseSeed(value);
}
