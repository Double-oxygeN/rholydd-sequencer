import type { PairLayers } from '../src/generators/drums/index.ts';
import { pickupHit } from '../src/generators/arrange.ts';
import { createEnsemble } from '../src/generators/ensemble.ts';
import { DEFAULT_GENERATION_TUNING } from '../src/generators/tuning.ts';
import type { FxEvent } from '../src/generators/fx/index.ts';
import type { ReeseLine } from '../src/generators/reese/index.ts';
import type { StabLine } from '../src/generators/stab/index.ts';
import type { SubLine } from '../src/generators/sub/index.ts';
import type { ContextWithDrums, DrumHit, NoteEvent, PadChord, PitchedEvent } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { toSeed } from '../src/random/rng.ts';
import { chordOf, type LiveParams } from '../src/structure/conductor.ts';
import { CHORD_TONES, chordToneClass } from '../src/structure/harmony.ts';
import { DEFAULT_KEY, type Key } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';

export function liveParams(
  m2: number,
  m8: number,
  fillIntensity: number,
  m32: number = DEFAULT_LIVE_PARAMS.m32,
  energyDepth: number = DEFAULT_LIVE_PARAMS.energyDepth,
): LiveParams {
  return {
    m2: clampUnit(m2),
    m8: clampUnit(m8),
    m32: clampUnit(m32),
    fillIntensity: clampUnit(fillIntensity),
    energyDepth: clampUnit(energyDepth),
  };
}

export const DEFAULT_LIVE = DEFAULT_LIVE_PARAMS;

/** The tuning every test generates with unless it is about the tuning itself. */
export const TUNING = DEFAULT_GENERATION_TUNING;

/** The snare the pickup lead-in adds, at its default velocity. */
export const PICKUP = pickupHit(TUNING.lines.velocity.pickup);

export interface GeneratedPair {
  readonly ctx: ContextWithDrums;
  readonly layers: PairLayers;
  /** Drum hits only: most tests look at one part at a time. */
  readonly events: readonly DrumHit[];
  readonly sub: SubLine;
  readonly reese: ReeseLine;
  readonly stab: StabLine;
  readonly pad: PadChord;
  /** Every pitched event as generated: sub, reese, stab and pad. */
  readonly pitched: readonly PitchedEvent[];
  /** What is heard after the scene picks its parts. */
  readonly heard: readonly NoteEvent[];
  readonly fx: readonly FxEvent[];
}

/** Generates the given number of bars (rounded up to whole 2-bar units) from a fresh ensemble. */
export function run(
  seed: number,
  bars: number,
  live: (pairIndex: number) => LiveParams = () => DEFAULT_LIVE,
  initialKey: Key = DEFAULT_KEY,
): GeneratedPair[] {
  const ensemble = createEnsemble({ seed: toSeed(seed), initialKey, tuning: TUNING });
  return Array.from({ length: Math.ceil(bars / 2) }, (_, i) => {
    const { ctx, drumLayers, sub, reese, stab, pad, events, fx } = ensemble.next(live(i));
    const pitched = [...sub.notes, ...reese.notes, ...stab.hits, pad];
    return { ctx, layers: drumLayers, events: ctx.drums.hits, sub, reese, stab, pad, pitched, heard: events, fx };
  });
}

export function eventsAt(events: readonly DrumHit[], part: DrumHit['part'], step: number): DrumHit[] {
  return events.filter((e) => e.part === part && e.step === step);
}

/** Seeds and parameter sets used across the property-style tests, including the extremes. */
export const SEEDS = [0, 1, 42, 123456789, 0xffffffff];
export const PARAM_SETS: readonly LiveParams[] = [
  DEFAULT_LIVE,
  liveParams(0, 0, 0, 0, 0),
  liveParams(1, 1, 1, 1, 1),
  liveParams(1, 0.5, 1, 0.5, 0.5),
];

/**
 * Position, length and chord tone of each bass note: what repeat units must share. The upper parts compare by
 * position and length only, since a tension in one chord and not the next changes which tones they sound.
 */
export function relativeShape(ctx: ContextWithDrums, events: readonly PitchedEvent[]): unknown[] {
  const chord = chordOf(ctx);
  const toneOf = (pitch: number) => CHORD_TONES.find((tone) => chordToneClass(ctx.key, chord, tone) === pitch % 12) ?? null;
  return events.map((e) => ('pitch' in e ? [e.step, e.length, toneOf(e.pitch)] : [e.step, e.length]));
}
