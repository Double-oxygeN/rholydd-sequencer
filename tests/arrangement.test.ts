import { describe, expect, it } from 'vitest';
import { hash } from '../src/random/rng.ts';
import {
  barsToNextScene,
  cycleScenes,
  cycleSections,
  DROP_LEAD_INS,
  drawLayout,
  plays,
  playsHit,
  sceneEnergy,
  type CycleLayout,
  type SceneRole,
  type SectionInCycle,
} from '../src/structure/arrangement.ts';
import { clampUnit } from '../src/units.ts';

const LAYOUT: CycleLayout = {
  intro: 3,
  breakdown: 2,
  firstDrop: 2,
  secondDrop: 1,
  leadIns: { first: 'pickup', second: 'straight' },
};

describe('cycle layout', () => {
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
    expect(scenes[0]).toEqual({ scene: 'intro', sections: 3, index: 0 });
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
      const layout = drawLayout(hash(n));
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
      const { leadIns } = drawLayout(hash(n));
      expect(leadIns.second).not.toBe(leadIns.first);
      for (const drop of ['first', 'second'] as const) counts[drop].set(leadIns[drop], (counts[drop].get(leadIns[drop]) ?? 0) + 1);
    }
    for (const drop of ['first', 'second'] as const) {
      expect([...counts[drop].keys()].sort()).toEqual([...DROP_LEAD_INS].sort());
      for (const count of counts[drop].values()) expect(count / draws).toBeCloseTo(1 / 4, 1);
    }
  });

  it('counts the bars to the next scene, treating an extended drop as one scene', () => {
    const scenes = cycleScenes(LAYOUT);
    const at = (section: number, bar: number) => barsToNextScene(scenes, section as SectionInCycle, bar);
    expect(at(0, 0)).toBe(24);
    expect(at(2, 5)).toBe(3);
    expect(at(4, 0)).toBe(64);
    expect(at(19, 7)).toBe(1);
  });
});

describe('parts per scene', () => {
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
});

describe('scene energy', () => {
  const full = clampUnit(1);
  const energy = (role: SceneRole, sectionIn32: 0 | 1 | 2 | 3 = 0) => sceneEnergy(role, sectionIn32, full);

  it('rises through a build up to the drop\'s A', () => {
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 2, index: 0 })).toBe(0.6);
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 2, index: 1 })).toBe(0.75);
    expect(energy({ scene: 'build', leadIn: 'silence', sections: 1, index: 0 })).toBe(0.75);
    expect(energy({ scene: 'drop', drop: 'first', phrases: 1, phrase: 0 }, 0)).toBe(0.75);
  });

  it('keeps every intro low', () => {
    for (const index of [0, 1, 2] as const) expect(energy({ scene: 'intro', sections: 3, index })).toBe(0.5);
  });

  it('keeps every scene at full energy when the depth is 0', () => {
    for (const role of cycleScenes(LAYOUT)) expect(sceneEnergy(role, 2, clampUnit(0))).toBe(1);
  });
});
