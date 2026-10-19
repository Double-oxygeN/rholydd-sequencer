import { TAG, createRng, hash } from '../../random/rng.ts';
import { opensDrop } from '../../structure/arrangement.ts';
import { SECTIONS_PER_PHRASE } from '../../structure/form.ts';
import type { Context } from '../../structure/conductor.ts';
import type { CymbalTuning } from '../tuning.ts';
import { ALL_STEPS, type ContextWithDrums, type CymbalHit, type Generator, type Step } from '../types.ts';

/** Where a crash marks a boundary, always on the first step of the 2 bars. */
export const CRASH_PLACES = ['drop', 'dropPhrase', 'intro', 'build'] as const;
export type CrashPlace = (typeof CRASH_PLACES)[number];

/** Quarters, 8ths with the beats accented, or the offbeat 8ths alone. */
export const RIDE_STYLES = ['quarter', 'eighth', 'offbeat'] as const;
export type RideStyle = (typeof RIDE_STYLES)[number];

export interface CymbalLine {
  readonly style: RideStyle;
  readonly hits: readonly CymbalHit[];
}

export type CymbalGenerator = Generator<ContextWithDrums, CymbalLine>;

export function createCymbalGenerator(tuning: CymbalTuning): CymbalGenerator {
  return { generate: (ctx) => cymbalLine(ctx, tuning) };
}

/**
 * The crash lands where the form puts a boundary and the ride plays wherever it may; the scene decides which of them
 * is heard, and the ride is only ever heard in the second drop.
 */
export function cymbalLine(ctx: ContextWithDrums, tuning: CymbalTuning): CymbalLine {
  const style = rideStyle(ctx);
  const place = crashPlace(ctx);
  const crash: CymbalHit[] =
    place === null ? [] : [{ instrument: 'cymbal', step: 0 as Step, part: 'crash', velocity: tuning.crash[place] }];
  // A ride riding on through a fill would bury the fill, and one on the crash would blunt it.
  const fillFrom = ctx.drums.fill?.from ?? ALL_STEPS.length;
  const ride = ALL_STEPS.filter(
    (step) => ridesOn(style, step) && step < fillFrom && !crash.some((hit) => hit.step === step),
  ).map((step): CymbalHit => ({ instrument: 'cymbal', step, part: 'ride', velocity: rideVelocity(style, step, tuning) }));
  return { style, hits: [...crash, ...ride] };
}

/** One style for the whole cycle, so that every 32 bars of the second drop ride the same way. */
export function rideStyle(ctx: Pick<Context, 'seeds'>): RideStyle {
  return RIDE_STYLES[createRng(hash(ctx.seeds.cycle, TAG.rideStyle)).int(RIDE_STYLES.length)] ?? RIDE_STYLES[0];
}

/** Random-free: the place in the scene and the form alone decides, so that a resume can work it out again. */
export function crashPlace(ctx: Context): CrashPlace | null {
  if (!ctx.isSectionStart) return null;
  const role = ctx.sceneRole;
  if (opensDrop(ctx)) return 'drop';
  if (role.scene === 'drop' && role.phrase === 1 && ctx.sectionRole.isPhraseStart) return 'dropPhrase';
  // Where every part of the intro has come in, whatever its order.
  if (role.scene === 'intro' && role.index === role.sections - 1) return 'intro';
  // The first build lies within the cycle's first 32 bars; the other one follows the breakdown, bringing the drums back.
  if (role.scene === 'build' && role.index === 0 && ctx.sectionInCycle >= SECTIONS_PER_PHRASE) return 'build';
  return null;
}

function ridesOn(style: RideStyle, step: Step): boolean {
  switch (style) {
    case 'quarter':
      return step % 4 === 0;
    case 'eighth':
      return step % 2 === 0;
    case 'offbeat':
      return step % 4 === 2;
  }
}

function rideVelocity(style: RideStyle, step: Step, tuning: CymbalTuning) {
  return style === 'eighth' && step % 4 !== 0 ? tuning.ride.soft : tuning.ride.accent;
}
