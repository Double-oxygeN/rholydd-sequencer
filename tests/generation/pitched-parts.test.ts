import { describe, expect, it } from 'vitest';
import { motifCell } from '../../src/generators/drums/pattern.ts';
import { slotOf } from '../../src/generators/drums/weights.ts';
import { stylePlan } from '../../src/generators/line.ts';
import { PAD_HIGHEST, PAD_LOWEST, sectionVoicings } from '../../src/generators/pad/index.ts';
import { STAB_LOWEST, STAB_SPAN } from '../../src/generators/stab/index.ts';
import { HIGHEST_PITCH, LOWEST_PITCH, subPitch } from '../../src/generators/sub/pitch.ts';
import { SUB_STYLES, attackChance } from '../../src/generators/sub/styles.ts';
import { ALL_STEPS, type PitchedEvent, type Step } from '../../src/generators/types.ts';
import { TAG, hash } from '../../src/random/rng.ts';
import { CHORD_TONES, chordClasses, chordToneClass, isBorrowed, tensionClass } from '../../src/structure/chords.ts';
import { chordOf } from '../../src/structure/conductor.ts';
import { MAIN_SKELETONS, TRANSITION_SKELETONS, colorMain, colorTransition } from '../../src/structure/harmony.ts';
import { ALL_KEYS, DEFAULT_KEY, TONIC, degreeOf, parseKey, type PitchClass } from '../../src/structure/key.ts';
import type { HarmonyTuning } from '../../src/structure/tuning.ts';
import { clampUnit } from '../../src/units.ts';
import {
  DEFAULT_LIVE,
  PARAM_SETS,
  SEEDS,
  TUNING,
  liveParams,
  relativeShape,
  run,
  type GeneratedPair,
} from '../support/helpers.ts';

const BARS = 1024;

/** Kick steps of the played base pattern, before any fill takes over. */
function layersKicks(pair: GeneratedPair): number[] {
  return Array.from({ length: 32 }, (_, step) => step).filter(
    (step) => motifCell(pair.layers.base, 'kick', slotOf('kick', step as Step)) !== null,
  );
}

const RANGES: Readonly<Record<PitchedEvent['instrument'], readonly [number, number]>> = {
  sub: [29, 52],
  reese: [41, 52],
  // A tension stacks the stab above the octave from C4.
  stab: [60, 85],
  pad: [53, 76],
};

function pitchesOf(event: PitchedEvent): readonly number[] {
  return 'pitch' in event ? [event.pitch] : event.voicing;
}

const LONG_BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, LONG_BARS, () => params) })));

const classesOf = (pitches: readonly number[]) => [...new Set(pitches.map((p) => p % 12))].sort((a, b) => a - b);

const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

describe('pitched parts: sub pitch', () => {
  it('folds the tonic of every key into F1 to E2 and jumps an octave up on request', () => {
    for (const key of ALL_KEYS) {
      const low = subPitch(key, false);
      expect(low).toBeGreaterThanOrEqual(LOWEST_PITCH);
      expect(low).toBeLessThan(LOWEST_PITCH + 12);
      expect(subPitch(key, true)).toBe(low + 12);
      expect(subPitch(key, true)).toBeLessThanOrEqual(HIGHEST_PITCH);
      expect(degreeOf(key, low)).toBe(TONIC);
    }
    expect(subPitch(parseKey('F')! as PitchClass, false)).toBe(29);
  });
});

describe('pitched parts: sub styles', () => {
  it('always strikes step 0 and never re-strikes a tied step', () => {
    for (const style of SUB_STYLES) {
      expect(attackChance(style, 0 as Step, false)).toBe(1);
    }
    expect(attackChance('push', 16 as Step, true)).toBe(0);
  });

  it('lets long and tresillo ignore the kick while kick-follow plays only on kicks', () => {
    for (const step of ALL_STEPS.slice(1)) {
      expect(attackChance('long', step, true)).toBe(attackChance('long', step, false));
      expect(attackChance('tresillo', step, true)).toBe(attackChance('tresillo', step, false));
      expect(attackChance('kickFollow', step, true)).toBe(1);
      expect(attackChance('kickFollow', step, false)).toBe(0);
    }
  });

  it('picks every style for A and a different one for B', () => {
    const mains = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const plan = stylePlan({ cycle: hash(i), phrase: hash(i, 1) }, TAG.subStyle, SUB_STYLES);
      mains.add(plan.main);
      expect(plan.transition).not.toBe(plan.main);
    }
    expect([...mains].sort()).toEqual([...SUB_STYLES].sort());
  });
});

describe('pitched parts: bass', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));

  const cutFrom = ({ ctx }: GeneratedPair) =>
    ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd ? (ctx.drums.fill?.from ?? 32) : 32;

  it("keeps every note in the natural minor of the cycle's key between F1 and E3, starting each 2 bars between F1 and E2", () => {
    for (const initialKey of ALL_KEYS) {
      for (const { ctx, sub } of run(42, 256, () => DEFAULT_LIVE, initialKey)) {
        for (const note of sub.notes) {
          // Borrowed chords may leave the scale; the bass stays on the chord's own tones.
          if (!isBorrowed(chordOf(ctx))) expect(degreeOf(ctx.key, note.pitch)).toBeDefined();
          expect(note.pitch).toBeGreaterThanOrEqual(29);
          expect(note.pitch).toBeLessThanOrEqual(52);
        }
        if (sub.notes[0] !== undefined) expect(sub.notes[0].pitch).toBeLessThanOrEqual(40);
      }
    }
  });

  it('keeps notes inside the 2 bars and out of the big fill at the end of 32 bars', () => {
    for (const pairs of runs) {
      for (const pair of pairs) {
        for (const note of pair.sub.notes) {
          expect(note.length).toBeGreaterThanOrEqual(1);
          expect(note.step + note.length).toBeLessThanOrEqual(cutFrom(pair));
        }
      }
    }
  });

  it('strikes step 0 unless the big fill cuts it, and follows the kicks without fills in the kick-follow style', () => {
    let kickFollowPairs = 0;
    for (const pairs of runs) {
      for (const pair of pairs) {
        const cut = cutFrom(pair);
        if (cut > 0) expect(pair.sub.notes[0]?.step).toBe(0);
        else expect(pair.sub.notes).toEqual([]);
        if (pair.sub.style !== 'kickFollow') continue;
        kickFollowPairs++;
        const kicks = layersKicks(pair).filter((step) => step < cut);
        expect(pair.sub.notes.map((n) => n.step)).toEqual(kicks);
      }
    }
    expect(kickFollowPairs).toBeGreaterThan(0);
  });

  it('plays the same bass whether or not an 8-bar fill plays, and keeps playing through it', () => {
    let notesInFills = 0;
    for (const seed of SEEDS) {
      const withFills = run(seed, BARS, () => liveParams(0.3, 0.35, 1));
      const without = run(seed, BARS, () => liveParams(0.3, 0.35, 0));
      for (let i = 0; i < withFills.length; i++) {
        const pair = withFills[i]!;
        if (pair.ctx.isSectionEnd && pair.ctx.sectionRole.isPhraseEnd) continue;
        expect(pair.sub).toEqual(without[i]!.sub);
        const from = pair.ctx.drums.fill?.from ?? 32;
        notesInFills += pair.sub.notes.filter((n) => n.step + n.length > from).length;
      }
    }
    expect(notesInFills).toBeGreaterThan(0);
  });

  it('uses a different style in section B than in A of the same 32 bars', () => {
    for (const pairs of runs) {
      for (let i = 0; i + 8 < pairs.length; i += 16) {
        expect(pairs[i + 8]!.ctx.sectionRole.relation).toBe('transition');
        expect(pairs[i + 8]!.sub.style).not.toBe(pairs[i]!.sub.style);
      }
    }
  });

  // The chord changes every 2 bars, so the repeat units match relative to their chords.
  it('repeats the same bass relative to the chord for the three repeat units of each 8 bars', () => {
    for (const pairs of runs) {
      for (let i = 0; i < pairs.length; i += 4) {
        const shape = (pair: GeneratedPair) => relativeShape(pair.ctx, pair.sub.notes);
        expect(shape(pairs[i + 1]!)).toEqual(shape(pairs[i]!));
        expect(shape(pairs[i + 2]!)).toEqual(shape(pairs[i]!));
      }
    }
  });

  it('only transposes the bass when the initial key changes, leaving the drums and the rhythm as they were', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, 512, () => DEFAULT_LIVE, DEFAULT_KEY);
      for (const key of ALL_KEYS) {
        const other = run(seed, 512, () => DEFAULT_LIVE, key);
        for (let i = 0; i < inF.length; i++) {
          expect(other[i]!.events).toEqual(inF[i]!.events);
          const a = inF[i]!.sub.notes;
          const b = other[i]!.sub.notes;
          expect(b.map((n) => [n.step, n.length])).toEqual(a.map((n) => [n.step, n.length]));
          for (let j = 0; j < a.length; j++) {
            expect((((b[j]!.pitch - a[j]!.pitch - (key - DEFAULT_KEY)) % 12) + 12) % 12).toBe(0);
          }
        }
      }
    }
  });
});

describe('pitched parts: on the chords', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));

  const isPhraseEnd = ({ ctx }: GeneratedPair) => ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd;

  const cutFrom = (pair: GeneratedPair) => (isPhraseEnd(pair) ? (pair.ctx.drums.fill?.from ?? 32) : 32);

  // The stab and the pad may sound the chord's tension too.
  it('plays only chord tones and tensions of the 2 bars, each part within its range', () => {
    for (const initialKey of ALL_KEYS) {
      for (const params of PARAM_SETS) {
        for (const pair of run(7, 256, () => params, initialKey)) {
          for (const event of pair.pitched) {
            const [lowest, highest] = RANGES[event.instrument];
            for (const pitch of pitchesOf(event)) {
              expect(chordClasses(pair.ctx.key, chordOf(pair.ctx))).toContain(pitch % 12);
              expect(pitch).toBeGreaterThanOrEqual(lowest);
              expect(pitch).toBeLessThanOrEqual(highest);
            }
          }
        }
      }
    }
  });

  it('starts the sub bass and the reese of every 2 bars on the chord root', () => {
    for (const pair of run(42, BARS)) {
      for (const first of [pair.sub.notes[0], pair.reese.notes[0]]) {
        if (first === undefined) continue;
        expect(first.step).toBe(0);
        expect(first.pitch % 12).toBe(chordToneClass(pair.ctx.key, chordOf(pair.ctx), 'root'));
      }
    }
  });

  it('only transposes every pitched part when the initial key changes, leaving the drums as they were', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, 256, () => DEFAULT_LIVE, DEFAULT_KEY);
      for (const key of ALL_KEYS) {
        const other = run(seed, 256, () => DEFAULT_LIVE, key);
        for (let i = 0; i < inF.length; i++) {
          expect(other[i]!.events).toEqual(inF[i]!.events);
          const a = inF[i]!.pitched;
          const b = other[i]!.pitched;
          expect(b.map((e) => [e.instrument, e.step, e.length])).toEqual(a.map((e) => [e.instrument, e.step, e.length]));
          // Folding into a fixed range reorders the tones of a chord, so the pitch classes compare as sets.
          const classes = (event: PitchedEvent, shift: number) =>
            [...new Set(pitchesOf(event).map((pitch) => (((pitch - shift) % 12) + 12) % 12))].sort();
          a.forEach((event, j) => expect(classes(b[j]!, key - DEFAULT_KEY)).toEqual(classes(event, 0)));
        }
      }
    }
  });

  it('repeats every pitched part relative to the chord for the three repeat units of each 8 bars', () => {
    for (const pairs of runs) {
      for (let i = 0; i < pairs.length; i += 4) {
        const shape = (pair: GeneratedPair) => relativeShape(pair.ctx, pair.pitched);
        expect(shape(pairs[i + 1]!)).toEqual(shape(pairs[i]!));
        expect(shape(pairs[i + 2]!)).toEqual(shape(pairs[i]!));
      }
    }
  });

  it('keeps the sub, the reese and the stabs within the 2 bars and out of the big fill, while the pad plays on', () => {
    let padsInBigFills = 0;
    for (const pairs of runs) {
      for (const pair of pairs) {
        for (const event of [...pair.sub.notes, ...pair.reese.notes, ...pair.stab.hits]) {
          expect(event.length).toBeGreaterThanOrEqual(1);
          expect(event.step + event.length).toBeLessThanOrEqual(cutFrom(pair));
        }
        expect([pair.pad.step, pair.pad.length]).toEqual([0, 32]);
        if (cutFrom(pair) < 32) padsInBigFills++;
      }
    }
    expect(padsInBigFills).toBeGreaterThan(0);
  });

  it('plays the same pitched parts whether or not an 8-bar fill plays', () => {
    for (const seed of SEEDS) {
      const withFills = run(seed, BARS, () => liveParams(0.3, 0.35, 1));
      const without = run(seed, BARS, () => liveParams(0.3, 0.35, 0));
      for (let i = 0; i < withFills.length; i++) {
        if (isPhraseEnd(withFills[i]!)) continue;
        expect(withFills[i]!.pitched).toEqual(without[i]!.pitched);
      }
    }
  });

  it('never plays a stab on beats 2 and 4', () => {
    let stabs = 0;
    for (const pairs of runs) {
      for (const pair of pairs) {
        for (const hit of pair.stab.hits) {
          stabs++;
          expect([4, 12, 20, 28]).not.toContain(hit.step);
        }
      }
    }
    expect(stabs).toBeGreaterThan(0);
  });

  it('uses different reese and stab styles in section B than in A of the same 32 bars', () => {
    for (const pairs of runs) {
      for (let i = 0; i + 8 < pairs.length; i += 16) {
        expect(pairs[i + 8]!.reese.style).not.toBe(pairs[i]!.reese.style);
        expect(pairs[i + 8]!.stab.style).not.toBe(pairs[i]!.stab.style);
      }
    }
  });
});

describe('pitched parts: tensions', () => {
  it('plays only tones and tensions of the coloured chord, and only the natural minor where nothing is borrowed', () => {
    for (const { pairs } of runs) {
      for (const { ctx, pitched } of pairs) {
        const chord = chordOf(ctx);
        const allowed = chordClasses(ctx.key, chord);
        for (const pitch of pitched.flatMap(pitchesOf)) {
          expect(allowed).toContain(pitch % 12);
          if (!isBorrowed(chord)) expect(degreeOf(ctx.key, pitch)).toBeDefined();
        }
      }
    }
  });

  it('never lets the sub bass or the reese sound a tension', () => {
    for (const { pairs } of runs) {
      for (const { ctx, sub, reese } of pairs) {
        const tones = CHORD_TONES.map((tone) => chordToneClass(ctx.key, chordOf(ctx), tone));
        for (const note of [...sub.notes, ...reese.notes]) expect(tones).toContain(note.pitch % 12);
      }
    }
  });

  it('voices a tension in place of the 5th, with no two neighbouring voices a semitone apart', () => {
    let coloured = 0;
    for (const { pairs } of runs) {
      for (const { ctx, stab, pad } of pairs) {
        const chord = chordOf(ctx);
        const tension = tensionClass(ctx.key, chord);
        if (tension === null) continue;
        coloured++;
        const tone = (t: (typeof CHORD_TONES)[number]) => chordToneClass(ctx.key, chord, t);
        expect(classesOf(pad.voicing)).toEqual(sorted([tone('root'), tone('third'), tone('seventh'), tension]));
        for (const hit of stab.hits) {
          expect(classesOf(hit.voicing)).toEqual(sorted([tone('third'), tone('seventh'), tension]));
          expect(hit.voicing[0]).toBeGreaterThanOrEqual(STAB_LOWEST);
          expect(hit.voicing[0]).toBeLessThan(STAB_LOWEST + 12);
          expect(hit.voicing.at(-1)! - hit.voicing[0]).toBeLessThanOrEqual(STAB_SPAN);
        }
        for (const voicing of [pad.voicing, ...stab.hits.map((h) => h.voicing)]) {
          for (let v = 1; v < voicing.length; v++) expect(voicing[v]! - voicing[v - 1]!).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(coloured).toBeGreaterThan(1000);
  });
});

describe('pitched parts: pad voicing', () => {
  // Without tensions, which change the voicing itself, so that only the voice leading is left to check.
  const plain: HarmonyTuning = { ...TUNING.harmony, tensionChance: clampUnit(0), borrowChance: clampUnit(0) };

  it('starts each section in root position and moves the voices as little as the candidates allow', () => {
    for (const key of ALL_KEYS) {
      const progressions = [
        ...MAIN_SKELETONS.map((s) => colorMain(s, hash(1), plain)),
        ...TRANSITION_SKELETONS.map((s) => colorTransition(s, hash(1), plain)),
      ];
      for (const { chords } of progressions) {
        const voicings = sectionVoicings(key, chords);
        expect(voicings[0]![0] % 12).toBe(chordToneClass(key, chords[0], 'root'));
        for (const voicing of voicings) {
          expect(voicing).toHaveLength(4);
          expect([...voicing].sort((a, b) => a - b)).toEqual(voicing);
          expect(voicing[0]).toBeGreaterThanOrEqual(PAD_LOWEST);
          expect(voicing.at(-1)).toBeLessThanOrEqual(PAD_HIGHEST);
        }
        for (let n = 1; n < voicings.length; n++) {
          // Close voicings of seventh chords are at most a few semitones per voice apart once led well.
          const moved = voicings[n]!.reduce((sum, p, v) => sum + Math.abs(p - voicings[n - 1]![v]!), 0);
          // i–iv–VII–III and i–VI–VII–v need up to 9.
          expect(moved).toBeLessThanOrEqual(9);
        }
      }
    }
  });
});
