import type { NoteEvent, Step, StepLength } from '../generators/types.ts';

/**
 * What is left to play of 2 bars from a step on. A note sounding across the step plays again from there for the
 * rest of its length, so that resuming in the middle of the pad's chord or a held bass note does not leave a hole.
 */
export function eventsFrom(events: readonly NoteEvent[], from: Step): readonly NoteEvent[] {
  if (from === 0) return events;
  return events.flatMap((event): NoteEvent[] => {
    if (event.step >= from) return [event];
    if (event.instrument === 'drums' || event.step + event.length <= from) return [];
    return [{ ...event, step: from, length: (event.step + event.length - from) as StepLength }];
  });
}
