import { createRng, type Seed } from '../../random/rng.ts';
import { ALL_STEPS, PARTS, type Part, type Step } from '../types.ts';
import { satisfiesConstraints } from './constraints.ts';
import { toLane, type Pattern } from './pattern.ts';
import { baseVelocity, weightAt } from './weights.ts';

const MAX_ATTEMPTS = 10;

/** Anchors and main candidates only: the textbook two-step that every weight table is built around. */
export function canonicalPattern(): Pattern {
  return patternWhere((part, step) => weightAt(part, step) >= 0.5);
}

/** Samples each step with probability equal to its weight, falling back to the canonical two-step. */
export function initialPattern(seed: Seed): Pattern {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pattern = patternWhere((part, step) => rng.float() < weightAt(part, step));
    if (satisfiesConstraints(pattern)) return pattern;
  }
  return canonicalPattern();
}

function patternWhere(sounds: (part: Part, step: Step) => boolean): Pattern {
  const entries = PARTS.map((part) => [
    part,
    toLane(ALL_STEPS.map((step) => (sounds(part, step) ? baseVelocity(part, step) : null))),
  ]);
  return Object.fromEntries(entries) as Pattern;
}
