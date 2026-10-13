import type { Context } from '../structure/conductor.ts';
import type { Brand } from '../units.ts';

export const PARTS = ['kick', 'snare', 'hat', 'ghost'] as const;
export type Part = (typeof PARTS)[number];

export const STEPS_PER_BAR = 16;
export const STEPS_PER_PAIR = 32;

/** 16th-note position within 2 bars: integer in [0, 31]. */
export type Step = Brand<number, 'Step'>;

export function toStep(n: number): Step | undefined {
  return Number.isInteger(n) && n >= 0 && n < STEPS_PER_PAIR ? (n as Step) : undefined;
}

export const ALL_STEPS: readonly Step[] = Array.from({ length: STEPS_PER_PAIR }, (_, i) => i as Step);

export function stepRange(from: number, to: number): readonly Step[] {
  return ALL_STEPS.slice(from, to);
}

/** Loudness of an audible hit in (0, 1]. Silence is the absence of a hit, never velocity 0. */
export type Velocity = Brand<number, 'Velocity'>;

export function toVelocity(x: number): Velocity | undefined {
  return x > 0 && x <= 1 ? (x as Velocity) : undefined;
}

/** Linear interpolation that stays audible as long as lo > 0. */
export function velocityBetween(lo: Velocity, hi: Velocity, t: number): Velocity {
  return (lo + (hi - lo) * Math.min(1, Math.max(0, t))) as Velocity;
}

export type Layer = 'base' | 'ornament' | 'fill';

export interface NoteEvent {
  readonly step: Step;
  readonly part: Part;
  readonly velocity: Velocity;
  readonly layer: Layer;
}

export interface Generator {
  /** Events for the next 2 bars. Never produces sound by itself. */
  generate(ctx: Context): readonly NoteEvent[];
}
