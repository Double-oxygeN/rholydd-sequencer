import { describe, expect, it } from 'vitest';
import { mutate } from '../src/generators/drums/mutate.ts';
import { motifsEqual, patternsEqual } from '../src/generators/drums/pattern.ts';
import { PARAM_SETS, SEEDS, run } from './helpers.ts';

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
              expect(layers.base).toEqual(layers.reference);
              break;
            case 'variant':
              expect(layers.base).toEqual(mutate(layers.reference, ctx.seeds.section, ctx.params.m8, 'variant'));
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
          expect(motifsEqual(layers.base, layers.reference, 'kick')).toBe(false);
        }
      }
    }
    expect(transitions).toBeGreaterThan(1000);
  });
});
