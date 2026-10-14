import { TAG, createRng, hash, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import type { Part } from '../types.ts';
import { PART_TAG } from './mutate.ts';
import { motifOnsets, withSlot, type Pattern } from './pattern.ts';
import { PROFILES, isAnchor, slotsOf, weightAt, type Slot } from './weights.ts';

// The snare is only the backbeat, which every section needs.
const THINNED_PARTS: readonly Part[] = ['kick', 'hat', 'ghost'];

/**
 * Drops non-anchor hits with probability (1 − energy) × (1 − weight), so weak positions go first
 * and the two-step skeleton survives. The result is temporary and never becomes the reference.
 */
export function thin(pattern: Pattern, sectionSeed: Seed, energy: UnitInterval): Pattern {
  let result = pattern;
  for (const part of THINNED_PARTS) {
    const rng = createRng(hash(sectionSeed, TAG.thin, PART_TAG[part]));
    // One draw per slot, sounding or not, so the stream never depends on the pattern.
    const rolls = slotsOf(part).map(() => rng.float());
    const onsets = motifOnsets(pattern, part);
    const dropped = onsets.filter(
      (slot) => !isAnchor(part, slot) && (rolls[slot] ?? 1) < (1 - energy) * (1 - weightAt(part, slot)),
    );
    const restoreCount = Math.max(0, PROFILES[part].minOnsets - (onsets.length - dropped.length));
    const restored = new Set(strongestFirst(part, dropped).slice(0, restoreCount));
    for (const slot of dropped) if (!restored.has(slot)) result = withSlot(result, part, slot, null);
  }
  return result;
}

function strongestFirst(part: Part, slots: readonly Slot[]): Slot[] {
  return [...slots].sort((a, b) => weightAt(part, b) - weightAt(part, a) || a - b);
}
