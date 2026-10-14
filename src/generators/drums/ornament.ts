import { createRng, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { stepRange, velocityBetween, type DrumHit, type Part, type Step, type Velocity } from '../types.ts';
import { cellAt, type Pattern } from './pattern.ts';
import { stepWeight } from './weights.ts';

/** Second half of the second bar. */
export const ORNAMENT_STEPS = stepRange(24, 32);
export const ORNAMENT_PARTS: readonly Part[] = ['hat', 'ghost'];
const ORNAMENT_VELOCITY: readonly [Velocity, Velocity] = [0.3 as Velocity, 0.6 as Velocity];

/** Temporary hits for one 2-bar unit. They are never written back into the base pattern. */
export function ornament(base: Pattern, seed: Seed, m2: UnitInterval, energy: UnitInterval): DrumHit[] {
  // A fresh stream per 2 bars makes the three repeat units of a section produce identical ornaments.
  const rng = createRng(seed);
  const events: DrumHit[] = [];
  for (const part of ORNAMENT_PARTS) {
    for (const step of ORNAMENT_STEPS) {
      // Both draws happen before any check so that the stream never depends on the pattern.
      const roll = rng.float();
      const loudness = rng.float();
      if (roll < m2 * stepWeight(part, step) * energy && canOrnament(base, part, step)) {
        const velocity = velocityBetween(...ORNAMENT_VELOCITY, loudness);
        events.push({ instrument: 'drums', step, part, velocity, layer: 'ornament' });
      }
    }
  }
  return events;
}

function canOrnament(base: Pattern, part: Part, step: Step): boolean {
  if (cellAt(base, part, step) !== null) return false;
  return part !== 'ghost' || cellAt(base, 'snare', step) === null;
}
