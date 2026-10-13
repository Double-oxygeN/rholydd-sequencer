import { TAG, createRng, hash, pickWeighted, type Rng, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { ALL_STEPS, PARTS, toStep, type Part, type Step } from '../types.ts';
import { satisfiesConstraints } from './constraints.ts';
import { cellAt, onsets, withCell, type Pattern } from './pattern.ts';
import { PROFILES, baseVelocity, isAnchor, weightAt } from './weights.ts';

// One initial try plus up to 10 redraws, as the requirements specify.
const MAX_ATTEMPTS = 11;
const MOVE_OFFSETS = [-2, -1, 1, 2] as const;
const OPERATIONS = ['add', 'remove', 'move'] as const;

// Indexes into the hash are integers, matching the TAG convention in rng.ts.
const PART_TAG: Readonly<Record<Part, number>> = { kick: 1, snare: 2, hat: 3, ghost: 4 };

export function mutationCount(part: Part, pattern: Pattern, m8: UnitInterval): number {
  return Math.round(m8 * PROFILES[part].mutability * onsets(pattern[part]).length);
}

/** Rewrites the base pattern at an 8-bar boundary. The result becomes the reference until the next boundary. */
export function mutate(base: Pattern, sectionSeed: Seed, m8: UnitInterval): Pattern {
  let pattern = base;
  for (const part of PARTS) {
    // A separate stream per part keeps e.g. the hat mutations unchanged when the kick count changes.
    const rng = createRng(hash(sectionSeed, TAG.mutate, PART_TAG[part]));
    const count = mutationCount(part, pattern, m8);
    for (let i = 0; i < count; i++) pattern = mutateOnce(pattern, part, rng);
  }
  return pattern;
}

function mutateOnce(pattern: Pattern, part: Part, rng: Rng): Pattern {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = applyOperation(pattern, part, rng);
    if (candidate !== undefined && satisfiesConstraints(candidate)) return candidate;
  }
  return pattern;
}

function applyOperation(pattern: Pattern, part: Part, rng: Rng): Pattern | undefined {
  const operation = OPERATIONS[rng.int(OPERATIONS.length)];
  switch (operation) {
    case 'add': {
      const step = pickStep(rng, emptyAllowedSteps(pattern, part), (s) => weightAt(part, s));
      return step === undefined ? undefined : withCell(pattern, part, step, baseVelocity(part, step));
    }
    case 'remove': {
      // Weak positions are removed first so that accumulated mutations drift back toward the weight table.
      const step = pickStep(rng, movableOnsets(pattern, part), (s) => 1 - weightAt(part, s));
      return step === undefined ? undefined : withCell(pattern, part, step, null);
    }
    case 'move': {
      const from = pickStep(rng, movableOnsets(pattern, part), (s) => 1 - weightAt(part, s));
      if (from === undefined) return undefined;
      const targets = MOVE_OFFSETS.map((offset) => toStep(from + offset)).filter(
        (s): s is Step => s !== undefined && isEmptyAndAllowed(pattern, part, s),
      );
      const to = pickStep(rng, targets, (s) => weightAt(part, s));
      return to === undefined ? undefined : withCell(withCell(pattern, part, from, null), part, to, baseVelocity(part, to));
    }
    case undefined:
      return undefined;
  }
}

function pickStep(rng: Rng, steps: readonly Step[], weightOf: (step: Step) => number): Step | undefined {
  const index = pickWeighted(rng, steps.map(weightOf));
  return index === undefined ? undefined : steps[index];
}

function isEmptyAndAllowed(pattern: Pattern, part: Part, step: Step): boolean {
  return cellAt(pattern[part], step) === null && weightAt(part, step) > 0;
}

function emptyAllowedSteps(pattern: Pattern, part: Part): Step[] {
  return ALL_STEPS.filter((step) => isEmptyAndAllowed(pattern, part, step));
}

function movableOnsets(pattern: Pattern, part: Part): Step[] {
  return onsets(pattern[part]).filter((step) => !isAnchor(part, step));
}
