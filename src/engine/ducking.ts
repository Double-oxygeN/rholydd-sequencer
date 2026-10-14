import type { Brand, UnitInterval } from '../units.ts';

/** Time on the audio context's clock. */
export type Seconds = Brand<number, 'Seconds'>;

/** Long enough not to click, short enough to be down before the kick's transient. */
export const DUCK_ATTACK = 0.003 as Seconds;

export interface DuckShape {
  /** Gain at the moment of the kick. */
  readonly floor: UnitInterval;
  /** Time to come back from the floor to full gain. */
  readonly release: Seconds;
}

/** One kick's dip, kept so that the next 2 bars can continue its recovery. */
export interface Dip extends DuckShape {
  readonly kick: Seconds;
}

/** Corner of the gain envelope. The envelope runs in straight lines between corners. */
export interface DuckPoint {
  readonly time: Seconds;
  readonly gain: UnitInterval;
}

export interface DuckPlan {
  readonly points: readonly DuckPoint[];
  /** The last kick's dip, or the carried one when no kick sounds. */
  readonly last: Dip | null;
}

/**
 * Gain envelope for the kicks of 2 bars. Kicks are known before they sound, so each dip starts an attack earlier
 * and is fully down on the kick. A kick that comes before the previous dip recovers starts from wherever the
 * recovery has got to, which the carried dip provides across 2-bar boundaries.
 */
export function duckPoints(kicks: readonly Seconds[], carry: Dip | null, shape: DuckShape): DuckPlan {
  const points: DuckPoint[] = [];
  let previous = carry;
  kicks.forEach((kick, i) => {
    const start = (kick - DUCK_ATTACK) as Seconds;
    points.push({ time: start, gain: previous === null ? (1 as UnitInterval) : recoveredGain(previous, start) });
    points.push({ time: kick, gain: shape.floor });
    const recovered = (kick + shape.release) as Seconds;
    const next = kicks[i + 1];
    // A later kick takes over before the recovery ends; its start point continues the recovery line instead.
    if (next === undefined || next - DUCK_ATTACK >= recovered) points.push({ time: recovered, gain: 1 as UnitInterval });
    previous = { kick, ...shape };
  });
  return { points, last: previous };
}

/** Gain of a dip at a time after its kick, on the straight line back to full gain. */
export function recoveredGain(dip: Dip, time: Seconds): UnitInterval {
  const progress = Math.min(1, Math.max(0, (time - dip.kick) / dip.release));
  return (dip.floor + (1 - dip.floor) * progress) as UnitInterval;
}
