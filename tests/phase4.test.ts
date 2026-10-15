import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAB_LOWEST, STAB_SPAN } from '../src/generators/stab/index.ts';
import { CHANNEL_IDS, DEFAULT_MIXER, SOLOABLE_IDS, audibleChannels, type MixerSettings } from '../src/params/mixer.ts';
import type { PitchedEvent } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { chordOf } from '../src/structure/conductor.ts';
import {
  BORROWED_SYMBOLS,
  BORROWINGS,
  CHORDS,
  CHORD_TONES,
  chordClasses,
  chordToneClass,
  isBorrowed,
  tensionClass,
  type ChordSymbol,
  type ColoredChord,
} from '../src/structure/harmony.ts';
import { ALL_KEYS, DEFAULT_KEY, degreeOf } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';
import { simulate } from '../tools/simulate.ts';
import { FINGERPRINT_RUNS, unpitchedFingerprint } from './fingerprint.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, TUNING, liveParams, run, type GeneratedPair } from './helpers.ts';

// Automated acceptance criteria from docs/specs/phase4/requirements.md.

const PHASE3_UNPITCHED: readonly string[] = JSON.parse(
  readFileSync(new URL('./fixtures/phase3-unpitched.json', import.meta.url), 'utf8'),
);

const BARS = 2048;
const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, BARS, () => params) })));

const pitchesOf = (event: PitchedEvent): readonly number[] => ('pitch' in event ? [event.pitch] : event.voicing);
const classesOf = (pitches: readonly number[]) => [...new Set(pitches.map((p) => p % 12))].sort((a, b) => a - b);
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
const everyChord = (): readonly ColoredChord[] =>
  (Object.keys(CHORDS) as ChordSymbol[]).flatMap((symbol) =>
    [null, ...CHORDS[symbol].tensions].map((tension) => ({ symbol, tension }) as ColoredChord),
  );

describe('phase 4 acceptance', () => {
  it('keeps the drums, layouts, keys, sounds and effects of phase 3 for the same seed', () => {
    FINGERPRINT_RUNS.forEach(({ seed, live }, i) => {
      expect(unpitchedFingerprint(seed, live)).toBe(PHASE3_UNPITCHED[i]);
    });
  });
});

describe('phase 4 acceptance: harmony', () => {
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

describe('phase 4 acceptance: the sequencer', () => {
  it('never puts a snare and a ghost on the same step of what is heard', () => {
    const overlap = (pair: GeneratedPair) =>
      pair.heard.some(
        (e) =>
          e.instrument === 'drums' &&
          e.part === 'snare' &&
          pair.heard.some((g) => g.instrument === 'drums' && g.part === 'ghost' && g.step === e.step),
      );
    for (const seed of [1, 2, 3, 4]) {
      for (const fill of [0, 0.3, 1]) {
        expect(run(seed, 8192, () => liveParams(0.3, 0.35, fill)).some(overlap)).toBe(false);
      }
    }
  });
});

describe('phase 4 acceptance: solo', () => {
  const withFlags = (soloed: readonly string[], muted: readonly string[] = []): MixerSettings =>
    Object.fromEntries(
      CHANNEL_IDS.map((id) => {
        const channel = DEFAULT_MIXER[id];
        const flags = { muted: muted.includes(id), ...('soloed' in channel ? { soloed: soloed.includes(id) } : {}) };
        return [id, { ...channel, ...flags }];
      }),
    ) as unknown as MixerSettings;

  it('plays every unmuted channel when nothing is soloed', () => {
    expect(Object.values(audibleChannels(withFlags([])))).toEqual(CHANNEL_IDS.map(() => true));
    expect(audibleChannels(withFlags([], ['kick', 'reverbReturn']))).toMatchObject({ kick: false, reverbReturn: false, snare: true });
  });

  it('plays only the soloed channels and the reverb return once any is soloed, adding solos together', () => {
    const audible = audibleChannels(withFlags(['snare', 'pad']));
    for (const id of SOLOABLE_IDS) expect(audible[id]).toBe(id === 'snare' || id === 'pad');
    expect(audible.reverbReturn).toBe(true);
  });

  it('lets a mute win over a solo, on the reverb return too', () => {
    expect(audibleChannels(withFlags(['snare'], ['snare'])).snare).toBe(false);
    expect(audibleChannels(withFlags(['snare'], ['reverbReturn'])).reverbReturn).toBe(false);
  });
});
