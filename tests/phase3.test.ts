import { describe, expect, it } from 'vitest';
import { DROP_LEAD_FILL_KINDS } from '../src/generators/drums/fill.ts';
import type { FxEvent } from '../src/generators/fx/index.ts';
import type { NoteEvent } from '../src/generators/types.ts';
import { patternsEqual } from '../src/generators/drums/pattern.ts';
import { createEnsemble } from '../src/generators/ensemble.ts';
import { toSeed } from '../src/random/rng.ts';
import {
  DROP_LEAD_INS,
  GAP_START,
  changesScene,
  cycleScenes,
  cycleSections,
  dropLeadIn,
  leadsIntoDrop,
  sceneEnergy,
} from '../src/structure/arrangement.ts';
import {
  ALL_KEYS,
  AT_INITIAL_KEY,
  DEFAULT_KEY,
  KEY_NAMES,
  degreeOf,
  keyAt,
  parseKey,
  stepFifths,
  type FifthsFromInitial,
  type Key,
} from '../src/structure/key.ts';
import { PAD_TIMBRES, REESE_TIMBRES, STAB_TIMBRES } from '../src/structure/timbre.ts';
import { GATE_REOPEN_SECONDS } from '../src/engine/automation.ts';
import {
  PAD_MAX_RELEASE,
  PAD_PATCHES,
  REESE_PATCHES,
  STAB_MAX_RELEASE,
  STAB_PATCHES,
} from '../src/engine/patches.ts';
import { SECTIONS_PER_PHRASE } from '../src/structure/form.ts';
import { chordOf } from '../src/structure/conductor.ts';
import { isBorrowed } from '../src/structure/harmony.ts';
import { clampUnit } from '../src/units.ts';
import { DEFAULT_LIVE, PARAM_SETS, PICKUP, SEEDS, TUNING, liveParams, run, type GeneratedPair } from './helpers.ts';

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

describe('phase 3 acceptance: lead-ins', () => {
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

describe('phase 3 acceptance: energy by scene', () => {
  it('raises builds up to the drop\'s A, keeps intros low, and flattens everything at depth 0', () => {
    for (const seed of SEEDS) {
      for (const depth of [0, 0.5, 1]) {
        const pairs = run(seed, BARS, () => liveParams(0.3, 0.35, 0.3, 0.6, depth));
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

// Semitones from the initial key up to the cycle's key: 0 at home, 7 in the dominant and 5 in the subdominant.
const shiftOf = (pair: GeneratedPair, initialKey: Key) => (((pair.ctx.key - initialKey) % 12) + 12) % 12;

describe('phase 3 acceptance: modulation', () => {
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

  // Borrowed chords (phase 4) bring their own tones from outside the scale.
  it("plays every pitched note in the natural minor of the cycle's key, apart from borrowed chords", () => {
    let modulated = 0;
    for (const { pairs } of runs) {
      for (const pair of pairs) {
        if (shiftOf(pair, DEFAULT_KEY) !== 0) modulated++;
        if (isBorrowed(chordOf(pair.ctx))) continue;
        for (const event of pair.heard) {
          if (event.instrument === 'drums') continue;
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
      const inF = run(seed, BARS);
      for (const initialKey of ALL_KEYS) {
        const other = run(seed, BARS, () => DEFAULT_LIVE, initialKey);
        other.forEach((pair, i) => {
          expect(shiftOf(pair, initialKey)).toBe(shiftOf(inF[i]!, DEFAULT_KEY));
          // Folding into a fixed range reorders the tones of a chord, so the pitch classes compare as sets.
          const classes = (events: readonly NoteEvent[], shift: number) =>
            events.flatMap((e) =>
              e.instrument === 'drums'
                ? []
                : [[...new Set(('pitch' in e ? [e.pitch] : e.voicing).map((p) => (((p - shift) % 12) + 12) % 12))].sort()],
            );
          expect(classes(pair.heard, initialKey - DEFAULT_KEY)).toEqual(classes(inF[i]!.heard, 0));
        });
      }
    }
  });
});

describe('phase 3 acceptance: sounds per cycle', () => {
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
      const inF = run(seed, BARS).map(({ ctx }) => ctx.timbre);
      for (const initialKey of ALL_KEYS) {
        expect(run(seed, BARS, () => DEFAULT_LIVE, initialKey).map(({ ctx }) => ctx.timbre)).toEqual(inF);
      }
    }
  });

  it('keeps every sound within the envelopes the pad gate and the polyphony were worked out for', () => {
    for (const patch of Object.values(PAD_PATCHES)) {
      expect(patch.envelope.attack).toBeGreaterThanOrEqual(GATE_REOPEN_SECONDS);
      expect(patch.envelope.release).toBeLessThanOrEqual(PAD_MAX_RELEASE);
    }
    for (const patch of Object.values(STAB_PATCHES)) {
      expect(patch.envelope.release).toBeLessThanOrEqual(STAB_MAX_RELEASE);
    }
  });

  it('only ever turns a sound down, and keeps the FM ratios whole so that no part sounds an octave down', () => {
    const patches = [...Object.values(REESE_PATCHES), ...Object.values(STAB_PATCHES), ...Object.values(PAD_PATCHES)];
    for (const patch of patches) {
      expect(patch.gainDb).toBeLessThanOrEqual(0);
      if ('harmonicity' in patch.oscillator) {
        expect(Number.isInteger(patch.oscillator.harmonicity)).toBe(true);
        expect(patch.oscillator.harmonicity).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('phase 3 acceptance: performance', () => {
  it('generates 2 bars, arrangement and effects included, in 5 ms or less on average', () => {
    const ensemble = createEnsemble({ seed: toSeed(42), initialKey: DEFAULT_KEY, tuning: TUNING });
    const pairs = 4096;
    const start = performance.now();
    for (let i = 0; i < pairs; i++) ensemble.next(DEFAULT_LIVE);
    expect((performance.now() - start) / pairs).toBeLessThan(5);
  });
});
