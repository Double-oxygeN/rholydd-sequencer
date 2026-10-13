import { ALL_STEPS, PARTS } from '../types.ts';
import { cellAt, motifCell, motifOnsets, type Pattern } from './pattern.ts';
import { PROFILES, isAnchor, isForbidden, slotsOf } from './weights.ts';

/** Rules every base pattern must obey, both when first generated and after each mutation. */
export function satisfiesConstraints(pattern: Pattern): boolean {
  for (const part of PARTS) {
    const count = motifOnsets(pattern, part).length;
    const { minOnsets, maxOnsets } = PROFILES[part];
    if (count < minOnsets || count > maxOnsets) return false;
    for (const slot of slotsOf(part)) {
      const sounding = motifCell(pattern, part, slot) !== null;
      if (isAnchor(part, slot) && !sounding) return false;
      if (isForbidden(part, slot) && sounding) return false;
    }
  }
  return ALL_STEPS.every(
    (step) =>
      cellAt(pattern, 'snare', step) === null ||
      (cellAt(pattern, 'kick', step) === null && cellAt(pattern, 'ghost', step) === null),
  );
}
