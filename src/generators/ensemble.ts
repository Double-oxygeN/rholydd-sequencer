import type { Seed } from '../random/rng.ts';
import { createConductor, type LiveParams } from '../structure/conductor.ts';
import type { Key } from '../structure/key.ts';
import type { GenerationTuning } from './tuning.ts';
import { arrange } from './arrange.ts';
import { createCymbalGenerator, type CymbalLine } from './cymbal/index.ts';
import { createDrumGenerator, drumOutcome, type PairLayers } from './drums/index.ts';
import { fxEvents, type FxEvent } from './fx/index.ts';
import { createPadGenerator } from './pad/index.ts';
import { createReeseGenerator, type ReeseLine } from './reese/index.ts';
import { createStabGenerator, type StabLine } from './stab/index.ts';
import { createSubGenerator, type SubLine } from './sub/index.ts';
import type { ContextWithDrums, NoteEvent, PadChord } from './types.ts';

/** Fixed for the whole session: changing any of them needs a new ensemble. */
export interface SessionSettings {
  readonly seed: Seed;
  readonly initialKey: Key;
  readonly tuning: GenerationTuning;
}

export interface EnsemblePair {
  readonly ctx: ContextWithDrums;
  readonly drumLayers: PairLayers;
  readonly sub: SubLine;
  readonly reese: ReeseLine;
  readonly stab: StabLine;
  readonly pad: PadChord;
  readonly cymbal: CymbalLine;
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
export function createEnsemble({ seed, initialKey, tuning }: SessionSettings): Ensemble {
  const conductor = createConductor({ seed, initialKey, tuning });
  const drums = createDrumGenerator(tuning.fill);
  const sub = createSubGenerator(tuning.lines);
  const reese = createReeseGenerator(tuning.lines);
  const stab = createStabGenerator(tuning.lines);
  const pad = createPadGenerator(tuning.lines);
  const cymbal = createCymbalGenerator(tuning.cymbal);
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
        cymbal: cymbal.generate(ctx),
      };
      const events = arrange(
        ctx,
        { sub: pair.sub.notes, reese: pair.reese.notes, stab: pair.stab.hits, pad: pair.pad, cymbal: pair.cymbal.hits },
        tuning.lines.velocity.pickup,
      );
      return { ctx, drumLayers, ...pair, events, fx: fxEvents(ctx, events) };
    },
  };
}
