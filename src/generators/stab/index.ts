import { TAG, createRng, hash } from '../../random/rng.ts';
import { chordOf } from '../../structure/conductor.ts';
import { chordDegrees } from '../../structure/harmony.ts';
import { pitchClassOf } from '../../structure/key.ts';
import { motifSeed, playableEnd, styleOf, stylePlan } from '../line.ts';
import { foldPitch } from '../pitch.ts';
import {
  ALL_STEPS,
  type ContextWithDrums,
  type Generator,
  type Pitch,
  type StabHit,
  type Step,
  type StepLength,
  type Velocity,
  type Voicing,
} from '../types.ts';
import { STAB_STYLES, stabChance, type StabStyle } from './styles.ts';

/** C4. Each chord tone is folded into the octave from here. */
export const STAB_LOWEST = 60 as Pitch;
export const STAB_HIGHEST = (STAB_LOWEST + 11) as Pitch;
export const STAB_LENGTH = 2 as StepLength;
const STAB_VELOCITY = 0.7 as Velocity;

export interface StabLine {
  readonly style: StabStyle;
  readonly hits: readonly StabHit[];
}

export type StabGenerator = Generator<ContextWithDrums, StabLine>;

export function createStabGenerator(): StabGenerator {
  return { generate: stabLine };
}

export function stabLine(ctx: ContextWithDrums): StabLine {
  const style = styleOf(ctx, stylePlan(hash(ctx.seeds.phrase, TAG.stabStyle), STAB_STYLES));
  const rhythm = createRng(motifSeed(ctx, TAG.stabRhythm));
  const rolls = ALL_STEPS.map(() => rhythm.float());
  const end = playableEnd(ctx);
  const voicing = stabVoicing(ctx);

  const starts: Step[] = [];
  for (const step of ALL_STEPS) {
    const last = starts.at(-1);
    const clear = last === undefined || step - last >= STAB_LENGTH;
    if (clear && step + STAB_LENGTH <= end && (rolls[step] ?? 1) < stabChance(style, step, ctx.energy)) starts.push(step);
  }
  const hits = starts.map((step): StabHit => ({ instrument: 'stab', step, length: STAB_LENGTH, voicing, velocity: STAB_VELOCITY }));
  return { style, hits };
}

/** The 3rd, 5th and 7th: the basses already sound the root, and leaving it out keeps the mid range light. */
function stabVoicing(ctx: ContextWithDrums): Voicing {
  const [, ...upper] = chordDegrees(chordOf(ctx));
  const pitches = upper.map((degree) => foldPitch(STAB_LOWEST, pitchClassOf(ctx.key, degree))).sort((a, b) => a - b);
  return pitches as unknown as Voicing;
}
