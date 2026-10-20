import { GAP_START, dropLeadIn, hasGap, type GapLeadIn } from '../structure/arrangement.ts';
import { announcesSnare, plays, playsHit } from '../structure/scene-parts.ts';
import type {
  ContextWithDrums,
  CymbalHit,
  DrumHit,
  NoteEvent,
  PadChord,
  PitchedEvent,
  Step,
  StepLength,
  Velocity,
} from './types.ts';

/** Every part but the drums as generated for the 2 bars, before the scene decides what is heard. */
export interface OtherParts {
  readonly sub: readonly PitchedEvent[];
  readonly reese: readonly PitchedEvent[];
  readonly stab: readonly PitchedEvent[];
  readonly pad: PadChord;
  readonly cymbal: readonly CymbalHit[];
}

/** The one snare that breaks the silence of the gap, an 8th before the drop lands. */
export function pickupHit(velocity: Velocity): DrumHit {
  return { instrument: 'drums', step: 30 as Step, part: 'snare', velocity, layer: 'fill' };
}

/**
 * What is heard of the 2 bars: the parts the scene plays, and what the drop's lead-in leaves of the last beat.
 * The generated parts stay untouched, so a part that comes back carries on from where its stream has got to.
 */
export function arrange(ctx: ContextWithDrums, parts: OtherParts, pickupVelocity: Velocity): readonly NoteEvent[] {
  const role = ctx.sceneRole;
  const announces = announcesSnare(ctx);
  const drums = ctx.drums.hits.filter(
    (hit) => playsHit(role, hit) || (announces && hit.part === 'snare' && hit.layer === 'fill'),
  );
  const cymbals = parts.cymbal.filter((hit) => plays(role, hit.part));
  const pitched = [...parts.sub, ...parts.reese, ...parts.stab, parts.pad].filter((event) => plays(role, event.instrument));
  const leadIn = dropLeadIn(ctx);
  if (leadIn === null || !hasGap(leadIn)) return [...drums, ...cymbals, ...pitched];
  return leaveGap(leadIn, [...drums, ...cymbals], pitched, pickupVelocity);
}

// The pickup is added here rather than as a fill so that it stays when fills are turned off, as the gap does.
// Cymbals stop with the drums, so that changing where they play can never fill the gap.
function leaveGap(
  leadIn: GapLeadIn,
  strikes: readonly (DrumHit | CymbalHit)[],
  pitched: readonly PitchedEvent[],
  pickupVelocity: Velocity,
): readonly NoteEvent[] {
  const before = strikes.filter((hit) => hit.step < GAP_START);
  const held = pitched.flatMap((event) => (leadIn === 'padHold' && event.instrument === 'pad' ? [event] : cutAtGap(event)));
  return leadIn === 'pickup' ? [...before, pickupHit(pickupVelocity), ...held] : [...before, ...held];
}

/** Drum hits of the arranged events, for the parts that need to know which kicks really sound. Never the cymbals. */
export function heardDrums(events: readonly NoteEvent[]): readonly DrumHit[] {
  return events.filter((event) => event.instrument === 'drums');
}

function cutAtGap<E extends PitchedEvent>(event: E): E[] {
  if (event.step >= GAP_START) return [];
  return [{ ...event, length: Math.min(event.length, GAP_START - event.step) as StepLength }];
}
