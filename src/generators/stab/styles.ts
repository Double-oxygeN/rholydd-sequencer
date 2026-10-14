import type { UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, type Step } from '../types.ts';

export const STAB_STYLES = ['offbeat', 'dotted', 'sparse', 'response'] as const;
export type StabStyle = (typeof STAB_STYLES)[number];

/** Beats 2 and 4 of both bars. A stab there would blunt the snare. */
export const BACKBEAT_STEPS: readonly number[] = [4, 12, 20, 28];

function weightsAt(steps: readonly number[], weight: number): readonly number[] {
  return Array.from({ length: STEPS_PER_PAIR }, (_, step) =>
    steps.includes(step) && !BACKBEAT_STEPS.includes(step) ? weight : 0,
  );
}

const WEIGHTS: Readonly<Record<StabStyle, readonly number[]>> = {
  offbeat: weightsAt([2, 6, 10, 14, 18, 22, 26, 30], 0.4),
  dotted: weightsAt([0, 6, 16, 22], 0.6),
  sparse: weightsAt([6, 22], 0.6),
  response: weightsAt([24, 26, 30], 0.6),
};

/** No anchor: a quiet section may go without a stab for 2 bars. */
export function stabChance(style: StabStyle, step: Step, energy: UnitInterval): number {
  return (WEIGHTS[style][step] ?? 0) * energy;
}
