import {
  GAP_START,
  dropLeadIn,
  hasGap,
  leadsIntoBreakdown,
  leadsIntoDrop,
  opensDrop,
  silencesGap,
  type DropLeadIn,
} from '../../structure/arrangement.ts';
import type { Context } from '../../structure/conductor.ts';
import { PAIRS_PER_SECTION } from '../../structure/form.ts';
import type { Brand, UnitInterval } from '../../units.ts';
import { heardDrums } from '../arrange.ts';
import { STEPS_PER_PAIR, type NoteEvent, type Step } from '../types.ts';

/** End of a span within 2 bars, exclusive: integer in [1, 32]. */
export type StepEnd = Brand<number, 'StepEnd'>;

/**
 * Part of an effect that runs longer than 2 bars, from the start of the 2 bars, as scenes only change between them.
 * Progress counts through the whole effect, so that every 2 bars can be scheduled alone and still join up with the
 * ones before and after.
 */
export interface FxSpan {
  readonly to: StepEnd;
  readonly startProgress: UnitInterval;
  readonly endProgress: UnitInterval;
}

/** Whether the span starts its effect rather than carrying on from the previous 2 bars. */
export function startsEffect(span: FxSpan): boolean {
  return span.startProgress === 0;
}

export interface RiserSegment {
  readonly fx: 'riser';
  readonly span: FxSpan;
}

/** The low-pass opens over the intro; the high-pass closes in over the build. */
export interface SweepSegment {
  readonly fx: 'sweep';
  readonly filter: 'lowpass' | 'highpass';
  readonly span: FxSpan;
}

export interface Impact {
  readonly fx: 'impact';
  readonly step: Step;
}

/** Sends one snare hit to the reverb, so that its tail carries over into the next scene. */
export interface ReverbThrow {
  readonly fx: 'throw';
  readonly step: Step;
}

/**
 * Opens both sweep filters again at the end of the 2 bars, as the drop lands. It belongs to the build rather than
 * to the drop so that it is timed from the same start as the high-pass ramp ending there: the next 2 bars start at
 * a time of their own, which can fall a hair before the ramp's end and leave the high-pass closed through the drop.
 */
export interface FilterReset {
  readonly fx: 'filterReset';
}

/**
 * The gap before a drop, from the given step to the end of the 2 bars. Playback cuts the pad when the gap
 * silences it, and leaves it ringing when the lead-in holds it over the stopped drums.
 */
export interface Gap {
  readonly fx: 'gap';
  readonly from: Step;
  readonly pad: 'cut' | 'held';
}

export type FxEvent = RiserSegment | SweepSegment | Impact | ReverbThrow | FilterReset | Gap;

/** Effects of the 2 bars. Random-free: positions within the scene and the drums that sound decide everything. */
export function fxEvents(ctx: Context, heard: readonly NoteEvent[]): readonly FxEvent[] {
  const events: FxEvent[] = [];
  const role = ctx.sceneRole;
  if (role.scene === 'build') {
    const peak = buildPeak(role.leadIn);
    const offset = (role.index * PAIRS_PER_SECTION + ctx.pairIn8) * STEPS_PER_PAIR;
    const total = role.sections * PAIRS_PER_SECTION * STEPS_PER_PAIR - (STEPS_PER_PAIR - peak);
    const span = spanOf(offset, total, leadsIntoDrop(ctx) ? peak : STEPS_PER_PAIR);
    events.push({ fx: 'riser', span }, { fx: 'sweep', filter: 'highpass', span });
  }
  // The intro opens up by its last 8 bars, which then play in full before the build.
  if (role.scene === 'intro' && role.index < role.sections - 1) {
    const offset = (role.index * PAIRS_PER_SECTION + ctx.pairIn8) * STEPS_PER_PAIR;
    const total = (role.sections - 1) * PAIRS_PER_SECTION * STEPS_PER_PAIR;
    events.push({ fx: 'sweep', filter: 'lowpass', span: spanOf(offset, total, STEPS_PER_PAIR) });
  }
  // After the build's sweep, so that playback schedules the reset after a ramp ending at the same instant.
  if (leadsIntoDrop(ctx)) events.push({ fx: 'filterReset' });
  if (opensDrop(ctx)) events.push({ fx: 'impact', step: 0 as Step });
  const leadIn = dropLeadIn(ctx);
  if (leadIn !== null && hasGap(leadIn)) {
    events.push({ fx: 'gap', from: GAP_START as Step, pad: silencesGap(leadIn) ? 'cut' : 'held' });
  }
  if (leadsIntoDrop(ctx) || leadsIntoBreakdown(ctx)) {
    // Whatever the lead-in, snares in the last beat before a drop stay dry so that no tail smears the drop's first hit.
    const lastSnare = heardDrums(heard).findLast(
      (hit) => hit.part === 'snare' && (!leadsIntoDrop(ctx) || hit.step < GAP_START),
    );
    if (lastSnare !== undefined) events.push({ fx: 'throw', step: lastSnare.step });
  }
  return events;
}

/**
 * Where the riser and the high-pass top out: as the gap opens when it silences everything, so that the riser's
 * peak hands over to the silence, and on the drop itself when something carries on through the last beat.
 */
function buildPeak(leadIn: DropLeadIn): number {
  return hasGap(leadIn) && silencesGap(leadIn) ? GAP_START : STEPS_PER_PAIR;
}

function spanOf(offset: number, total: number, to: number): FxSpan {
  return {
    to: to as StepEnd,
    startProgress: (offset / total) as UnitInterval,
    endProgress: ((offset + to) / total) as UnitInterval,
  };
}
