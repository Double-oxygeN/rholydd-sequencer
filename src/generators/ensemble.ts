import type { Seed } from '../random/rng.ts';
import { createConductor, type LiveParams } from '../structure/conductor.ts';
import type { Key } from '../structure/key.ts';
import { arrange } from './arrange.ts';
import { createDrumGenerator, drumOutcome, type PairLayers } from './drums/index.ts';
import { fxEvents, type FxEvent } from './fx/index.ts';
import { createPadGenerator } from './pad/index.ts';
import { createReeseGenerator, type ReeseLine } from './reese/index.ts';
import { createStabGenerator, type StabLine } from './stab/index.ts';
import { createSubGenerator, type SubLine } from './sub/index.ts';
import type { ContextWithDrums, NoteEvent, PadChord } from './types.ts';

/** Fixed for the whole session: changing either needs a new ensemble. */
export interface SessionSettings {
  readonly seed: Seed;
  readonly initialKey: Key;
}

export interface EnsemblePair {
  readonly ctx: ContextWithDrums;
  readonly drumLayers: PairLayers;
  readonly sub: SubLine;
  readonly reese: ReeseLine;
  readonly stab: StabLine;
  readonly pad: PadChord;
  /** What is heard: the parts the scene plays, with what the drop's lead-in leaves of the last beat of a build. */
  readonly events: readonly NoteEvent[];
  readonly fx: readonly FxEvent[];
}

export interface Ensemble {
  /** Every part for the next 2 bars. */
  next(live: LiveParams): EnsemblePair;
}

/**
 * The one place that orders the parts, generating every part whatever the scene before the arrangement picks what
 * is heard, shared by playback and the simulation so they cannot drift apart.
 * The pitched parts never read each other: they agree by playing chord tones of the same chord, so adding or
 * removing one never changes the others.
 */
export function createEnsemble({ seed, initialKey }: SessionSettings): Ensemble {
  const conductor = createConductor(seed, initialKey);
  const drums = createDrumGenerator();
  const sub = createSubGenerator();
  const reese = createReeseGenerator();
  const stab = createStabGenerator();
  const pad = createPadGenerator();
  return {
    next(live) {
      const structure = conductor.next(live);
      const drumLayers = drums.generateLayers(structure);
      const ctx: ContextWithDrums = { ...structure, drums: drumOutcome(drumLayers) };
      const pair = {
        sub: sub.generate(ctx),
        reese: reese.generate(ctx),
        stab: stab.generate(ctx),
        pad: pad.generate(ctx),
      };
      const events = arrange(ctx, { sub: pair.sub.notes, reese: pair.reese.notes, stab: pair.stab.hits, pad: pair.pad });
      return { ctx, drumLayers, ...pair, events, fx: fxEvents(ctx, events) };
    },
  };
}
