import { describe, expect, it } from 'vitest';
import { hash } from '../src/random/rng.ts';
import {
  barsToNextScene,
  cycleScenes,
  cycleSections,
  drawLayout,
  sceneEnergy,
  type CycleLayout,
  type SceneRole,
  type SectionInCycle,
} from '../src/structure/arrangement.ts';
import { clampUnit } from '../src/units.ts';

const LAYOUT: CycleLayout = { intro: 3, breakdown: 2, firstDrop: 2, secondDrop: 1 };

describe('cycle layout', () => {
  it('lays out intro, build, first drop, breakdown, build and second drop in 8-bar sections', () => {
    const scenes = cycleScenes(LAYOUT, 'start').map((role) => role.scene);
    expect(scenes).toEqual([
      ...['intro', 'intro', 'intro', 'build'],
      ...Array<string>(8).fill('drop'),
      ...['breakdown', 'breakdown', 'build', 'build'],
      ...Array<string>(4).fill('drop'),
    ]);
    expect(cycleSections(LAYOUT)).toBe(scenes.length);
  });

  it('numbers the sections within each scene and the phrases within each drop', () => {
    const scenes = cycleScenes(LAYOUT, 'return');
    expect(scenes[0]).toEqual({ scene: 'intro', entry: 'return', sections: 3, index: 0 });
    expect(scenes[3]).toEqual({ scene: 'build', sections: 1, index: 0 });
    expect(scenes[4]).toEqual({ scene: 'drop', drop: 'first', phrases: 2, phrase: 0 });
    expect(scenes[8]).toEqual({ scene: 'drop', drop: 'first', phrases: 2, phrase: 1 });
    expect(scenes[14]).toEqual({ scene: 'build', sections: 2, index: 0 });
    expect(scenes[15]).toEqual({ scene: 'build', sections: 2, index: 1 });
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

  it('counts the bars to the next scene, treating an extended drop as one scene', () => {
    const scenes = cycleScenes(LAYOUT, 'start');
    const at = (section: number, bar: number) => barsToNextScene(scenes, section as SectionInCycle, bar);
    expect(at(0, 0)).toBe(24);
    expect(at(2, 5)).toBe(3);
    expect(at(4, 0)).toBe(64);
    expect(at(19, 7)).toBe(1);
  });
});

describe('scene energy', () => {
  const full = clampUnit(1);
  const energy = (role: SceneRole, sectionIn32: 0 | 1 | 2 | 3 = 0) => sceneEnergy(role, sectionIn32, full);

  it('rises through a build up to the drop\'s A', () => {
    expect(energy({ scene: 'build', sections: 2, index: 0 })).toBe(0.6);
    expect(energy({ scene: 'build', sections: 2, index: 1 })).toBe(0.75);
    expect(energy({ scene: 'build', sections: 1, index: 0 })).toBe(0.75);
    expect(energy({ scene: 'drop', drop: 'first', phrases: 1, phrase: 0 }, 0)).toBe(0.75);
  });

  it('steps a returning intro down from the drop\'s A, and keeps the opening intro low', () => {
    const intro = (index: 0 | 1 | 2) => energy({ scene: 'intro', entry: 'return', sections: 3, index });
    expect([intro(0), intro(1), intro(2)]).toEqual([0.75, 0.6, 0.5]);
    expect(energy({ scene: 'intro', entry: 'start', sections: 3, index: 0 })).toBe(0.5);
  });

  it('keeps every scene at full energy when the depth is 0', () => {
    for (const role of cycleScenes(LAYOUT, 'return')) expect(sceneEnergy(role, 2, clampUnit(0))).toBe(1);
  });
});
