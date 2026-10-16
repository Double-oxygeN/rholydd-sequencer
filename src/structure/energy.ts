import { clampUnit, type UnitInterval } from '../units.ts';
import type { SectionIn32 } from './form.ts';
import type { PhraseCurve } from './tuning.ts';

/** Energy of an 8-bar section. A depth of 0 keeps every section at full energy. */
export function sectionEnergy(sectionIn32: SectionIn32, depth: UnitInterval, curve: PhraseCurve): UnitInterval {
  return clampUnit(1 - depth * (1 - curve[sectionIn32]));
}
