import type { Brand } from '../../units.ts';
import { ALL_STEPS, PARTS, STEPS_PER_PAIR, type Part, type Step, type Velocity } from '../types.ts';

export type Cell = Velocity | null;

/** Cells of one part over 2 bars: always exactly 32 cells. */
export type Lane = Brand<readonly Cell[], 'Lane'>;

export type Pattern = Readonly<Record<Part, Lane>>;

export function toLane(cells: readonly Cell[]): Lane {
  if (cells.length !== STEPS_PER_PAIR) throw new RangeError(`Lane needs ${STEPS_PER_PAIR} cells, got ${cells.length}`);
  return Object.freeze([...cells]) as Lane;
}

export function cellAt(lane: Lane, step: Step): Cell {
  // Lane length is guaranteed by toLane, so the index is always in range.
  return lane[step] as Cell;
}

export function onsets(lane: Lane): Step[] {
  return ALL_STEPS.filter((step) => cellAt(lane, step) !== null);
}

export function withCell(pattern: Pattern, part: Part, step: Step, cell: Cell): Pattern {
  const cells = [...pattern[part]];
  cells[step] = cell;
  return { ...pattern, [part]: toLane(cells) };
}

export function patternsEqual(a: Pattern, b: Pattern): boolean {
  return PARTS.every((part) => ALL_STEPS.every((step) => cellAt(a[part], step) === cellAt(b[part], step)));
}
