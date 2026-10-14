import { STEPS_PER_PAIR, type Step } from '../types.ts';

/**
 * Rhythms for a sub bass that lays the low-end skeleton. Busier lines are left to the reese bass.
 * long and tresillo ignore the kick on purpose, so the bass can also move against the drums.
 */
export const SUB_STYLES = ['kickFollow', 'long', 'push', 'tresillo', 'callResponse'] as const;
export type SubStyle = (typeof SUB_STYLES)[number];

interface StyleProfile {
  /** Chance of a new note at each step regardless of the kick. Step 0 is always struck. */
  readonly weights: readonly number[];
  /** Added to the chance where the kick sounds. This is how a style follows the kick. */
  readonly kickBonus: number;
  /** Steps where the previous note carries on instead of being struck again. */
  readonly tied: readonly number[];
}

function weightsAt(entries: Readonly<Record<number, number>>): readonly number[] {
  return Array.from({ length: STEPS_PER_PAIR }, (_, step) => (step === 0 ? 1 : (entries[step] ?? 0)));
}

const STYLES: Readonly<Record<SubStyle, StyleProfile>> = {
  kickFollow: { weights: weightsAt({}), kickBonus: 1, tied: [] },
  long: { weights: weightsAt({ 16: 0.5 }), kickBonus: 0, tied: [] },
  // Enters a 16th before bar 2 and holds through its downbeat.
  push: { weights: weightsAt({ 14: 0.7 }), kickBonus: 0.8, tied: [16] },
  // 8ths grouped 3 + 3 + 2 in each bar.
  tresillo: { weights: weightsAt({ 6: 0.8, 12: 0.8, 16: 0.8, 22: 0.8, 28: 0.8 }), kickBonus: 0, tied: [] },
  // Bar 1 asks plainly; the second half of bar 2 answers, where the drum ornaments also sit.
  callResponse: { weights: weightsAt({ 24: 0.5, 26: 0.5, 28: 0.5, 30: 0.5 }), kickBonus: 0.8, tied: [] },
};

export function attackChance(style: SubStyle, step: Step, kick: boolean): number {
  const profile = STYLES[style];
  if (profile.tied.includes(step)) return 0;
  return Math.min(1, (profile.weights[step] ?? 0) + (kick ? profile.kickBonus : 0));
}
