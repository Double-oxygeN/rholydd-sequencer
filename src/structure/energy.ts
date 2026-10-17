import { clampUnit, type UnitInterval } from '../units.ts';
import type { SceneRole } from './arrangement.ts';
import type { SectionIn32 } from './form.ts';
import type { EnergyTuning, PhraseCurve } from './tuning.ts';

/** Energy of an 8-bar section. A depth of 0 keeps every section at full energy. */
export function sectionEnergy(sectionIn32: SectionIn32, depth: UnitInterval, curve: PhraseCurve): UnitInterval {
  return clampUnit(1 - depth * (1 - curve[sectionIn32]));
}

/**
 * Energy of an 8-bar section. Builds only rise, topping out at the drop's A so that the drop never starts thinner
 * than the build before it; the tension of a build comes from the riser and the high-pass instead. Drops keep the
 * phrase curve so that their 32 bars still rise and fall as A A' B A''.
 */
export function sceneEnergy(
  role: SceneRole,
  sectionIn32: SectionIn32,
  depth: UnitInterval,
  tuning: EnergyTuning,
): UnitInterval {
  const curve = sceneCurve(role, sectionIn32, tuning);
  return clampUnit(1 - depth * (1 - curve));
}

function sceneCurve(role: SceneRole, sectionIn32: SectionIn32, { phrase, scene }: EnergyTuning): number {
  switch (role.scene) {
    case 'intro':
      return scene.intro;
    case 'build':
      return role.index === role.sections - 1 ? scene.buildLast : scene.buildFirst;
    case 'drop':
      return sectionEnergy(sectionIn32, clampUnit(1), phrase);
    case 'breakdown':
      return scene.breakdown;
  }
}
