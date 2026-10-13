import { clampUnit, type UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, type Part, type Step, type Velocity } from '../types.ts';

export interface PartProfile {
  /** How likely each of the 32 steps is to sound. 1 = anchor, 0 = forbidden. */
  readonly weights: readonly UnitInterval[];
  /** Scales the number of mutations at 8-bar boundaries. */
  readonly mutability: UnitInterval;
  readonly minOnsets: number;
  readonly maxOnsets: number;
  /** Velocity at weight 0 and at weight 1. Stronger positions are played louder. */
  readonly velocity: readonly [Velocity, Velocity];
}

function twoBars(bar1: readonly number[], bar2: readonly number[]): readonly UnitInterval[] {
  const weights = [...bar1, ...bar2];
  if (weights.length !== STEPS_PER_PAIR) throw new RangeError(`Weight table needs ${STEPS_PER_PAIR} steps`);
  return weights.map(clampUnit);
}

const v = (x: number) => x as Velocity;

//                       0     1     2     3     4     5     6     7     8     9    10    11    12    13    14    15
export const PROFILES: Readonly<Record<Part, PartProfile>> = {
  kick: {
    weights: twoBars(
      [1.0, 0.0, 0.1, 0.2, 0.0, 0.0, 0.1, 0.2, 0.1, 0.0, 0.8, 0.3, 0.0, 0.0, 0.2, 0.1],
      [0.6, 0.0, 0.1, 0.2, 0.0, 0.0, 0.1, 0.3, 0.1, 0.0, 0.6, 0.3, 0.0, 0.0, 0.2, 0.1],
    ),
    mutability: clampUnit(0.4),
    minOnsets: 2,
    maxOnsets: 7,
    velocity: [v(0.85), v(1.0)],
  },
  snare: {
    weights: twoBars(
      [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.1],
      [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 1.0, 0.0, 0.2, 0.1],
    ),
    mutability: clampUnit(0.3),
    minOnsets: 4,
    maxOnsets: 6,
    velocity: [v(0.6), v(1.0)],
  },
  hat: {
    weights: twoBars(
      [0.3, 0.1, 0.8, 0.1, 0.3, 0.1, 0.7, 0.2, 0.3, 0.1, 0.8, 0.1, 0.3, 0.1, 0.7, 0.2],
      [0.3, 0.1, 0.8, 0.1, 0.3, 0.1, 0.7, 0.2, 0.3, 0.1, 0.8, 0.1, 0.3, 0.1, 0.8, 0.3],
    ),
    mutability: clampUnit(0.8),
    minOnsets: 8,
    maxOnsets: 20,
    velocity: [v(0.35), v(0.8)],
  },
  ghost: {
    weights: twoBars(
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

export function weightAt(part: Part, step: Step): UnitInterval {
  return PROFILES[part].weights[step] as UnitInterval;
}

export function isAnchor(part: Part, step: Step): boolean {
  return weightAt(part, step) === 1;
}

export function isForbidden(part: Part, step: Step): boolean {
  return weightAt(part, step) === 0;
}

export function baseVelocity(part: Part, step: Step): Velocity {
  const [lo, hi] = PROFILES[part].velocity;
  return (lo + (hi - lo) * weightAt(part, step)) as Velocity;
}
