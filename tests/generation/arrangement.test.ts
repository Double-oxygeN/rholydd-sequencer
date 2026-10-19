import { describe, expect, it } from 'vitest';
import { patternsEqual } from '../../src/generators/drums/pattern.ts';
import { createEnsemble } from '../../src/generators/ensemble.ts';
import type { NoteEvent } from '../../src/generators/types.ts';
import { hash, toSeed } from '../../src/random/rng.ts';
import {
  DROP_LEAD_INS,
  GAP_START,
  INTRO_ORDERS,
  changesScene,
  cycleScenes,
  cycleSections,
  drawIntroOrder,
  drawLayout,
  dropLeadIn,
  type CycleLayout,
  type SceneRole,
} from '../../src/structure/arrangement.ts';
import { sceneEnergy } from '../../src/structure/energy.ts';
import { SECTIONS_PER_PHRASE } from '../../src/structure/form.ts';
import { ALL_KEYS, DEFAULT_KEY } from '../../src/structure/key.ts';
import { plays, playsHit } from '../../src/structure/scene-parts.ts';
import { PAD_TIMBRES, REESE_TIMBRES, STAB_TIMBRES } from '../../src/structure/timbre.ts';
import { clampUnit } from '../../src/units.ts';
import {
  DEFAULT_LIVE,
  PARAM_SETS,
  PICKUP,
  SEEDS,
  TUNING,
  liveParams,
  run,
  type GeneratedPair,
} from '../support/helpers.ts';

const LAYOUT: CycleLayout = {
  intro: 3,
  introOrder: 'hats',
  breakdown: 2,
  firstDrop: 2,
  secondDrop: 1,
  leadIns: { first: 'pickup', second: 'straight' },
};

const LONG_BARS = 2048;

const runs = SEEDS.flatMap((seed) => PARAM_SETS.map((params) => ({ params, pairs: run(seed, LONG_BARS, () => params) })));

const voiceOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.part : event.instrument);

const endOf = (event: NoteEvent) => (event.instrument === 'drums' ? event.step + 1 : event.step + event.length);

// The table of parts per scene in the requirements, written out again so that a mistake in the code's table shows.
const PARTS_BY_SCENE: Readonly<Record<string, readonly string[]>> = {
  intro: ['kick', 'snare', 'hat', 'ghost', 'sub', 'pad'],
  build: ['kick', 'snare', 'hat', 'ghost', 'stab', 'pad'],
  drop: ['kick', 'snare', 'hat', 'ghost', 'sub', 'reese', 'stab', 'pad'],
  breakdown: ['hat', 'stab', 'pad'],
};

/** The 2-bar units of each cycle, in order. */
function cyclesOf(pairs: readonly GeneratedPair[]): GeneratedPair[][] {
  const cycles: GeneratedPair[][] = [];
  for (const pair of pairs) {
    if (pair.ctx.sectionInCycle === 0 && pair.ctx.isSectionStart) cycles.push([]);
    cycles.at(-1)!.push(pair);
  }
  return cycles;
}

function generateBars(seed: number, bars: number): (readonly NoteEvent[])[] {
  const ensemble = createEnsemble({ seed: toSeed(seed), initialKey: DEFAULT_KEY, tuning: TUNING });
  return Array.from({ length: bars / 2 }, () => ensemble.next(DEFAULT_LIVE).events);
}

/** The same note, whether or not the gap before a drop shortened it. */
function sameOnset(a: NoteEvent, b: NoteEvent): boolean {
  if (a.instrument === 'drums' || b.instrument === 'drums') {
    return a.instrument === 'drums' && b.instrument === 'drums' && a.part === b.part && a.step === b.step;
  }
  return a.instrument === b.instrument && a.step === b.step;
}

describe('arrangement: cycle layout', () => {
  it('lays out intro, build, first drop, breakdown, build and second drop in 8-bar sections', () => {
    const scenes = cycleScenes(LAYOUT).map((role) => role.scene);
    expect(scenes).toEqual([
      ...['intro', 'intro', 'intro', 'build'],
      ...Array<string>(8).fill('drop'),
      ...['breakdown', 'breakdown', 'build', 'build'],
      ...Array<string>(4).fill('drop'),
    ]);
    expect(cycleSections(LAYOUT)).toBe(scenes.length);
  });

  it('numbers the sections within each scene and the phrases within each drop', () => {
    const scenes = cycleScenes(LAYOUT);
    expect(scenes[0]).toEqual({ scene: 'intro', introOrder: 'hats', sections: 3, index: 0 });
    expect(scenes[3]).toEqual({ scene: 'build', leadIn: 'pickup', sections: 1, index: 0 });
    expect(scenes[4]).toEqual({ scene: 'drop', drop: 'first', phrases: 2, phrase: 0 });
    expect(scenes[8]).toEqual({ scene: 'drop', drop: 'first', phrases: 2, phrase: 1 });
    expect(scenes[14]).toEqual({ scene: 'build', leadIn: 'straight', sections: 2, index: 0 });
    expect(scenes[15]).toEqual({ scene: 'build', leadIn: 'straight', sections: 2, index: 1 });
    expect(scenes[16]).toEqual({ scene: 'drop', drop: 'second', phrases: 1, phrase: 0 });
  });

  it('draws 128, 160 and 192 bars about equally often, and both lead lengths about half the time', () => {
    const lengths = new Map<number, number>();
    let longIntros = 0;
    let longBreakdowns = 0;
    const draws = 6000;
    for (let n = 0; n < draws; n++) {
      const layout = drawLayout(hash(n), TUNING.layout, 'beat');
      const bars = cycleSections(layout) * 8;
      lengths.set(bars, (lengths.get(bars) ?? 0) + 1);
      if (layout.intro === 3) longIntros++;
      if (layout.breakdown === 3) longBreakdowns++;
    }
    expect([...lengths.keys()].sort()).toEqual([128, 160, 192]);
    for (const count of lengths.values()) expect(count / draws).toBeCloseTo(1 / 3, 1);
    expect(longIntros / draws).toBeCloseTo(0.5, 1);
    expect(longBreakdowns / draws).toBeCloseTo(0.5, 1);
  });

  it('draws every lead-in about equally often for each drop, never the same for both drops of a cycle', () => {
    const counts = { first: new Map<string, number>(), second: new Map<string, number>() };
    const draws = 6000;
    for (let n = 0; n < draws; n++) {
      const { leadIns } = drawLayout(hash(n), TUNING.layout, 'beat');
      expect(leadIns.second).not.toBe(leadIns.first);
      for (const drop of ['first', 'second'] as const) counts[drop].set(leadIns[drop], (counts[drop].get(leadIns[drop]) ?? 0) + 1);
    }
    for (const drop of ['first', 'second'] as const) {
      expect([...counts[drop].keys()].sort()).toEqual([...DROP_LEAD_INS].sort());
      for (const count of counts[drop].values()) expect(count / draws).toBeCloseTo(1 / 4, 1);
    }
  });
});

describe('arrangement: cycles and scenes', () => {
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

describe('arrangement: intro order', () => {
  const draws = 6000;

  it('draws every order about equally often for the first cycle', () => {
    const counts = new Map<string, number>();
    for (let n = 0; n < draws; n++) {
      const order = drawIntroOrder(undefined, hash(n), clampUnit(0));
      counts.set(order, (counts.get(order) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...INTRO_ORDERS].sort());
    for (const count of counts.values()) expect(count / draws).toBeCloseTo(1 / 3, 1);
  });

  it('keeps the previous order when m32 is 0 and always changes it when m32 is 1', () => {
    for (let n = 0; n < draws; n++) {
      for (const previous of INTRO_ORDERS) {
        expect(drawIntroOrder(previous, hash(n), clampUnit(0))).toBe(previous);
        expect(drawIntroOrder(previous, hash(n), clampUnit(1))).not.toBe(previous);
      }
    }
  });

  it('changes the order about m32 of the time, to either of the others', () => {
    const changes = new Map<string, number>();
    for (let n = 0; n < draws; n++) {
      const order = drawIntroOrder('beat', hash(n), clampUnit(0.5));
      if (order !== 'beat') changes.set(order, (changes.get(order) ?? 0) + 1);
    }
    const changed = [...changes.values()].reduce((a, b) => a + b, 0);
    expect(changed / draws).toBeCloseTo(0.5, 1);
    for (const count of changes.values()) expect(count / changed).toBeCloseTo(1 / 2, 1);
  });

  it('gives every 8 bars of an intro the order of its cycle, which changes only under m32', () => {
    for (const { params, pairs } of runs) {
      const cycles = cyclesOf(pairs);
      for (const cycle of cycles) {
        for (const { ctx } of cycle) {
          if (ctx.sceneRole.scene === 'intro') expect(ctx.sceneRole.introOrder).toBe(ctx.layout.introOrder);
        }
      }
      const orders = cycles.map((cycle) => cycle[0]!.ctx.layout.introOrder);
      for (let i = 1; i < orders.length; i++) {
        if (params.m32 === 0) expect(orders[i]).toBe(orders[0]);
        if (params.m32 === 1) expect(orders[i]).not.toBe(orders[i - 1]);
      }
    }
  });

  it('opens with every order over long runs', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) for (const { ctx } of run(seed, 8192)) seen.add(ctx.layout.introOrder);
    expect([...seen].sort()).toEqual([...INTRO_ORDERS].sort());
  });
});

describe('arrangement: lead-ins', () => {
  it('leads into each drop every way over long runs, never the same way into both drops of a cycle', () => {
    const seen = { first: new Set<string>(), second: new Set<string>() };
    for (const seed of SEEDS) {
      for (const { ctx } of run(seed, 8192)) {
        const leadIn = dropLeadIn(ctx);
        if (leadIn === null) continue;
        // The first drop always starts the cycle's second 32 bars.
        const drop = ctx.sectionInCycle < SECTIONS_PER_PHRASE ? 'first' : 'second';
        expect(leadIn).toBe(ctx.layout.leadIns[drop]);
        expect(ctx.layout.leadIns.second).not.toBe(ctx.layout.leadIns.first);
        seen[drop].add(leadIn);
      }
    }
    expect([...seen.first].sort()).toEqual([...DROP_LEAD_INS].sort());
    expect([...seen.second].sort()).toEqual([...DROP_LEAD_INS].sort());
  });
});

describe('arrangement: parts per scene', () => {
  it('opens every intro on kick, snare and hats on the 8ths alone, with the sub coming in after 8 bars', () => {
    const [opening, next] = cycleScenes(LAYOUT);
    const hits = (role: SceneRole, part: 'kick' | 'snare' | 'hat' | 'ghost') =>
      Array.from({ length: 32 }, (_, step) => step).filter((step) => playsHit(role, { part, step }));
    expect(hits(opening!, 'kick')).toHaveLength(32);
    expect(hits(opening!, 'snare')).toHaveLength(32);
    expect(hits(opening!, 'hat')).toEqual(Array.from({ length: 16 }, (_, i) => i * 2));
    expect(hits(opening!, 'ghost')).toEqual([]);
    expect(plays(opening!, 'sub')).toBe(false);
    expect(hits(next!, 'hat')).toHaveLength(32);
    expect(hits(next!, 'ghost')).toHaveLength(32);
    expect(plays(next!, 'sub')).toBe(true);
  });

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

  it('leaves of the last beat before every drop what its lead-in keeps, whatever the fill intensity', () => {
    const gaps = new Map<string, number>();
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        const leadIn = dropLeadIn(pair.ctx);
        if (leadIn === null) continue;
        gaps.set(leadIn, (gaps.get(leadIn) ?? 0) + 1);
        const inGap = pair.heard.filter((event) => endOf(event) > GAP_START);
        expect(pair.heard.some((event) => event.instrument === 'pad')).toBe(true);
        switch (leadIn) {
          case 'silence':
            expect(inGap).toEqual([]);
            break;
          case 'pickup':
            expect(inGap).toEqual([PICKUP]);
            break;
          case 'padHold':
            expect(inGap).toEqual([pair.pad]);
            break;
          case 'straight':
            // Every part of a build is heard to the end, as in any other 2 bars of the build.
            expect(pair.heard).toEqual([...pair.events, ...pair.stab.hits, pair.pad]);
            break;
        }
      }
    }
    expect([...gaps.keys()].sort()).toEqual([...DROP_LEAD_INS].sort());
    for (const count of gaps.values()) expect(count).toBeGreaterThan(20);
  });

  // A scene leaves out the parts it does not play and empties the beat before a drop, adding only the pickup.
  it('plays the composed drum layers followed by the pitched parts, as far as the scene lets them sound', () => {
    expect(generateBars(42, 256)).toEqual(run(42, 256).map((pair) => pair.heard));
    for (const pair of run(42, 1024)) {
      const generated = [...pair.events, ...pair.pitched];
      const sources = pair.heard
        .filter((event) => event !== PICKUP)
        .map((event) => generated.find((g) => sameOnset(g, event)));
      expect(sources).not.toContain(undefined);
      expect(sources).toEqual(generated.filter((event) => sources.includes(event)));
    }
  });
});

describe('arrangement: scene energy', () => {
  const full = clampUnit(1);

  const energy = (role: SceneRole, sectionIn32: 0 | 1 | 2 | 3 = 0) => sceneEnergy(role, sectionIn32, full, TUNING.energy);

  it('rises through a build up to the drop\'s A', () => {
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 2, index: 0 })).toBe(0.6);
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 2, index: 1 })).toBe(0.75);
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 1, index: 0 })).toBe(0.75);
    expect(energy({ scene: 'drop', drop: 'first', phrases: 1, phrase: 0 }, 0)).toBe(0.75);
  });

  it('keeps every intro low', () => {
    for (const index of [0, 1, 2] as const) expect(energy({ scene: 'intro', introOrder: 'beat', sections: 3, index })).toBe(0.5);
  });

  it('keeps every scene at full energy when the depth is 0', () => {
    for (const role of cycleScenes(LAYOUT)) expect(sceneEnergy(role, 2, clampUnit(0), TUNING.energy)).toBe(1);
  });

  it('raises builds up to the drop\'s A, keeps intros low, and flattens everything at depth 0', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 0.5, 1]) {
        const pairs = run(seed, LONG_BARS, () => liveParams(0.3, 0.35, 0.3, 0.6, depth));
        const dropA = sceneEnergy({ scene: 'drop', drop: 'first', phrases: 1, phrase: 0 }, 0, clampUnit(depth), TUNING.energy);
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

describe('arrangement: a theme per cycle', () => {
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

describe('arrangement: sounds per cycle', () => {
  const parts = ['reese', 'stab', 'pad'] as const;

  it('changes the sound of a part only at the start of a cycle, always to another one, and never when m32 is 0', () => {
    for (const { params, pairs } of runs) {
      let changes = 0;
      for (let i = 1; i < pairs.length; i++) {
        for (const part of parts) {
          if (pairs[i]!.ctx.timbre[part] === pairs[i - 1]!.ctx.timbre[part]) continue;
          changes++;
          expect(pairs[i]!.ctx.sectionInCycle === 0 && pairs[i]!.ctx.isSectionStart).toBe(true);
        }
      }
      if (params.m32 === 0) expect(changes).toBe(0);
      else expect(changes).toBeGreaterThan(0);
    }
  });

  it('plays every sound of every table over long runs', () => {
    const heard = { reese: new Set<string>(), stab: new Set<string>(), pad: new Set<string>() };
    for (const seed of SEEDS) {
      for (const { ctx } of run(seed, 8192)) for (const part of parts) heard[part].add(ctx.timbre[part]);
    }
    expect([...heard.reese].sort()).toEqual([...REESE_TIMBRES].sort());
    expect([...heard.stab].sort()).toEqual([...STAB_TIMBRES].sort());
    expect([...heard.pad].sort()).toEqual([...PAD_TIMBRES].sort());
  });

  it('picks the same sounds whatever the initial key', () => {
    for (const seed of SEEDS) {
      const inF = run(seed, LONG_BARS).map(({ ctx }) => ctx.timbre);
      for (const initialKey of ALL_KEYS) {
        expect(run(seed, LONG_BARS, () => DEFAULT_LIVE, initialKey).map(({ ctx }) => ctx.timbre)).toEqual(inF);
      }
    }
  });
});
