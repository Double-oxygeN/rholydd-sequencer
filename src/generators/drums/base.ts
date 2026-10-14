import { createRng, type Seed } from '../../random/rng.ts';
import { PARTS, type Part } from '../types.ts';
import { satisfiesConstraints } from './constraints.ts';
import { toMotif, type Pattern } from './pattern.ts';
import { baseVelocity, slotsOf, weightAt, type Slot } from './weights.ts';

const MAX_ATTEMPTS = 10;

/** Anchors and main candidates only: the textbook two-step that every weight table is built around. */
export function canonicalPattern(): Pattern {
  return patternWhere((part, slot) => weightAt(part, slot) >= 0.5);
}

/** Samples each slot with probability equal to its weight, falling back to the canonical two-step. */
export function initialPattern(seed: Seed): Pattern {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pattern = patternWhere((part, slot) => rng.float() < weightAt(part, slot));
    if (satisfiesConstraints(pattern)) return pattern;
  }
  return canonicalPattern();
}

function patternWhere(sounds: (part: Part, slot: Slot) => boolean): Pattern {
  const entries = PARTS.map((part) => [
    part,
    toMotif(
      part,
      slotsOf(part).map((slot) => (sounds(part, slot) ? baseVelocity(part, slot) : null)),
    ),
  ]);
  return Object.fromEntries(entries) as Pattern;
}
