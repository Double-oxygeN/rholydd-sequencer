import { describe, expect, it } from 'vitest';
import { satisfiesConstraints } from '../src/generators/drums/constraints.ts';
import { mutate } from '../src/generators/drums/mutate.ts';
import { motifCell, motifsEqual, patternsEqual } from '../src/generators/drums/pattern.ts';
import { slotsOf } from '../src/generators/drums/weights.ts';
import { PARTS } from '../src/generators/types.ts';
import { toSeed } from '../src/random/rng.ts';
import { simulate } from '../tools/simulate.ts';
import { PARAM_SETS, SEEDS, liveParams, run } from './helpers.ts';

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
