import { ALL_STEPS, PARTS, type NoteEvent } from '../types.ts';
import { cellAt, type Pattern } from './pattern.ts';

/** Overlays ornaments on the base pattern. */
export function compose(base: Pattern, ornaments: readonly NoteEvent[]): NoteEvent[] {
  const slots = new Array<NoteEvent | undefined>(ALL_STEPS.length * PARTS.length);
  const slotOf = (event: NoteEvent) => event.step * PARTS.length + PARTS.indexOf(event.part);
  for (const part of PARTS) {
    for (const step of ALL_STEPS) {
      const velocity = cellAt(base[part], step);
      if (velocity !== null) {
        const event: NoteEvent = { step, part, velocity, layer: 'base' };
        slots[slotOf(event)] = event;
      }
    }
  }
  for (const event of ornaments) slots[slotOf(event)] = event;
  return slots.filter((event) => event !== undefined);
}
