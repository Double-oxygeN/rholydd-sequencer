import { describe, expect, it } from 'vitest';
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
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, liveParams, run, type GeneratedPair } from './helpers.ts';

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

  it('starts every main progression on i and no transition progression on i', () => {
    for (const p of MAIN_PROGRESSIONS) expect(p[0].root).toBe(0);
    for (const p of TRANSITION_PROGRESSIONS) expect(p[0].root).not.toBe(0);
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
  it('plays only chord tones of the 2 bars in the sub bass', () => {
    for (const key of ALL_KEYS) {
      for (const params of PARAM_SETS) {
        for (const pair of run(7, 512, () => params, key)) {
          for (const pitch of pitchesOf(pair)) {
            const degree = degreeOf(key, pitch);
            expect(degree).toBeDefined();
            expect(isChordTone(chordOf(pair.ctx), degree!)).toBe(true);
          }
        }
      }
    }
  });

  it('starts the sub bass of every 2 bars on the chord root', () => {
    for (const pair of run(42, BARS, () => liveParams(0.3, 0.35, 0.7))) {
      const first = pair.sub.notes[0];
      if (first === undefined) continue;
      expect(degreeOf(pair.ctx.key, first.pitch)).toBe(chordOf(pair.ctx).root);
    }
  });

});

function pitchesOf(pair: GeneratedPair): number[] {
  return pair.sub.notes.map((n) => n.pitch);
}
