import { describe, expect, it } from 'vitest';
import { isStrike, type NoteEvent } from '../../src/generators/types.ts';
import { hash, toSeed } from '../../src/random/rng.ts';
import {
  BORROWED_SYMBOLS,
  CHORDS,
  CHORD_TONES,
  DIATONIC_SYMBOLS,
  chordName,
  chordToneClass,
  isBorrowed,
  tensionClass,
  type ChordSymbol,
  type ColoredChord,
} from '../../src/structure/chords.ts';
import { chordOf } from '../../src/structure/conductor.ts';
import {
  BORROWINGS,
  MAIN_SKELETONS,
  TRANSITION_SKELETONS,
  cycleMainProgression,
  phraseTransitionProgression,
  type MainSkeleton,
  type TransitionSkeleton,
} from '../../src/structure/harmony.ts';
import {
  ALL_KEYS,
  AT_INITIAL_KEY,
  DEFAULT_KEY,
  KEY_NAMES,
  TONIC,
  degreeOf,
  keyAt,
  parseKey,
  shiftDegree,
  stepFifths,
  type FifthsFromInitial,
  type Key,
} from '../../src/structure/key.ts';
import { clampUnit } from '../../src/units.ts';
import { simulate } from '../../tools/simulation/report.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, TUNING, run, type GeneratedPair } from '../support/helpers.ts';

const BARS = 1024;

const LONG_BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, LONG_BARS, () => params) })));

const everyChord = (): readonly ColoredChord[] =>
  (Object.keys(CHORDS) as ChordSymbol[]).flatMap((symbol) =>
    [null, ...CHORDS[symbol].tensions].map((tension) => ({ symbol, tension }) as ColoredChord),
  );

// Semitones from the initial key up to the cycle's key: 0 at home, 7 in the dominant and 5 in the subdominant.
const shiftOf = (pair: GeneratedPair, initialKey: Key) => (((pair.ctx.key - initialKey) % 12) + 12) % 12;

describe('harmony: keys', () => {
  it('parses note names with sharps, flats and enharmonic spellings', () => {
    expect(parseKey('F')).toBe(5);
    expect(parseKey('F#')).toBe(6);
    expect(parseKey('G♭')).toBe(6);
    expect(parseKey('Bb')).toBe(10);
    expect(parseKey('D#')).toBe(3);
    expect(parseKey('H')).toBeUndefined();
    for (const [key, name] of KEY_NAMES.entries()) expect(parseKey(name)).toBe(key);
  });

  it('wraps scale degrees within the octave', () => {
    expect(shiftDegree(TONIC, 7)).toBe(0);
    expect(shiftDegree(shiftDegree(TONIC, 5), 4)).toBe(2);
    expect(shiftDegree(TONIC, -1)).toBe(6);
  });
});

describe('harmony: chords and progressions', () => {
  it('names the diatonic seventh chords of F minor', () => {
    const f = parseKey('F')!;
    expect(DIATONIC_SYMBOLS.map((symbol) => chordName(f, { symbol, tension: null }))).toEqual([
      'Fm7',
      'A♭maj7',
      'B♭m7',
      'Cm7',
      'D♭maj7',
      'E♭7',
    ]);
    expect(chordName(parseKey('C#')!, { symbol: 'VII', tension: null })).toBe('B7');
    expect(chordName(parseKey('E')!, { symbol: 'III', tension: null })).toBe('Gmaj7');
    expect(chordName(parseKey('B')!, { symbol: 'v', tension: null })).toBe('F♯m7');
  });

  it('starts every main progression on i, and no transition progression on i nor ends one on i', () => {
    for (const p of MAIN_SKELETONS) expect(p[0]).toBe('i');
    for (const p of TRANSITION_SKELETONS) {
      expect(p[0]).not.toBe('i');
      expect(p[3]).not.toBe('i');
    }
  });

  it('picks every progression, and changes the main one always at m32 = 1 and never at m32 = 0', () => {
    const mains = new Set<MainSkeleton>();
    const transitions = new Set<TransitionSkeleton>();
    for (let n = 0; n < 500; n++) {
      const first = cycleMainProgression(undefined, hash(n), clampUnit(0), TUNING.harmony);
      mains.add(first.skeleton);
      transitions.add(phraseTransitionProgression(hash(n), TUNING.harmony).skeleton);
      expect(cycleMainProgression(first, hash(n, 1), clampUnit(0), TUNING.harmony)).toBe(first);
      expect(cycleMainProgression(first, hash(n, 1), clampUnit(1), TUNING.harmony).skeleton).not.toBe(first.skeleton);
    }
    expect(mains.size).toBe(MAIN_SKELETONS.length);
    expect(transitions.size).toBe(TRANSITION_SKELETONS.length);
  });
});

describe('harmony: progressions by section', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));

  it('plays a main progression in A, A\' and A\'\' and a transition progression in B, the same across A, A\' and A\'\'', () => {
    for (const pairs of runs) {
      for (let phrase = 0; phrase < pairs.length; phrase += 16) {
        const sections = [0, 4, 8, 12].map((offset) => pairs[phrase + offset]!.ctx.progression);
        expect(MAIN_SKELETONS).toContain(sections[0]!.skeleton);
        expect(TRANSITION_SKELETONS).toContain(sections[2]!.skeleton);
        expect(sections[1]).toBe(sections[0]);
        expect(sections[3]).toBe(sections[0]);
        for (let i = phrase; i < phrase + 16; i++) {
          const { ctx } = pairs[i]!;
          expect(ctx.progression).toBe(sections[Math.floor((i - phrase) / 4)]);
          expect(chordOf(ctx)).toBe(ctx.progression.chords[ctx.pairIn8]);
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
        const symbol = ({ ctx }: GeneratedPair) => ctx.progression.skeleton[ctx.pairIn8];
        run = symbol(pairs[i]!) === symbol(pairs[i - 1]!) ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps the progression in degrees when only the initial key changes', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, 256, () => DEFAULT_LIVE, DEFAULT_KEY);
      for (const key of ALL_KEYS) {
        const other = run(seed, 256, () => DEFAULT_LIVE, key);
        expect(other.map((p) => p.ctx.progression)).toEqual(inF.map((p) => p.ctx.progression));
      }
    }
  });
});

describe('harmony: colouring', () => {
  it('keeps every tension off a semitone above a chord tone, but for the ♭9 of V7, and within the natural minor', () => {
    for (const key of ALL_KEYS) {
      for (const chord of everyChord()) {
        const tension = tensionClass(key, chord);
        if (tension === null) continue;
        expect(degreeOf(key, tension)).toBeDefined();
        if (chord.symbol === 'V7') continue;
        for (const tone of CHORD_TONES) expect((tension - chordToneClass(key, chord, tone) + 12) % 12).not.toBe(1);
      }
    }
  });

  it('borrows only in place of iv and v, from their own candidates', () => {
    for (const { pairs } of runs) {
      for (const { ctx } of pairs) {
        const chord = chordOf(ctx);
        if (!isBorrowed(chord)) {
          expect(chord.symbol).toBe(ctx.progression.skeleton[ctx.pairIn8]);
          continue;
        }
        const base = ctx.progression.skeleton[ctx.pairIn8] as keyof typeof BORROWINGS;
        expect(BORROWINGS[base] as readonly string[]).toContain(chord.symbol);
      }
    }
  });

  it('brings up every borrowed chord and every chord with each of its tensions in 8192 bars', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      for (const { ctx } of run(seed, 8192)) seen.add(JSON.stringify(chordOf(ctx)));
    }
    for (const chord of everyChord()) expect(seen).toContain(JSON.stringify(chord));
    for (const symbol of BORROWED_SYMBOLS) expect([...seen].some((c) => c.includes(`"${symbol}"`))).toBe(true);
  });

  it('colours the main progression only at the start of a cycle, carrying it over with an unchanged skeleton', () => {
    for (const { params, pairs } of runs) {
      const mains = pairs.filter(({ ctx }) => ctx.sectionRole.relation !== 'transition');
      for (let i = 1; i < mains.length; i++) {
        const [before, now] = [mains[i - 1]!.ctx, mains[i]!.ctx];
        const cycleStarts = now.sectionInCycle === 0 && now.isSectionStart;
        if (!cycleStarts || now.progression.skeleton === before.progression.skeleton) {
          expect(now.progression.chords).toEqual(before.progression.chords);
        }
      }
      if (params.m32 === 0) expect(new Set(mains.map(({ ctx }) => ctx.progression)).size).toBe(1);
    }
  });

  it('colours the same way whatever the initial key', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, 512, () => DEFAULT_LIVE, DEFAULT_KEY);
      for (const key of ALL_KEYS) {
        const other = run(seed, 512, () => DEFAULT_LIVE, key);
        expect(other.map(({ ctx }) => ctx.progression)).toEqual(inF.map(({ ctx }) => ctx.progression));
      }
    }
  });

  it('borrows nothing at a borrow chance of 0, and every iv and v at a chance of 1', () => {
    const at = (chance: number) =>
      simulate({
        bars: 2048,
        seed: toSeed(5),
        live: DEFAULT_LIVE,
        tuning: { ...TUNING, harmony: { ...TUNING.harmony, borrowChance: clampUnit(chance) } },
      }).harmony.chords;
    const never = at(0);
    const always = at(1);
    const plain = (chords: Record<string, number>, symbol: string) =>
      Object.entries(chords).filter(([name]) => name === symbol || name.startsWith(`${symbol}(`)).length;
    for (const symbol of ['IV7', '♭IImaj7', 'V7']) expect(plain(never, symbol)).toBe(0);
    for (const symbol of ['iv', 'v']) expect(plain(always, symbol)).toBe(0);
  });
});

describe('harmony: modulation', () => {
  it('names the key a number of fifths round the circle from the initial key', () => {
    const fifths = (n: number) => n as FifthsFromInitial;
    expect(KEY_NAMES[keyAt(DEFAULT_KEY, AT_INITIAL_KEY)]).toBe('F');
    expect(KEY_NAMES[keyAt(DEFAULT_KEY, stepFifths(AT_INITIAL_KEY, 1))]).toBe('C');
    expect(KEY_NAMES[keyAt(DEFAULT_KEY, stepFifths(AT_INITIAL_KEY, -1))]).toBe('B♭');
    expect(KEY_NAMES[keyAt(DEFAULT_KEY, fifths(2))]).toBe('G');
    expect(KEY_NAMES[keyAt(parseKey('B')!, fifths(1))]).toBe('F♯');
    expect(stepFifths(fifths(11), 1)).toBe(0);
    expect(stepFifths(AT_INITIAL_KEY, -1)).toBe(11);
  });

  it("moves the key only at the start of a cycle, one fifth from the previous cycle's key, and never when m32 is 0", () => {
    for (const { params, pairs } of runs) {
      expect(shiftOf(pairs[0]!, DEFAULT_KEY)).toBe(0);
      let moves = 0;
      for (let i = 1; i < pairs.length; i++) {
        const before = pairs[i - 1]!.ctx.key;
        const after = pairs[i]!.ctx.key;
        if (before === after) continue;
        moves++;
        expect(pairs[i]!.ctx.sectionInCycle === 0 && pairs[i]!.ctx.isSectionStart).toBe(true);
        expect([5, 7]).toContain((((after - before) % 12) + 12) % 12);
      }
      if (params.m32 === 0) expect(moves).toBe(0);
    }
  });

  it('moves both ways and reaches keys beyond the neighbours of the initial key over long runs', () => {
    const steps = new Set<number>();
    const shifts = new Set<number>();
    for (const seed of SEEDS) {
      const pairs = run(seed, 8192);
      pairs.forEach((pair, i) => {
        shifts.add(shiftOf(pair, DEFAULT_KEY));
        if (i > 0 && pair.ctx.key !== pairs[i - 1]!.ctx.key) {
          steps.add((((pair.ctx.key - pairs[i - 1]!.ctx.key) % 12) + 12) % 12);
        }
      });
    }
    expect([...steps].sort((a, b) => a - b)).toEqual([5, 7]);
    expect([...shifts].some((shift) => ![0, 5, 7].includes(shift))).toBe(true);
  });

  // Borrowed chords bring their own tones from outside the scale.
  it("plays every pitched note in the natural minor of the cycle's key, apart from borrowed chords", () => {
    let modulated = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        if (shiftOf(pair, DEFAULT_KEY) !== 0) modulated++;
        if (isBorrowed(chordOf(pair.ctx))) continue;
        for (const event of pair.heard) {
          if (isStrike(event)) continue;
          for (const pitch of 'pitch' in event ? [event.pitch] : event.voicing) {
            expect(degreeOf(pair.ctx.key, pitch)).toBeDefined();
          }
        }
      }
    }
    expect(modulated).toBeGreaterThan(0);
  });

  it('moves by the same steps from every initial key, transposing the pitched parts by the difference', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, LONG_BARS);
      for (const initialKey of ALL_KEYS) {
        const other = run(seed, LONG_BARS, () => DEFAULT_LIVE, initialKey);
        other.forEach((pair, i) => {
          expect(shiftOf(pair, initialKey)).toBe(shiftOf(inF[i]!, DEFAULT_KEY));
          // Folding into a fixed range reorders the tones of a chord, so the pitch classes compare as sets.
          const classes = (events: readonly NoteEvent[], shift: number) =>
            events.flatMap((e) =>
              isStrike(e)
                ? []
                : [[...new Set(('pitch' in e ? [e.pitch] : e.voicing).map((p) => (((p - shift) % 12) + 12) % 12))].sort()],
            );
          expect(classes(pair.heard, initialKey - DEFAULT_KEY)).toEqual(classes(inF[i]!.heard, 0));
        });
      }
    }
  });
});
