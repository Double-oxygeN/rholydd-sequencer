import { describe, expect, it } from 'vitest';
import type { FxEvent } from '../../src/generators/fx/index.ts';
import { GAP_START, changesScene, dropLeadIn, leadsIntoDrop } from '../../src/structure/arrangement.ts';
import { PARAM_SETS, SEEDS, run, type GeneratedPair } from '../support/helpers.ts';

const LONG_BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, LONG_BARS, () => params) })));

describe('fx: effects by scene', () => {
  const ofKind = <K extends FxEvent['fx']>(pair: GeneratedPair, kind: K) =>
    pair.fx.filter((event): event is Extract<FxEvent, { fx: K }> => event.fx === kind);

  it('lands an impact on step 0 of every drop that follows a build, and opens the filters as the build ends, and nowhere else', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const { ctx } = pair;
        const follows =
          ctx.sceneRole.scene === 'drop' && ctx.sceneRole.phrase === 0 && ctx.sectionRole.isPhraseStart && ctx.pairIn8 === 0;
        expect(ofKind(pair, 'impact')).toEqual(follows ? [{ fx: 'impact', step: 0 }] : []);
        expect(ofKind(pair, 'filterReset')).toEqual(leadsIntoDrop(ctx) ? [{ fx: 'filterReset' }] : []);
      }
    }
  });

  it('raises the riser and the high-pass without a break through each build, up to the gap or the drop by lead-in', () => {
    for (const { pairs } of runs) {
      let progress: number | undefined;
      for (const pair of pairs) {
        const risers = ofKind(pair, 'riser');
        const highpass = ofKind(pair, 'sweep').filter((s) => s.filter === 'highpass');
        if (pair.ctx.sceneRole.scene !== 'build') {
          expect(risers).toEqual([]);
          expect(highpass).toEqual([]);
          expect(progress).toBeUndefined();
          continue;
        }
        expect(risers).toHaveLength(1);
        const { span } = risers[0]!;
        expect(highpass.map((s) => s.span)).toEqual([span]);
        expect(span.startProgress).toBeCloseTo(progress ?? 0);
        expect(span.endProgress).toBeGreaterThan(span.startProgress);
        progress = span.endProgress;
        const leadIn = dropLeadIn(pair.ctx);
        if (leadIn !== null) {
          const silences = leadIn === 'silence' || leadIn === 'pickup';
          expect([span.to, span.endProgress]).toEqual([silences ? GAP_START : 32, 1]);
          progress = undefined;
        }
      }
    }
  });

  it('opens the low-pass over the intro up to its last 8 bars, and sweeps nothing elsewhere', () => {
    for (const { pairs } of runs) {
      let progress: number | undefined;
      for (const pair of pairs) {
        const lowpass = ofKind(pair, 'sweep').filter((s) => s.filter === 'lowpass');
        const role = pair.ctx.sceneRole;
        if (role.scene !== 'intro' || role.index === role.sections - 1) {
          expect(lowpass).toEqual([]);
          if (progress !== undefined) expect(progress).toBeCloseTo(1);
          progress = undefined;
          continue;
        }
        expect(lowpass).toHaveLength(1);
        expect(lowpass[0]!.span.startProgress).toBeCloseTo(progress ?? 0);
        progress = lowpass[0]!.span.endProgress;
      }
    }
  });

  it('throws the last snare into the reverb before every drop after a build and every breakdown, and nowhere else, keeping the drop\'s last beat dry', () => {
    let throws = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const thrown = ofKind(pair, 'throw');
        const before = leadsIntoDrop(pair.ctx) || (changesScene(pair.ctx) && pair.ctx.nextScene === 'breakdown');
        const snares = pair.heard.filter(
          (event) =>
            event.instrument === 'drums' && event.part === 'snare' && (!leadsIntoDrop(pair.ctx) || event.step < GAP_START),
        );
        if (!before || snares.length === 0) {
          expect(thrown).toEqual([]);
          continue;
        }
        throws++;
        expect(thrown).toEqual([{ fx: 'throw', step: snares.at(-1)!.step }]);
      }
    }
    expect(throws).toBeGreaterThan(100);
  });

  it('opens a gap before every drop after a build unless it goes straight in, cutting the pad unless it is held', () => {
    const expected = { silence: 'cut', pickup: 'cut', padHold: 'held' } as const;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const leadIn = dropLeadIn(pair.ctx);
        const gap = leadIn === null || leadIn === 'straight' ? [] : [{ fx: 'gap', from: GAP_START, pad: expected[leadIn] }];
        expect(ofKind(pair, 'gap')).toEqual(gap);
      }
    }
  });

  it('generates the same effects from the same seed', () => {
    for (const seed of [42, 0xdeadbeef]) {
      expect(run(seed, 4096).map((pair) => pair.fx)).toEqual(run(seed, 4096).map((pair) => pair.fx));
    }
  });
});
