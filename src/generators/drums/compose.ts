import { ALL_STEPS, PARTS, type NoteEvent } from '../types.ts';
import { cellAt, type Pattern } from './pattern.ts';

export function compose(base: Pattern): NoteEvent[] {
  return ALL_STEPS.flatMap((step) =>
    PARTS.flatMap((part): NoteEvent[] => {
      const velocity = cellAt(base[part], step);
      return velocity === null ? [] : [{ step, part, velocity, layer: 'base' }];
    }),
  );
}
