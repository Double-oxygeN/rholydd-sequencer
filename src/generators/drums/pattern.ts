import type { Brand } from '../../units.ts';
import { PARTS, type Part, type Step, type Velocity } from '../types.ts';
import { PROFILES, slotOf, slotsOf, type Slot } from './weights.ts';

export type Cell = Velocity | null;

/** Cells of one part over its period. Repeating it fills the 2 bars, so periodic parts cannot drift. */
export type Motif = Brand<readonly Cell[], 'Motif'>;

export type Pattern = Readonly<Record<Part, Motif>>;

export function toMotif(part: Part, cells: readonly Cell[]): Motif {
  const { period } = PROFILES[part];
  if (cells.length !== period) throw new RangeError(`${part} motif needs ${period} cells, got ${cells.length}`);
  return Object.freeze([...cells]) as Motif;
}

export function motifCell(pattern: Pattern, part: Part, slot: Slot): Cell {
  // Motif length matches the part's period by construction, so every slot is in range.
  return pattern[part][slot] as Cell;
}

/** The cell that sounds at a step of the 2 bars. */
export function cellAt(pattern: Pattern, part: Part, step: Step): Cell {
  return motifCell(pattern, part, slotOf(part, step));
}

export function motifOnsets(pattern: Pattern, part: Part): Slot[] {
  return slotsOf(part).filter((slot) => motifCell(pattern, part, slot) !== null);
}

export function withSlot(pattern: Pattern, part: Part, slot: Slot, cell: Cell): Pattern {
  const cells = [...pattern[part]];
  cells[slot] = cell;
  return { ...pattern, [part]: toMotif(part, cells) };
}

export function motifsEqual(a: Pattern, b: Pattern, part: Part): boolean {
  return slotsOf(part).every((slot) => motifCell(a, part, slot) === motifCell(b, part, slot));
}

export function patternsEqual(a: Pattern, b: Pattern): boolean {
  return PARTS.every((part) => motifsEqual(a, b, part));
}
