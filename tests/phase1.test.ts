import { describe, expect, it } from 'vitest';
import { satisfiesConstraints } from '../src/generators/drums/constraints.ts';
import { mutate } from '../src/generators/drums/mutate.ts';
import { motifCell, motifsEqual, patternsEqual } from '../src/generators/drums/pattern.ts';
import { slotOf, slotsOf } from '../src/generators/drums/weights.ts';
import { PARTS, type Step } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { ALL_KEYS, DEFAULT_KEY, degreeOf } from '../src/structure/key.ts';
import { simulate } from '../tools/simulate.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, liveParams, relativeShape, run, type GeneratedPair } from './helpers.ts';

// Automated acceptance criteria from docs/specs/phase1/requirements.md.

const BARS = 1024;

describe('phase 1 acceptance: 32-bar form', () => {
  it('ends every 32 bars with a 16- or 32-step fill unless the fill intensity is 0', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!(ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd)) continue;
          if (params.fillIntensity === 0) expect(layers.fill).toBeNull();
          else expect([16, 32]).toContain(layers.fill?.length);
        }
      }
    }
  });

  it('changes the reference pattern only at 32-bar boundaries', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        const pairs = run(seed, BARS, () => params);
        let changes = 0;
        for (let i = 1; i < pairs.length; i++) {
          if (!patternsEqual(pairs[i - 1]!.layers.reference, pairs[i]!.layers.reference)) {
            changes++;
            const { ctx } = pairs[i]!;
            expect(ctx.isSectionStart && ctx.sectionRole.isPhraseStart).toBe(true);
          }
        }
        if (params.m32 >= 0.5) expect(changes).toBeGreaterThan(0);
        if (params.m32 === 0) expect(changes).toBe(0);
      }
    }
  });

  it('plays the reference in A and derives A\' and A\'\' from it with a single mutation each', () => {
    for (const seed of SEEDS) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!ctx.isSectionStart) continue;
          switch (ctx.sectionRole.relation) {
            case 'repeat':
              expect(layers.sectionBase).toEqual(layers.reference);
              break;
            case 'variant':
              expect(layers.sectionBase).toEqual(
                mutate(layers.reference, ctx.seeds.section, ctx.params.m8, 'variant'),
              );
              break;
            case 'transition':
              break;
          }
        }
      }
    }
  });

  it('gives every section B a kick different from the reference', () => {
    let transitions = 0;
    for (const seed of [...SEEDS, ...Array.from({ length: 20 }, (_, i) => 1000 + i)]) {
      for (const params of PARAM_SETS) {
        for (const { ctx, layers } of run(seed, BARS, () => params)) {
          if (!ctx.isSectionStart || ctx.sectionRole.relation !== 'transition') continue;
          transitions++;
          expect(motifsEqual(layers.sectionBase, layers.reference, 'kick')).toBe(false);
        }
      }
    }
    expect(transitions).toBeGreaterThan(1000);
  });
});

describe('phase 1 acceptance: energy curve', () => {
  it('keeps the energy constant within each 8 bars', () => {
    for (const seed of SEEDS) {
      const pairs = run(seed, BARS, (i) => liveParams(0.3, 0.35, 0.7, 0.6, (i % 7) / 6));
      for (let i = 0; i < pairs.length; i += 4) {
        const energies = pairs.slice(i, i + 4).map((p) => p.ctx.energy);
        expect(new Set(energies).size).toBe(1);
        const bases = pairs.slice(i, i + 4).map((p) => p.layers.base);
        for (const base of bases) expect(base).toEqual(bases[0]);
      }
    }
  });

  it('thins nothing when the energy depth is 0', () => {
    for (const seed of SEEDS) {
      for (const { ctx, layers } of run(seed, BARS, () => liveParams(1, 1, 1, 1, 0))) {
        expect(ctx.energy).toBe(1);
        expect(layers.base).toEqual(layers.sectionBase);
      }
    }
  });

  it('only removes non-anchor hits and never drops below the minimum count', () => {
    for (const seed of SEEDS) {
      for (const { layers } of run(seed, BARS, () => liveParams(1, 1, 1, 1, 1))) {
        expect(satisfiesConstraints(layers.base)).toBe(true);
        for (const part of PARTS) {
          for (const slot of slotsOf(part)) {
            if (motifCell(layers.base, part, slot) !== null) {
              expect(motifCell(layers.base, part, slot)).toBe(motifCell(layers.sectionBase, part, slot));
            }
          }
        }
      }
    }
  });

  it('makes B the sparsest and A\'\' the densest section at full depth', () => {
    for (const seed of [42, 7]) {
      const { densityBySection } = simulate({ bars: 4096, seed: toSeed(seed), live: liveParams(0.3, 0.35, 0.7, 0.6, 1) });
      const total = (s: 0 | 1 | 2 | 3) => PARTS.reduce((sum, part) => sum + densityBySection[s][part], 0);
      const totals = [total(0), total(1), total(2), total(3)];
      expect(Math.min(...totals)).toBe(total(2));
      expect(Math.max(...totals)).toBe(total(3));
    }
  });
});

describe('phase 1 acceptance: bass', () => {
  const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => run(seed, BARS, () => params)));
  const cutFrom = ({ ctx }: GeneratedPair) =>
    ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd ? (ctx.drums.fill?.from ?? 32) : 32;

  it('keeps every note in the natural minor of the key between F1 and E3, starting each 2 bars between F1 and E2', () => {
    for (const key of ALL_KEYS) {
      for (const { sub } of run(42, 256, () => DEFAULT_LIVE, key)) {
        for (const note of sub.notes) {
          expect(degreeOf(key, note.pitch)).toBeDefined();
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

  // Revised in phase 2: the chord changes every 2 bars, so the repeat units match relative to their chords.
  it('repeats the same bass relative to the chord for the three repeat units of each 8 bars', () => {
    for (const pairs of runs) {
      for (let i = 0; i < pairs.length; i += 4) {
        const shape = (pair: GeneratedPair) => relativeShape(pair.ctx, pair.sub.notes);
        expect(shape(pairs[i + 1]!)).toEqual(shape(pairs[i]!));
        expect(shape(pairs[i + 2]!)).toEqual(shape(pairs[i]!));
      }
    }
  });

  it('only transposes the bass when the key changes, leaving the drums and the rhythm as they were', () => {
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

/** Kick steps of the played base pattern, before any fill takes over. */
function layersKicks(pair: GeneratedPair): number[] {
  return Array.from({ length: 32 }, (_, step) => step).filter(
    (step) => motifCell(pair.layers.base, 'kick', slotOf('kick', step as Step)) !== null,
  );
}
