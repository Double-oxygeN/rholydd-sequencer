import { TAG, createRng, hash, pickWeighted, type Rng, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { PARTS, type Part } from '../types.ts';
import { satisfiesConstraints } from './constraints.ts';
import { motifCell, motifOnsets, withSlot, type Pattern } from './pattern.ts';
import { PROFILES, baseVelocity, isAnchor, slotsOf, toSlot, weightAt, type Slot } from './weights.ts';

// One initial try plus up to 10 redraws, as the requirements specify.
const MAX_ATTEMPTS = 11;
const MOVE_OFFSETS = [-2, -1, 1, 2] as const;
const OPERATIONS = ['add', 'remove', 'move'] as const;

// Indexes into the hash are integers, matching the TAG convention in rng.ts.
export const PART_TAG: Readonly<Record<Part, number>> = { kick: 1, snare: 2, hat: 3, ghost: 4 };

/** variant: reference → A' or A'' at an 8-bar boundary. strong: reference → next reference at a 32-bar boundary. */
export type MutationKind = 'variant' | 'strong';

const KIND_TAG: Readonly<Record<MutationKind, number>> = { variant: TAG.mutate, strong: TAG.mutate32 };

function mutability(part: Part, kind: MutationKind): UnitInterval {
  return kind === 'variant' ? PROFILES[part].mutability : PROFILES[part].strongMutability;
}

/** Counts onsets within the motif, so a repeated one-beat hat is mutated as one beat, not as 8 copies. */
export function expectedMutations(part: Part, pattern: Pattern, amount: UnitInterval, kind: MutationKind): number {
  return amount * mutability(part, kind) * motifOnsets(pattern, part).length;
}

/**
 * Rounds up with probability equal to the fractional part, so the mean stays at the expected value.
 * Plain rounding turned every expectation below 0.5 into 0 and froze sparse kicks and hats for good.
 */
export function mutationCount(expected: number, rng: Rng): number {
  const whole = Math.floor(expected);
  // Drawn even when the fraction is 0 so that the rest of the stream does not depend on m8.
  return whole + (rng.float() < expected - whole ? 1 : 0);
}

/** Returns a mutated copy of the pattern. amount is m8 for variants and m32 for strong mutations. */
export function mutate(base: Pattern, seed: Seed, amount: UnitInterval, kind: MutationKind = 'variant'): Pattern {
  let pattern = base;
  for (const part of PARTS) {
    // A separate stream per part keeps e.g. the hat mutations unchanged when the kick count changes.
    const rng = createRng(hash(seed, KIND_TAG[kind], PART_TAG[part]));
    const count = mutationCount(expectedMutations(part, pattern, amount, kind), rng);
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
      const slot = pickSlot(rng, emptyAllowedSlots(pattern, part), (s) => weightAt(part, s));
      return slot === undefined ? undefined : withSlot(pattern, part, slot, baseVelocity(part, slot));
    }
    case 'remove': {
      // Weak positions are removed first so that accumulated mutations drift back toward the weight table.
      const slot = pickSlot(rng, movableOnsets(pattern, part), (s) => 1 - weightAt(part, s));
      return slot === undefined ? undefined : withSlot(pattern, part, slot, null);
    }
    case 'move': {
      const from = pickSlot(rng, movableOnsets(pattern, part), (s) => 1 - weightAt(part, s));
      if (from === undefined) return undefined;
      const targets = MOVE_OFFSETS.map((offset) => toSlot(part, from + offset)).filter(
        (s): s is Slot => s !== undefined && isEmptyAndAllowed(pattern, part, s),
      );
      const to = pickSlot(rng, targets, (s) => weightAt(part, s));
      return to === undefined ? undefined : withSlot(withSlot(pattern, part, from, null), part, to, baseVelocity(part, to));
    }
    case undefined:
      return undefined;
  }
}

function pickSlot(rng: Rng, slots: readonly Slot[], weightOf: (slot: Slot) => number): Slot | undefined {
  const index = pickWeighted(rng, slots.map(weightOf));
  return index === undefined ? undefined : slots[index];
}

function isEmptyAndAllowed(pattern: Pattern, part: Part, slot: Slot): boolean {
  return motifCell(pattern, part, slot) === null && weightAt(part, slot) > 0;
}

function emptyAllowedSlots(pattern: Pattern, part: Part): Slot[] {
  return slotsOf(part).filter((slot) => isEmptyAndAllowed(pattern, part, slot));
}

function movableOnsets(pattern: Pattern, part: Part): Slot[] {
  return motifOnsets(pattern, part).filter((slot) => !isAnchor(part, slot));
}
