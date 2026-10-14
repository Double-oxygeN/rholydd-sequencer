import type { UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, type Step } from '../types.ts';

/**
 * Rhythms for the reese, which moves more than the sub in the mid range. None of them follow the kick: the
 * sidechain keeps the two apart instead.
 */
export const REESE_STYLES = ['sustain', 'roll', 'syncopated', 'response'] as const;
export type ReeseStyle = (typeof REESE_STYLES)[number];

function weightsAt(entries: (step: number) => number): readonly number[] {
  return Array.from({ length: STEPS_PER_PAIR }, (_, step) => (step === 0 ? 1 : entries(step)));
}

const at = (steps: readonly number[], weight: number) => (step: number) => (steps.includes(step) ? weight : 0);

const WEIGHTS: Readonly<Record<ReeseStyle, readonly number[]>> = {
  sustain: weightsAt(at([16], 0.6)),
  roll: weightsAt((step) => (step % 2 === 0 ? 0.6 : 0)),
  // 16th offbeats that push against the backbeat, the same in both bars.
  syncopated: weightsAt(at([3, 6, 10, 19, 22, 26], 0.7)),
  // The second half of bar 2 answers, where the drum ornaments also sit.
  response: weightsAt((step) => (step >= 24 ? 0.5 : 0)),
};

/** Lower energy leaves fewer notes, so quiet sections drift towards a held line. Step 0 always sounds. */
export function reeseChance(style: ReeseStyle, step: Step, energy: UnitInterval): number {
  return step === 0 ? 1 : (WEIGHTS[style][step] ?? 0) * energy;
}
