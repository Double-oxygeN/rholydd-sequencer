import type { Seed } from '../random/rng.ts';
import { createConductor, type LiveParams } from '../structure/conductor.ts';
import type { Key } from '../structure/key.ts';
import { createDrumGenerator, drumOutcome, type PairLayers } from './drums/index.ts';
import { createSubGenerator, type SubLine } from './sub/index.ts';
import type { ContextWithDrums, NoteEvent } from './types.ts';

/** Fixed for the whole session: changing either needs a new ensemble. */
export interface SessionSettings {
  readonly seed: Seed;
  readonly key: Key;
}

export interface EnsemblePair {
  readonly ctx: ContextWithDrums;
  readonly drumLayers: PairLayers;
  readonly sub: SubLine;
  readonly events: readonly NoteEvent[];
}

export interface Ensemble {
  /** Every part for the next 2 bars. */
  next(live: LiveParams): EnsemblePair;
}

/** The one place that orders the parts, shared by playback and the simulation so they cannot drift apart. */
export function createEnsemble({ seed, key }: SessionSettings): Ensemble {
  const conductor = createConductor(seed, key);
  const drums = createDrumGenerator();
  const sub = createSubGenerator();
  return {
    next(live) {
      const structure = conductor.next(live);
      const drumLayers = drums.generateLayers(structure);
      const ctx: ContextWithDrums = { ...structure, drums: drumOutcome(drumLayers) };
      const subLine = sub.generate(ctx);
      return { ctx, drumLayers, sub: subLine, events: [...ctx.drums.hits, ...subLine.notes] };
    },
  };
}
