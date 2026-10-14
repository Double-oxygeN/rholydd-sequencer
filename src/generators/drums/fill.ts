import { createRng, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, stepRange, type NoteEvent, type Part, type Step, type Velocity } from '../types.ts';
import { isAnchorStep } from './weights.ts';

export const FILL_KINDS = ['snareRoll', 'ghostRush', 'dropout', 'kickSolo', 'snareSolo', 'hatSolo'] as const;
export type FillKind = (typeof FILL_KINDS)[number];

/** The last 1 or 2 beats of the 8th bar. */
export const FILL_LENGTHS = [4, 8] as const;
export type FillLength = (typeof FILL_LENGTHS)[number];

export interface Fill {
  readonly kind: FillKind;
  readonly length: FillLength;
  /** Steps taken over by the fill. */
  readonly steps: readonly Step[];
  /** Part that keeps its regular hits inside the fill. Every other part is silenced there. */
  readonly kept: Part | null;
  /** Hits the fill adds on top of the kept part. */
  readonly events: readonly NoteEvent[];
}

type Hit = readonly [Part, number];

interface Template {
  readonly kept: Part | null;
  /** Hits for one step. progress grows from just above 0 to 1 over the fill. */
  hits(step: Step, progress: number): readonly Hit[];
}

const TEMPLATES: Readonly<Record<FillKind, Template>> = {
  snareRoll: { kept: null, hits: (_, progress) => [['snare', 0.4 + 0.6 * progress]] },
  // A ghost roll alone sounds like a dropout with noise; keeping the backbeat makes it read as a fill.
  ghostRush: {
    kept: 'snare',
    hits: (step, progress) => (isAnchorStep('snare', step) ? [] : [['ghost', 0.25 + 0.35 * progress]]),
  },
  dropout: { kept: null, hits: () => [] },
  kickSolo: { kept: 'kick', hits: () => [] },
  snareSolo: { kept: 'snare', hits: () => [] },
  hatSolo: { kept: 'hat', hits: () => [] },
};

export function fill(seed: Seed, intensity: UnitInterval): Fill | null {
  const rng = createRng(seed);
  // All draws happen before the decision so that changing the intensity only switches the fill on or off.
  const fires = rng.float() < intensity;
  const kind = FILL_KINDS[rng.int(FILL_KINDS.length)] ?? 'snareRoll';
  const length = FILL_LENGTHS[rng.int(FILL_LENGTHS.length)] ?? 4;
  if (!fires) return null;
  const start = STEPS_PER_PAIR - length;
  const steps = stepRange(start, STEPS_PER_PAIR);
  const template = TEMPLATES[kind];
  const events = steps.flatMap((step) =>
    template
      .hits(step, (step - start + 1) / length)
      .map(([part, velocity]): NoteEvent => ({ step, part, velocity: velocity as Velocity, layer: 'fill' })),
  );
  return { kind, length, steps, kept: template.kept, events };
}
