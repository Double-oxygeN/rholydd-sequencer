import { describe, expect, it } from 'vitest';
import { DROP_LEAD_FILL_KINDS } from '../src/generators/drums/fill.ts';
import type { FxEvent } from '../src/generators/fx/index.ts';
import type { NoteEvent } from '../src/generators/types.ts';
import { patternsEqual } from '../src/generators/drums/pattern.ts';
import { createEnsemble } from '../src/generators/ensemble.ts';
import { toSeed } from '../src/random/rng.ts';
import {
  GAP_START,
  changesScene,
  cycleScenes,
  cycleSections,
  leadsIntoDrop,
  sceneEnergy,
} from '../src/structure/arrangement.ts';
import { DEFAULT_KEY } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';
import { DEFAULT_LIVE, PARAM_SETS, SEEDS, liveParams, run, type GeneratedPair } from './helpers.ts';

// Automated acceptance criteria from docs/specs/phase3/requirements.md.

const BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, BARS, () => params) })));

const voiceOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.part : event.instrument);
const endOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.step + 1 : event.step + event.length);

// The table of parts per scene in the requirements, written out again so that a mistake in the code's table shows.
const PARTS_BY_SCENE: Readonly<Record<string, readonly string[]>> = {
  intro: ['kick', 'snare', 'hat', 'ghost', 'sub', 'pad'],
  build: ['kick', 'snare', 'hat', 'ghost', 'stab', 'pad'],
  drop: ['kick', 'snare', 'hat', 'ghost', 'sub', 'reese', 'stab', 'pad'],
  breakdown: ['hat', 'stab', 'pad'],
};

describe('phase 3 acceptance: parts per scene', () => {
  it('plays only the parts of the scene, apart from the snare roll that ends a breakdown', () => {
    for (const { pairs } of runs) {
      for (const { ctx, heard } of pairs) {
        for (const event of heard) {
          if (PARTS_BY_SCENE[ctx.sceneRole.scene]!.includes(voiceOf(event))) continue;
          expect(ctx.sceneRole.scene).toBe('breakdown');
          expect(changesScene(ctx)).toBe(true);
          expect(event).toMatchObject({ part: 'snare', layer: 'fill' });
        }
      }
    }
  });

  it('plays every part of each scene somewhere in a long run', () => {
    const heardIn = new Map<string, Set<string>>();
    for (const { pairs } of runs) {
      for (const { ctx, heard } of pairs) {
        const voices = heardIn.get(ctx.sceneRole.scene) ?? new Set<string>();
        for (const event of heard) voices.add(voiceOf(event));
        heardIn.set(ctx.sceneRole.scene, voices);
      }
    }
    for (const [scene, parts] of Object.entries(PARTS_BY_SCENE)) {
      for (const part of parts) expect(heardIn.get(scene)?.has(part), `${part} in ${scene}`).toBe(true);
    }
  });

  it('opens every intro without the sub and ghosts and with the hat on the 8ths, for 8 bars only', () => {
    let openings = 0;
    for (const { pairs } of runs) {
      for (const { ctx, heard, sub } of pairs) {
        if (ctx.sceneRole.scene !== 'intro') continue;
        const opening = ctx.sceneRole.index === 0;
        if (opening) openings++;
        if (sub.notes.length > 0) expect(heard.some((event) => event.instrument === 'sub')).toBe(!opening);
        const drums = heard.filter((event) => event.instrument === 'drums');
        if (!opening) continue;
        expect(drums.filter((hit) => hit.part === 'ghost')).toEqual([]);
        expect(drums.filter((hit) => hit.part === 'hat' && hit.step % 2 === 1)).toEqual([]);
      }
    }
    // Every cycle opens this way, not just the first.
    expect(openings).toBeGreaterThan(runs.length * 4 * 2);
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

/** The 2-bar units of each cycle, in order. */
function cyclesOf(pairs: readonly GeneratedPair[]): GeneratedPair[][] {
  const cycles: GeneratedPair[][] = [];
  for (const pair of pairs) {
    if (pair.ctx.sectionInCycle === 0 && pair.ctx.isSectionStart) cycles.push([]);
    cycles.at(-1)!.push(pair);
  }
  return cycles;
}

describe('phase 3 acceptance: cycles and scenes', () => {
  it('runs every cycle for 128, 160 or 192 bars through the scenes its layout lays out', () => {
    for (const { pairs } of runs) {
      const cycles = cyclesOf(pairs);
      cycles.forEach((cycle, n) => {
        const { layout } = cycle[0]!.ctx;
        const expected = cycleScenes(layout);
        const sections = cycle.filter(({ ctx }) => ctx.isSectionStart);
        expect(sections.map(({ ctx }) => ctx.sceneRole)).toEqual(expected.slice(0, sections.length));
        expect([128, 160, 192]).toContain(cycleSections(layout) * 8);
        if (n < cycles.length - 1) expect(cycle.length * 2).toBe(cycleSections(layout) * 8);
        expect(cycle[0]!.ctx.sectionRole.isPhraseStart).toBe(true);
      });
    }
  });

  it('starts every drop on a 32-bar boundary right after a build', () => {
    for (const { pairs } of runs) {
      for (let i = 1; i < pairs.length; i++) {
        const [before, now] = [pairs[i - 1]!.ctx, pairs[i]!.ctx];
        if (now.sceneRole.scene === 'drop' && before.sceneRole.scene !== 'drop') {
          expect(now.sectionRole.isPhraseStart && now.isSectionStart).toBe(true);
          expect(before.sceneRole.scene).toBe('build');
        }
        if (before.sceneRole.scene === 'build' && now.sceneRole.scene !== 'build') expect(now.sceneRole.scene).toBe('drop');
      }
    }
  });

  it('draws every intro and breakdown length and every drop extension over long runs', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const { ctx } of run(seed, 8192)) {
        const { intro, breakdown, firstDrop, secondDrop } = ctx.layout;
        seen.add(`lead ${intro}/${breakdown}`);
        seen.add(`drop ${firstDrop}/${secondDrop}`);
      }
    }
    expect([...seen].sort()).toEqual(
      ['lead 2/2', 'lead 2/3', 'lead 3/2', 'lead 3/3', 'drop 1/1', 'drop 1/2', 'drop 2/1', 'drop 2/2'].sort(),
    );
  });
});

describe('phase 3 acceptance: energy by scene', () => {
  it('raises builds up to the drop\'s A, keeps intros low, and flattens everything at depth 0', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 0.5, 1]) {
        const pairs = run(seed, BARS, () => liveParams(0.3, 0.35, 0.3, 0.6, depth));
        const dropA = sceneEnergy({ scene: 'drop', drop: 'first', phrases: 1, phrase: 0 }, 0, clampUnit(depth));
        for (let i = 1; i < pairs.length; i++) {
          const [before, now] = [pairs[i - 1]!.ctx, pairs[i]!.ctx];
          if (depth === 0) expect(now.energy).toBe(1);
          if (now.sceneRole.scene === 'intro') expect(now.energy).toBe(1 - depth * 0.5);
          if (now.sceneRole.scene === 'build') expect(now.energy).toBeLessThanOrEqual(dropA);
          if (!now.isSectionStart || before.sceneRole.scene !== now.sceneRole.scene) continue;
          if (now.sceneRole.scene === 'build') expect(now.energy).toBeGreaterThanOrEqual(before.energy);
        }
      }
    }
  });
});

describe('phase 3 acceptance: a theme per cycle', () => {
  it('changes the main progression only at the start of a cycle, and never when m32 is 0', () => {
    for (const { params, pairs } of runs) {
      const mains = pairs.filter(({ ctx }) => ctx.sectionRole.relation !== 'transition');
      let changes = 0;
      for (let i = 1; i < mains.length; i++) {
        if (mains[i]!.ctx.progression === mains[i - 1]!.ctx.progression) continue;
        changes++;
        expect(mains[i]!.ctx.sectionInCycle === 0 && mains[i]!.ctx.isSectionStart).toBe(true);
      }
      if (params.m32 === 0) expect(changes).toBe(0);
    }
  });

  it('brings back the same progression, reese, stabs and pad in A, A\' and A\'\' of every drop of a cycle', () => {
    let compared = 0;
    for (const { pairs } of runs) {
      for (const cycle of cyclesOf(pairs)) {
        const drops = cycle.filter(({ ctx }) => ctx.sceneRole.scene === 'drop');
        const byPlace = new Map<string, GeneratedPair[]>();
        for (const pair of drops) {
          const { ctx } = pair;
          // B changes with every phrase, and the big fill's length cuts the parts at a different step each time.
          if (ctx.sectionRole.relation === 'transition' || (ctx.isSectionEnd && ctx.sectionRole.isPhraseEnd)) continue;
          const place = `${ctx.sectionRole.sectionIn32}:${ctx.pairIn8}`;
          byPlace.set(place, [...(byPlace.get(place) ?? []), pair]);
        }
        for (const same of byPlace.values()) {
          for (const pair of same.slice(1)) {
            compared++;
            expect(pair.ctx.progression).toBe(same[0]!.ctx.progression);
            expect(pair.reese).toEqual(same[0]!.reese);
            expect(pair.stab).toEqual(same[0]!.stab);
            expect(pair.pad).toEqual(same[0]!.pad);
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('gives section B pitched styles that differ from the cycle\'s A', () => {
    for (const { pairs } of runs) {
      for (const cycle of cyclesOf(pairs)) {
        const a = cycle[0]!;
        for (const b of cycle.filter(({ ctx }) => ctx.sectionRole.relation === 'transition')) {
          expect(b.sub.style).not.toBe(a.sub.style);
          expect(b.reese.style).not.toBe(a.reese.style);
          expect(b.stab.style).not.toBe(a.stab.style);
        }
      }
    }
  });

  it('gives the drums a new groove only at the start of a cycle and of every drop phrase but the first', () => {
    for (const { params, pairs } of runs) {
      let changes = 0;
      for (let i = 1; i < pairs.length; i++) {
        if (patternsEqual(pairs[i - 1]!.layers.reference, pairs[i]!.layers.reference)) continue;
        changes++;
        const { ctx } = pairs[i]!;
        expect(ctx.isSectionStart && ctx.sectionRole.isPhraseStart).toBe(true);
        const role = ctx.sceneRole;
        expect(role.scene === 'intro' || (role.scene === 'drop' && !(role.drop === 'first' && role.phrase === 0))).toBe(true);
      }
      if (params.m32 === 0) expect(changes).toBe(0);
      if (params.m32 >= 0.5) expect(changes).toBeGreaterThan(0);
    }
  });
});

describe('phase 3 acceptance: performance', () => {
  it('generates 2 bars, arrangement and effects included, in 5 ms or less on average', () => {
    const ensemble = createEnsemble({ seed: toSeed(42), key: DEFAULT_KEY });
    const pairs = 4096;
    const start = performance.now();
    for (let i = 0; i < pairs; i++) ensemble.next(DEFAULT_LIVE);
    expect((performance.now() - start) / pairs).toBeLessThan(5);
  });
});
