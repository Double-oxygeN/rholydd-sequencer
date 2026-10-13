import { ALL_STEPS, PARTS, type NoteEvent } from '../types.ts';
import type { Fill } from './fill.ts';
import { cellAt, type Pattern } from './pattern.ts';

/** Overlays ornaments on the base pattern, then lets the fill replace its steps for every part except the backbeat. */
export function compose(base: Pattern, ornaments: readonly NoteEvent[], fill: Fill | null): NoteEvent[] {
  const slots = new Array<NoteEvent | undefined>(ALL_STEPS.length * PARTS.length);
  const slotOf = (event: NoteEvent) => event.step * PARTS.length + PARTS.indexOf(event.part);
  for (const part of PARTS) {
    for (const step of ALL_STEPS) {
      const velocity = cellAt(base, part, step);
      if (velocity !== null) {
        const event: NoteEvent = { step, part, velocity, layer: 'base' };
        slots[slotOf(event)] = event;
      }
    }
  }
  for (const event of ornaments) slots[slotOf(event)] = event;
  if (fill !== null) {
    for (const step of fill.steps) slots.fill(undefined, step * PARTS.length, (step + 1) * PARTS.length);
    for (const step of fill.backbeats) {
      for (const part of PARTS) if (part !== 'snare') slots[step * PARTS.length + PARTS.indexOf(part)] = undefined;
    }
    for (const event of fill.events) slots[slotOf(event)] = event;
  }
  return slots.filter((event) => event !== undefined);
}
