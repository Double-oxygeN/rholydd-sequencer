import { ALL_STEPS, PARTS } from '../types.ts';
import { cellAt, onsets, type Pattern } from './pattern.ts';
import { PROFILES, isAnchor, isForbidden } from './weights.ts';

/** Rules every base pattern must obey, both when first generated and after each mutation. */
export function satisfiesConstraints(pattern: Pattern): boolean {
  for (const part of PARTS) {
    const lane = pattern[part];
    const count = onsets(lane).length;
    const { minOnsets, maxOnsets } = PROFILES[part];
    if (count < minOnsets || count > maxOnsets) return false;
    for (const step of ALL_STEPS) {
      const sounding = cellAt(lane, step) !== null;
      if (isAnchor(part, step) && !sounding) return false;
      if (isForbidden(part, step) && sounding) return false;
    }
  }
  return ALL_STEPS.every(
    (step) =>
      cellAt(pattern.snare, step) === null ||
      (cellAt(pattern.kick, step) === null && cellAt(pattern.ghost, step) === null),
  );
}
