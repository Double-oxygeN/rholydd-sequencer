import { clampUnit, type UnitInterval } from '../units.ts';
import type { SectionIn32 } from './form.ts';

/** Low in the transition and highest in the last section, so the big fill leads into the next phrase at full energy. */
const ENERGY_CURVE: Readonly<Record<SectionIn32, number>> = { 0: 0.75, 1: 0.9, 2: 0.5, 3: 1.0 };

/** Energy of an 8-bar section. A depth of 0 keeps every section at full energy. */
export function sectionEnergy(sectionIn32: SectionIn32, depth: UnitInterval): UnitInterval {
  return clampUnit(1 - depth * (1 - ENERGY_CURVE[sectionIn32]));
}
