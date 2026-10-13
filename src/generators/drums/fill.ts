import { createRng, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, stepRange, type NoteEvent, type Part, type Step, type Velocity } from '../types.ts';
import { isAnchor } from './weights.ts';

export const FILL_KINDS = ['snareRoll', 'kickSnare', 'dropout', 'ghostRush'] as const;
export type FillKind = (typeof FILL_KINDS)[number];

/** The last 1 or 2 beats of the 8th bar. */
export const FILL_LENGTHS = [4, 8] as const;
export type FillLength = (typeof FILL_LENGTHS)[number];

export interface Fill {
  readonly kind: FillKind;
  readonly length: FillLength;
  /** Steps whose base and ornament hits are replaced by the fill. */
  readonly steps: readonly Step[];
  readonly events: readonly NoteEvent[];
}

type Hit = readonly [Part, number];

/** Template for one step. progress grows from just above 0 to 1 over the fill. */
type Template = (step: Step, progress: number) => readonly Hit[];

const TEMPLATES: Readonly<Record<FillKind, Template>> = {
  snareRoll: (_, progress) => [['snare', 0.4 + 0.6 * progress]],
  // Even steps carry the snare so that the backbeat at step 28 lines up with the alternation.
  kickSnare: (step) => (step % 2 === 0 ? [['snare', 0.9]] : [['kick', 0.95]]),
  dropout: () => [],
  ghostRush: (_, progress) => [['ghost', 0.25 + 0.35 * progress]],
};

export function fill(seed: Seed, intensity: UnitInterval): Fill | null {
  const rng = createRng(seed);
  // All draws happen before the decision so that changing the intensity only switches the fill on or off.
  const fires = rng.float() < intensity;
  const kind = FILL_KINDS[rng.int(FILL_KINDS.length)] ?? 'snareRoll';
  const length = FILL_LENGTHS[rng.int(FILL_LENGTHS.length)] ?? 4;
  if (!fires) return null;
  const start = STEPS_PER_PAIR - length;
  // Fills never replace the backbeat: F-06 takes priority over a complete dropout.
  const steps = stepRange(start, STEPS_PER_PAIR).filter((step) => !isAnchor('snare', step));
  const events = steps.flatMap((step) =>
    TEMPLATES[kind](step, (step - start + 1) / length).map(
      ([part, velocity]): NoteEvent => ({ step, part, velocity: velocity as Velocity, layer: 'fill' }),
    ),
  );
  return { kind, length, steps, events };
}
