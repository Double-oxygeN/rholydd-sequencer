import { GAP_START, changesScene, dropLeadIn, hasGap, plays, playsHit, type GapLeadIn } from '../structure/arrangement.ts';
import type { PadChord, ContextWithDrums, DrumHit, NoteEvent, PitchedEvent, Step, StepLength, Velocity } from './types.ts';

/** Every pitched part as generated for the 2 bars, before the scene decides what is heard. */
export interface PitchedParts {
  readonly sub: readonly PitchedEvent[];
  readonly reese: readonly PitchedEvent[];
  readonly stab: readonly PitchedEvent[];
  readonly pad: PadChord;
}

/** The one snare that breaks the silence of the gap, an 8th before the drop lands. */
export const PICKUP: DrumHit = {
  instrument: 'drums',
  step: 30 as Step,
  part: 'snare',
  velocity: 0.9 as Velocity,
  layer: 'fill',
};

/**
 * What is heard of the 2 bars: the parts the scene plays, and what the drop's lead-in leaves of the last beat.
 * The generated parts stay untouched, so a part that comes back carries on from where its stream has got to.
 */
export function arrange(ctx: ContextWithDrums, parts: PitchedParts): readonly NoteEvent[] {
  const role = ctx.sceneRole;
  // The breakdown's last fill brings the snare back early to announce the drums.
  const announcesDrums = role.scene === 'breakdown' && changesScene(ctx);
  const drums = ctx.drums.hits.filter(
    (hit) => playsHit(role, hit) || (announcesDrums && hit.part === 'snare' && hit.layer === 'fill'),
  );
  const pitched = [...parts.sub, ...parts.reese, ...parts.stab, parts.pad].filter((event) => plays(role, event.instrument));
  const leadIn = dropLeadIn(ctx);
  if (leadIn === null || !hasGap(leadIn)) return [...drums, ...pitched];
  return leaveGap(leadIn, drums, pitched);
}

// The pickup is added here rather than as a fill so that it stays when fills are turned off, as the gap does.
function leaveGap(leadIn: GapLeadIn, drums: readonly DrumHit[], pitched: readonly PitchedEvent[]): readonly NoteEvent[] {
  const before = drums.filter((hit) => hit.step < GAP_START);
  const held = pitched.flatMap((event) => (leadIn === 'padHold' && event.instrument === 'pad' ? [event] : cutAtGap(event)));
  return leadIn === 'pickup' ? [...before, PICKUP, ...held] : [...before, ...held];
}

/** Drum hits of the arranged events, for the parts that need to know which kicks really sound. */
export function heardDrums(events: readonly NoteEvent[]): readonly DrumHit[] {
  return events.filter((event) => event.instrument === 'drums');
}

function cutAtGap<E extends PitchedEvent>(event: E): E[] {
  if (event.step >= GAP_START) return [];
  return [{ ...event, length: Math.min(event.length, GAP_START - event.step) as StepLength }];
}
