import { TAG, hash, type Seed } from '../../random/rng.ts';
import { clampUnit } from '../../units.ts';
import { initialPattern } from './base.ts';
import { mutate } from './mutate.ts';
import { motifsEqual, type Pattern } from './pattern.ts';

// One initial try plus up to 10 redraws, as the requirements specify.
const MAX_ATTEMPTS = 11;

/** A fresh pattern for section B whose kick differs from the reference, so the transition is clearly audible. */
export function transitionPattern(reference: Pattern, phraseSeed: Seed): Pattern {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = initialPattern(hash(phraseSeed, TAG.transition, attempt));
    if (!motifsEqual(candidate, reference, 'kick')) return candidate;
  }
  return mutate(reference, hash(phraseSeed, TAG.transition), clampUnit(1), 'strong');
}
