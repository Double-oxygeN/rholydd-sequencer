import { createRng, pickWeighted, type Seed } from '../../random/rng.ts';
import type { UnitInterval } from '../../units.ts';
import { STEPS_PER_PAIR, stepRange, type DrumHit, type Part, type Step, type Velocity } from '../types.ts';
import { isAnchorStep } from './weights.ts';

/** Fills at the end of 8 bars. */
export const FILL_KINDS = ['snareRoll', 'ghostRush', 'dropout', 'kickSolo', 'snareSolo', 'hatSolo'] as const;
/** Big fills at the end of 32 bars: the solos are left out because they are too sparse to announce a new phrase. */
export const PHRASE_FILL_KINDS = ['snareRoll', 'ghostRush', 'dropout', 'accelRoll', 'dropRoll'] as const;
export const ALL_FILL_KINDS = [...FILL_KINDS, 'accelRoll', 'dropRoll'] as const;
export type FillKind = (typeof ALL_FILL_KINDS)[number];

/**
 * Steps counted back from the end of the 8th bar: 1 beat, 2 beats, the whole 8th bar, or bars 7 and 8.
 * Longer fills are rarer so that they keep their impact.
 */
const LENGTH_CHANCES = [
  [4, 0.4],
  [8, 0.4],
  [16, 0.15],
  [32, 0.05],
] as const;

/** The whole 32nd bar, or bars 31 and 32. */
const PHRASE_LENGTH_CHANCES = [
  [16, 0.6],
  [32, 0.4],
] as const;

export type FillLength = (typeof LENGTH_CHANCES)[number][0];
export const FILL_LENGTHS: readonly FillLength[] = LENGTH_CHANCES.map(([length]) => length);

export interface Fill {
  readonly kind: FillKind;
  readonly length: FillLength;
  /** First step taken over by the fill. */
  readonly start: Step;
  /** Steps taken over by the fill. */
  readonly steps: readonly Step[];
  /** Part that keeps its regular hits inside the fill. Every other part is silenced there. */
  readonly kept: Part | null;
  /** Hits the fill adds on top of the kept part. */
  readonly events: readonly DrumHit[];
}

type Hit = readonly [Part, number];

/** Where a step sits inside the fill: index runs from 0 to length − 1. */
interface FillPosition {
  readonly index: number;
  readonly length: FillLength;
}

/** Grows from just above 0 to 1 over the given range of the fill. */
function progress(index: number, from: number, to: number): number {
  return (index - from + 1) / (to - from);
}

interface Template {
  readonly kept: Part | null;
  hits(step: Step, at: FillPosition): readonly Hit[];
}

const rising = (index: number, from: number, to: number): Hit => ['snare', 0.4 + 0.6 * progress(index, from, to)];

const TEMPLATES: Readonly<Record<FillKind, Template>> = {
  snareRoll: { kept: null, hits: (_, { index, length }) => [rising(index, 0, length)] },
  // A ghost roll alone sounds like a dropout with noise; keeping the backbeat makes it read as a fill.
  ghostRush: {
    kept: 'snare',
    hits: (step, { index, length }) =>
      isAnchorStep('snare', step) ? [] : [['ghost', 0.25 + 0.35 * progress(index, 0, length)]],
  },
  dropout: { kept: null, hits: () => [] },
  kickSolo: { kept: 'kick', hits: () => [] },
  snareSolo: { kept: 'snare', hits: () => [] },
  hatSolo: { kept: 'hat', hits: () => [] },
  accelRoll: {
    kept: null,
    hits: (_, { index, length }) => (index < length / 2 && index % 2 === 1 ? [] : [rising(index, 0, length)]),
  },
  dropRoll: {
    kept: null,
    hits: (_, { index, length }) => (index < length / 2 ? [] : [rising(index, length / 2, length)]),
  },
};

export function fill(seed: Seed, intensity: UnitInterval): Fill | null {
  const rng = createRng(seed);
  // All draws happen before the decision so that changing the intensity only switches the fill on or off.
  const fires = rng.float() < intensity;
  const kind = FILL_KINDS[rng.int(FILL_KINDS.length)] ?? 'snareRoll';
  const length = LENGTH_CHANCES[pickWeighted(rng, LENGTH_CHANCES.map(([, chance]) => chance)) ?? 0]?.[0] ?? 4;
  return fires ? buildFill(kind, length) : null;
}

/** The big fill at the end of 32 bars always plays unless fills are turned off, so the phrase boundary stays audible. */
export function phraseFill(seed: Seed, intensity: UnitInterval): Fill | null {
  const rng = createRng(seed);
  const kind = PHRASE_FILL_KINDS[rng.int(PHRASE_FILL_KINDS.length)] ?? 'snareRoll';
  const length =
    PHRASE_LENGTH_CHANCES[pickWeighted(rng, PHRASE_LENGTH_CHANCES.map(([, chance]) => chance)) ?? 0]?.[0] ?? 16;
  return intensity > 0 ? buildFill(kind, length) : null;
}

function buildFill(kind: FillKind, length: FillLength): Fill {
  const start = (STEPS_PER_PAIR - length) as Step;
  const steps = stepRange(start, STEPS_PER_PAIR);
  const template = TEMPLATES[kind];
  const events = steps.flatMap((step) =>
    template
      .hits(step, { index: step - start, length })
      .map(
        ([part, velocity]): DrumHit => ({ instrument: 'drums', step, part, velocity: velocity as Velocity, layer: 'fill' }),
      ),
  );
  return { kind, length, start, steps, kept: template.kept, events };
}
