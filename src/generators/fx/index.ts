import { GAP_START, leadsIntoBreakdown, leadsIntoDrop, opensDrop } from '../../structure/arrangement.ts';
import type { Context } from '../../structure/conductor.ts';
import { PAIRS_PER_SECTION } from '../../structure/form.ts';
import type { Brand, UnitInterval } from '../../units.ts';
import { heardDrums } from '../arrange.ts';
import { STEPS_PER_PAIR, type NoteEvent, type Step } from '../types.ts';

/** End of a span within 2 bars, exclusive: integer in [1, 32]. */
export type StepEnd = Brand<number, 'StepEnd'>;

/**
 * Part of an effect that runs longer than 2 bars. Progress counts through the whole effect, so that every 2 bars
 * can be scheduled alone and still join up with the ones before and after.
 */
export interface FxSpan {
  readonly from: Step;
  readonly to: StepEnd;
  readonly startProgress: UnitInterval;
  readonly endProgress: UnitInterval;
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

/** Opens both sweep filters again as the drop lands. */
export interface FilterReset {
  readonly fx: 'filterReset';
  readonly step: Step;
}

/** The silent beat before a drop, from the given step to the end of the 2 bars. */
export interface Gap {
  readonly fx: 'gap';
  readonly from: Step;
}

export type FxEvent = RiserSegment | SweepSegment | Impact | ReverbThrow | FilterReset | Gap;

/** Effects of the 2 bars. Random-free: positions within the scene and the drums that sound decide everything. */
export function fxEvents(ctx: Context, heard: readonly NoteEvent[]): readonly FxEvent[] {
  const events: FxEvent[] = [];
  const role = ctx.sceneRole;
  if (role.scene === 'build') {
    // Runs from the start of the build up to the silent beat, so the riser peaks right as the gap opens.
    const offset = (role.index * PAIRS_PER_SECTION + ctx.pairIn8) * STEPS_PER_PAIR;
    const total = role.sections * PAIRS_PER_SECTION * STEPS_PER_PAIR - (STEPS_PER_PAIR - GAP_START);
    const span = spanOf(offset, total, leadsIntoDrop(ctx) ? GAP_START : STEPS_PER_PAIR);
    events.push({ fx: 'riser', span }, { fx: 'sweep', filter: 'highpass', span });
  }
  // The intro opens up by its last 8 bars, which then play in full before the build.
  if (role.scene === 'intro' && role.index < role.sections - 1) {
    const offset = (role.index * PAIRS_PER_SECTION + ctx.pairIn8) * STEPS_PER_PAIR;
    const total = (role.sections - 1) * PAIRS_PER_SECTION * STEPS_PER_PAIR;
    events.push({ fx: 'sweep', filter: 'lowpass', span: spanOf(offset, total, STEPS_PER_PAIR) });
  }
  if (opensDrop(ctx)) events.push({ fx: 'impact', step: 0 as Step }, { fx: 'filterReset', step: 0 as Step });
  if (leadsIntoDrop(ctx)) events.push({ fx: 'gap', from: GAP_START as Step });
  if (leadsIntoDrop(ctx) || leadsIntoBreakdown(ctx)) {
    const lastSnare = heardDrums(heard).findLast((hit) => hit.part === 'snare');
    if (lastSnare !== undefined) events.push({ fx: 'throw', step: lastSnare.step });
  }
  return events;
}

function spanOf(offset: number, total: number, to: number): FxSpan {
  return {
    from: 0 as Step,
    to: to as StepEnd,
    startProgress: (offset / total) as UnitInterval,
    endProgress: ((offset + to) / total) as UnitInterval,
  };
}
