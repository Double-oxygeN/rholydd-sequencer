import { clampUnit, type Brand, type UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, type Part, type Step, type Velocity } from '../types.ts';

/** Length of a part's motif: 4 repeats one beat over the 2 bars, 32 covers the 2 bars once. */
export type Period = 4 | typeof STEPS_PER_PAIR;

/** Position within a part's motif: integer in [0, period). */
export type Slot = Brand<number, 'Slot'>;

export interface PartProfile {
  readonly period: Period;
  /** How likely each slot of the motif is to sound. 1 = anchor, 0 = forbidden. */
  readonly weights: readonly UnitInterval[];
  /** Scales the number of mutations at 8-bar boundaries. */
  readonly mutability: UnitInterval;
  /** Bounds on the number of onsets within one motif. */
  readonly minOnsets: number;
  readonly maxOnsets: number;
  /** Velocity at weight 0 and at weight 1. Stronger positions are played louder. */
  readonly velocity: readonly [Velocity, Velocity];
}

function motifWeights(period: Period, ...bars: readonly (readonly number[])[]): readonly UnitInterval[] {
  const weights = bars.flat();
  if (weights.length !== period) throw new RangeError(`Weight table needs ${period} slots, got ${weights.length}`);
  return weights.map(clampUnit);
}

const v = (x: number) => x as Velocity;

//                                    0     1     2     3     4     5     6     7     8     9    10    11    12    13    14    15
export const PROFILES: Readonly<Record<Part, PartProfile>> = {
  kick: {
    period: STEPS_PER_PAIR,
    weights: motifWeights(
      STEPS_PER_PAIR,
      [1.0, 0.0, 0.1, 0.2, 0.0, 0.0, 0.1, 0.2, 0.1, 0.0, 0.8, 0.3, 0.0, 0.0, 0.2, 0.1],
      [0.6, 0.0, 0.1, 0.2, 0.0, 0.0, 0.1, 0.3, 0.1, 0.0, 0.6, 0.3, 0.0, 0.0, 0.2, 0.1],
    ),
    mutability: clampUnit(0.4),
    minOnsets: 2,
    maxOnsets: 7,
    velocity: [v(0.85), v(1.0)],
  },
  snare: {
    period: STEPS_PER_PAIR,
    weights: motifWeights(
      STEPS_PER_PAIR,
      [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.1],
      [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 1.0, 0.0, 0.2, 0.1],
    ),
    mutability: clampUnit(0.3),
    minOnsets: 4,
    maxOnsets: 6,
    velocity: [v(0.6), v(1.0)],
  },
  // One beat repeated over the 2 bars: a free 32-step hat line sounded aimless.
  hat: {
    period: 4,
    weights: motifWeights(4, [0.5, 0.1, 0.8, 0.2]),
    mutability: clampUnit(0.8),
    minOnsets: 1,
    maxOnsets: 4,
    velocity: [v(0.35), v(0.8)],
  },
  ghost: {
    period: STEPS_PER_PAIR,
    weights: motifWeights(
      STEPS_PER_PAIR,
      [0.0, 0.1, 0.0, 0.1, 0.0, 0.1, 0.2, 0.6, 0.0, 0.5, 0.0, 0.1, 0.0, 0.1, 0.2, 0.6],
      [0.0, 0.1, 0.0, 0.1, 0.0, 0.1, 0.2, 0.5, 0.0, 0.6, 0.0, 0.1, 0.0, 0.1, 0.2, 0.5],
    ),
    mutability: clampUnit(1.0),
    // At 0 onsets the mutation count round(m8 × mutability × onsets) is 0 forever, so ghosts could never return.
    minOnsets: 2,
    maxOnsets: 8,
    velocity: [v(0.2), v(0.35)],
  },
};

const SLOTS: Readonly<Record<Part, readonly Slot[]>> = {
  kick: slotRange(PROFILES.kick.period),
  snare: slotRange(PROFILES.snare.period),
  hat: slotRange(PROFILES.hat.period),
  ghost: slotRange(PROFILES.ghost.period),
};

function slotRange(period: Period): readonly Slot[] {
  return Array.from({ length: period }, (_, i) => i as Slot);
}

export function slotsOf(part: Part): readonly Slot[] {
  return SLOTS[part];
}

export function toSlot(part: Part, n: number): Slot | undefined {
  return Number.isInteger(n) && n >= 0 && n < PROFILES[part].period ? (n as Slot) : undefined;
}

export function slotOf(part: Part, step: Step): Slot {
  return (step % PROFILES[part].period) as Slot;
}

export function weightAt(part: Part, slot: Slot): UnitInterval {
  return PROFILES[part].weights[slot] as UnitInterval;
}

export function stepWeight(part: Part, step: Step): UnitInterval {
  return weightAt(part, slotOf(part, step));
}

export function isAnchor(part: Part, slot: Slot): boolean {
  return weightAt(part, slot) === 1;
}

export function isAnchorStep(part: Part, step: Step): boolean {
  return isAnchor(part, slotOf(part, step));
}

export function isForbidden(part: Part, slot: Slot): boolean {
  return weightAt(part, slot) === 0;
}

export function baseVelocity(part: Part, slot: Slot): Velocity {
  const [lo, hi] = PROFILES[part].velocity;
  return (lo + (hi - lo) * weightAt(part, slot)) as Velocity;
}
