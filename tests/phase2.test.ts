import { describe, expect, it } from 'vitest';
import { PAD_HIGHEST, PAD_LOWEST, sectionVoicings } from '../src/generators/pad/index.ts';
import type { PitchedEvent } from '../src/generators/types.ts';
import { hash } from '../src/random/rng.ts';
import { chordOf } from '../src/structure/conductor.ts';
import {
  MAIN_PROGRESSIONS,
  TRANSITION_PROGRESSIONS,
  chordName,
  isChordTone,
  phraseProgressions,
  type Progression,
} from '../src/structure/harmony.ts';
import { ALL_KEYS, DEFAULT_KEY, degreeOf, parseKey } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, liveParams, relativeShape, run, type GeneratedPair } from './helpers.ts';

// Automated acceptance criteria from docs/specs/phase2/requirements.md.

const BARS = 1024;

describe('harmony', () => {
  it('names the diatonic seventh chords of F minor', () => {
    const f = parseKey('F')!;
    expect([0, 2, 3, 4, 5, 6].map((root) => chordName(f, { root: root as 0 }))).toEqual([
      'Fm7',
      'A♭maj7',
      'B♭m7',
      'Cm7',
      'D♭maj7',
      'E♭7',
    ]);
    expect(chordName(parseKey('C#')!, { root: 6 })).toBe('B7');
    expect(chordName(parseKey('E')!, { root: 2 })).toBe('Gmaj7');
    expect(chordName(parseKey('B')!, { root: 4 })).toBe('F♯m7');
  });

  it('starts every main progression on i, and no transition progression on i nor ends one on i', () => {
    for (const p of MAIN_PROGRESSIONS) expect(p[0].root).toBe(0);
    for (const p of TRANSITION_PROGRESSIONS) {
      expect(p[0].root).not.toBe(0);
      expect(p[3].root).not.toBe(0);
    }
  });

  it('picks every progression, and changes the main one always at m32 = 1 and never at m32 = 0', () => {
    const mains = new Set<Progression>();
    const transitions = new Set<Progression>();
    for (let n = 0; n < 500; n++) {
      const first = phraseProgressions(undefined, hash(n), clampUnit(0));
      mains.add(first.main);
      transitions.add(first.transition);
      expect(phraseProgressions(first.main, hash(n, 1), clampUnit(0)).main).toBe(first.main);
      expect(phraseProgressions(first.main, hash(n, 1), clampUnit(1)).main).not.toBe(first.main);
    }
    expect(mains.size).toBe(MAIN_PROGRESSIONS.length);
    expect(transitions.size).toBe(TRANSITION_PROGRESSIONS.length);
  });
});

describe('phase 2 acceptance: chord progression', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));

  it('plays a main progression in A, A\' and A\'\' and a transition progression in B, the same across A, A\' and A\'\'', () => {
    for (const pairs of runs) {
      for (let phrase = 0; phrase < pairs.length; phrase += 16) {
        const sections = [0, 4, 8, 12].map((offset) => pairs[phrase + offset]!.ctx.progression);
        expect(MAIN_PROGRESSIONS).toContain(sections[0]);
        expect(TRANSITION_PROGRESSIONS).toContain(sections[2]);
        expect(sections[1]).toBe(sections[0]);
        expect(sections[3]).toBe(sections[0]);
        for (let i = phrase; i < phrase + 16; i++) {
          const { ctx } = pairs[i]!;
          expect(ctx.progression).toBe(sections[Math.floor((i - phrase) / 4)]);
          expect(chordOf(ctx)).toBe(ctx.progression[ctx.pairIn8]);
        }
      }
    }
  });

  it('changes the main progression only at 32-bar boundaries, and never when m32 is 0', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const mains = run(seed, BARS, () => params).filter((p) => p.ctx.sectionRole.relation !== 'transition');
        let changes = 0;
        for (let i = 1; i < mains.length; i++) {
          if (mains[i]!.ctx.progression === mains[i - 1]!.ctx.progression) continue;
          changes++;
          expect(mains[i]!.ctx.isSectionStart && mains[i]!.ctx.sectionRole.isPhraseStart).toBe(true);
        }
        if (params.m32 === 0) expect(changes).toBe(0);
        if (params.m32 >= 0.5) expect(changes).toBeGreaterThan(0);
      }
    }
  });

  // Section B ending on i ran into the i of A'' (and into i – i of some main progressions), holding i for 8 bars.
  it('never holds one chord for more than 4 bars, across section boundaries too', () => {
    for (const pairs of runs) {
      let run = 1;
      for (let i = 1; i < pairs.length; i++) {
        run = chordOf(pairs[i]!.ctx).root === chordOf(pairs[i - 1]!.ctx).root ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps the progression in degrees when only the key changes', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, 256, () => DEFAULT_LIVE, DEFAULT_KEY);
      for (const key of ALL_KEYS) {
        const other = run(seed, 256, () => DEFAULT_LIVE, key);
        expect(other.map((p) => p.ctx.progression)).toEqual(inF.map((p) => p.ctx.progression));
      }
    }
  });
});

describe('phase 2 acceptance: parts on the chords', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));
  const isPhraseEnd = ({ ctx }: GeneratedPair) => ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd;
  const cutFrom = (pair: GeneratedPair) => (isPhraseEnd(pair) ? (pair.ctx.drums.fill?.from ?? 32) : 32);

  it('plays only chord tones of the 2 bars, each part within its range', () => {
    for (const key of ALL_KEYS) {
      for (const params of PARAM_SETS) {
        for (const pair of run(7, 256, () => params, key)) {
          for (const event of pair.pitched) {
            const [lowest, highest] = RANGES[event.instrument];
            for (const pitch of pitchesOf(event)) {
              const degree = degreeOf(key, pitch);
              expect(degree).toBeDefined();
              expect(isChordTone(chordOf(pair.ctx), degree!)).toBe(true);
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
        expect(degreeOf(pair.ctx.key, first.pitch)).toBe(chordOf(pair.ctx).root);
      }
    }
  });

  it('only transposes every pitched part when the key changes, leaving the drums as they were', () => {
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

describe('pad voicing', () => {
  it('starts each section in root position and moves the voices as little as the candidates allow', () => {
    for (const key of ALL_KEYS) {
      for (const progression of [...MAIN_PROGRESSIONS, ...TRANSITION_PROGRESSIONS]) {
        const voicings = sectionVoicings(key, progression);
        expect(degreeOf(key, voicings[0]![0])).toBe(progression[0].root);
        for (const voicing of voicings) {
          expect(voicing).toHaveLength(4);
          expect([...voicing].sort((a, b) => a - b)).toEqual(voicing);
          expect(voicing[0]).toBeGreaterThanOrEqual(PAD_LOWEST);
          expect(voicing.at(-1)).toBeLessThanOrEqual(PAD_HIGHEST);
        }
        for (let n = 1; n < voicings.length; n++) {
          // Close voicings of seventh chords are at most a few semitones per voice apart once led well.
          const moved = voicings[n]!.reduce((sum, p, v) => sum + Math.abs(p - voicings[n - 1]![v]!), 0);
          expect(moved).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});

const RANGES: Readonly<Record<PitchedEvent['instrument'], readonly [number, number]>> = {
  sub: [29, 52],
  reese: [41, 52],
  stab: [60, 71],
  pad: [53, 76],
};

function pitchesOf(event: PitchedEvent): readonly number[] {
  return 'pitch' in event ? [event.pitch] : event.voicing;
}
