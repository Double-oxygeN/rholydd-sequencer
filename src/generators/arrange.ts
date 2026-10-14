import { GAP_START, changesScene, leadsIntoDrop, plays } from '../structure/arrangement.ts';
import type { PadChord, ContextWithDrums, DrumHit, NoteEvent, PitchedEvent, StepLength } from './types.ts';

/** Every pitched part as generated for the 2 bars, before the scene decides what is heard. */
export interface PitchedParts {
  readonly sub: readonly PitchedEvent[];
  readonly reese: readonly PitchedEvent[];
  readonly stab: readonly PitchedEvent[];
  readonly pad: PadChord;
}

/**
 * What is heard of the 2 bars: the parts the scene plays, and nothing in the silent beat before a drop.
 * The generated parts stay untouched, so a part that comes back carries on from where its stream has got to.
 */
export function arrange(ctx: ContextWithDrums, parts: PitchedParts): readonly NoteEvent[] {
  const role = ctx.sceneRole;
  // The breakdown's last fill brings the snare back early to announce the drums.
  const announcesDrums = role.scene === 'breakdown' && changesScene(ctx);
  const drums = ctx.drums.hits.filter(
    (hit) => plays(role, hit.part) || (announcesDrums && hit.part === 'snare' && hit.layer === 'fill'),
  );
  const pitched = [...parts.sub, ...parts.reese, ...parts.stab, parts.pad].filter((event) => plays(role, event.instrument));
  if (!leadsIntoDrop(ctx)) return [...drums, ...pitched];
  return [...drums.filter((hit) => hit.step < GAP_START), ...pitched.flatMap(cutAtGap)];
}

/** Drum hits of the arranged events, for the parts that need to know which kicks really sound. */
export function heardDrums(events: readonly NoteEvent[]): readonly DrumHit[] {
  return events.filter((event) => event.instrument === 'drums');
}

function cutAtGap<E extends PitchedEvent>(event: E): E[] {
  if (event.step >= GAP_START) return [];
  return [{ ...event, length: Math.min(event.length, GAP_START - event.step) as StepLength }];
}
