import { parseSeed, type Seed } from '../random/rng.ts';

/** The seed a shared link names, such as ?seed=12345. Anything that is not a valid seed counts as none. */
export function seedFromQuery(search: string): Seed | undefined {
  const value = new URLSearchParams(search).get('seed');
  return value === null ? undefined : parseSeed(value);
}

/**
 * The page's address to share: without its query and fragment, with ?seed= only when a seed is shared. The seed is
 * the only setting a link can carry (F-91), so nothing else from the address goes along.
 */
export function shareUrl(page: string, seed: Seed | undefined): string {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  if (seed !== undefined) url.searchParams.set('seed', String(seed));
  return url.href;
}
