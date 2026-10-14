import { describe, expect, it } from 'vitest';
import { DROP_LEAD_FILL_KINDS } from '../src/generators/drums/fill.ts';
import type { FxEvent } from '../src/generators/fx/index.ts';
import type { NoteEvent } from '../src/generators/types.ts';
import { GAP_START, changesScene, leadsIntoDrop, plays } from '../src/structure/arrangement.ts';
import { PARAM_SETS, SEEDS, liveParams, run, type GeneratedPair } from './helpers.ts';

// Automated acceptance criteria from docs/specs/phase3/requirements.md.

const BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, BARS, () => params) })));

const voiceOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.part : event.instrument);
const endOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.step + 1 : event.step + event.length);

describe('phase 3 acceptance: parts per scene', () => {
  it('plays only the parts of the scene, apart from the snare roll that ends a breakdown', () => {
    for (const { pairs } of runs) {
      for (const { ctx, heard } of pairs) {
        for (const event of heard) {
          if (plays(ctx.sceneRole, voiceOf(event))) continue;
          expect(ctx.sceneRole.scene).toBe('breakdown');
          expect(changesScene(ctx)).toBe(true);
          expect(event).toMatchObject({ part: 'snare', layer: 'fill' });
        }
      }
    }
  });

  it('leaves out the sub only for the first 8 bars of the intro that starts playback', () => {
    for (const { pairs } of runs) {
      for (const { ctx, heard, sub } of pairs) {
        const heardSub = heard.some((event) => event.instrument === 'sub');
        if (ctx.sceneRole.scene !== 'intro' || sub.notes.length === 0) continue;
        const opening = ctx.sceneRole.entry === 'start' && ctx.sceneRole.index === 0;
        expect(heardSub).toBe(!opening);
      }
    }
  });

  it('empties the last beat before every drop, whatever the fill intensity', () => {
    let gaps = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        if (!leadsIntoDrop(pair.ctx)) continue;
        gaps++;
        for (const event of pair.heard) expect(endOf(event)).toBeLessThanOrEqual(GAP_START);
        expect(pair.heard.some((event) => event.instrument === 'pad')).toBe(true);
      }
    }
    expect(gaps).toBeGreaterThan(100);
  });
});

describe('phase 3 acceptance: fills at scene boundaries', () => {
  it('leads into every drop with a roll, and always fills a scene change unless fills are off', () => {
    for (const { params, pairs } of runs) {
      for (const { ctx, layers } of pairs) {
        if (!changesScene(ctx)) continue;
        if (params.fillIntensity === 0) {
          expect(layers.fill).toBeNull();
          continue;
        }
        expect(layers.fill).not.toBeNull();
        if (leadsIntoDrop(ctx)) expect(DROP_LEAD_FILL_KINDS).toContain(layers.fill!.kind);
        if (ctx.sceneRole.scene === 'breakdown') expect(layers.fill!.kind).toBe('snareRoll');
      }
    }
  });

  it('sounds the snare roll at the end of a breakdown', () => {
    let returns = 0;
    for (const { pairs } of runs.filter(({ params }) => params.fillIntensity > 0)) {
      for (const { ctx, heard } of pairs.filter(isBreakdownEnd)) {
        returns++;
        expect(heard.some((event) => event.instrument === 'drums' && event.part === 'snare')).toBe(true);
      }
    }
    expect(returns).toBeGreaterThan(50);
  });

  it('keeps the fills of sections within a scene to chance', () => {
    const fills = (intensity: number) =>
      run(42, BARS, () => liveParams(0.3, 0.35, intensity)).filter(
        ({ ctx }) => ctx.isSectionEnd && !changesScene(ctx) && !ctx.sectionRole.isPhraseEnd,
      );
    expect(fills(0.3).some(({ layers }) => layers.fill === null)).toBe(true);
    expect(fills(1).every(({ layers }) => layers.fill !== null)).toBe(true);
  });
});

function isBreakdownEnd({ ctx }: GeneratedPair): boolean {
  return ctx.sceneRole.scene === 'breakdown' && changesScene(ctx);
}

describe('phase 3 acceptance: effects', () => {
  const ofKind = <K extends FxEvent['fx']>(pair: GeneratedPair, kind: K) =>
    pair.fx.filter((event): event is Extract<FxEvent, { fx: K }> => event.fx === kind);

  it('lands an impact and opens the filters on step 0 of every drop that follows a build, and nowhere else', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const { ctx } = pair;
        const follows =
          ctx.sceneRole.scene === 'drop' && ctx.sceneRole.phrase === 0 && ctx.sectionRole.isPhraseStart && ctx.pairIn8 === 0;
        expect(ofKind(pair, 'impact')).toEqual(follows ? [{ fx: 'impact', step: 0 }] : []);
        expect(ofKind(pair, 'filterReset')).toEqual(follows ? [{ fx: 'filterReset', step: 0 }] : []);
      }
    }
  });

  it('raises the riser and the high-pass without a break through each build, ending as the silent beat starts', () => {
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
        if (leadsIntoDrop(pair.ctx)) {
          expect([span.to, span.endProgress]).toEqual([GAP_START, 1]);
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

  it('throws the last snare into the reverb before every drop after a build and every breakdown, and nowhere else', () => {
    let throws = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const thrown = ofKind(pair, 'throw');
        const before = leadsIntoDrop(pair.ctx) || (changesScene(pair.ctx) && pair.ctx.nextScene === 'breakdown');
        const snares = pair.heard.filter((event) => event.instrument === 'drums' && event.part === 'snare');
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

  it('opens the silent beat before every drop after a build', () => {
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        expect(ofKind(pair, 'gap')).toEqual(leadsIntoDrop(pair.ctx) ? [{ fx: 'gap', from: GAP_START }] : []);
      }
    }
  });

  it('generates the same effects from the same seed', () => {
    for (const seed of [42, 0xdeadbeef]) {
      expect(run(seed, 4096).map((pair) => pair.fx)).toEqual(run(seed, 4096).map((pair) => pair.fx));
    }
  });
});
