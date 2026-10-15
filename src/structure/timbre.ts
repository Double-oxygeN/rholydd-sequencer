import { TAG, createRng, hash, type Seed } from '../random/rng.ts';
import type { UnitInterval } from '../units.ts';

// Only the names live here, so that the generators never see how a synth is set up.
export const REESE_TIMBRES = ['classic', 'wide', 'hollow', 'growl'] as const;
export const STAB_TIMBRES = ['square', 'pluck', 'bell'] as const;
export const PAD_TIMBRES = ['saw', 'warm', 'glass'] as const;

export type ReeseTimbre = (typeof REESE_TIMBRES)[number];
export type StabTimbre = (typeof STAB_TIMBRES)[number];
export type PadTimbre = (typeof PAD_TIMBRES)[number];

/** The sound of each part with a table of sounds, fixed for the whole cycle. */
export interface CycleTimbre {
  readonly reese: ReeseTimbre;
  readonly stab: StabTimbre;
  readonly pad: PadTimbre;
}

const pick = <T>(list: readonly T[], roll: number): T => list[Math.floor(roll * list.length)] ?? list[0]!;

/**
 * Sounds of a cycle. Each part changes on its own under m32, like the main progression and the key, and a change
 * always leaves the previous sound out so that a part the draw changed never sounds the same.
 */
export function cycleTimbre(previous: CycleTimbre | undefined, cycleSeed: Seed, m32: UnitInterval): CycleTimbre {
  const rng = createRng(hash(cycleSeed, TAG.timbre));
  // Both draws are made for every part, changed or not, so that one part's choice never shifts the next one's.
  const choose = <T>(table: readonly T[], before: T | undefined): T => {
    const changeRoll = rng.float();
    const timbreRoll = rng.float();
    if (before === undefined) return pick(table, timbreRoll);
    if (changeRoll >= m32) return before;
    return pick(
      table.filter((timbre) => timbre !== before),
      timbreRoll,
    );
  };
  return {
    reese: choose(REESE_TIMBRES, previous?.reese),
    stab: choose(STAB_TIMBRES, previous?.stab),
    pad: choose(PAD_TIMBRES, previous?.pad),
  };
}
