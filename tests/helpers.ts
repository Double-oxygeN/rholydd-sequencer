import type { LiveParams } from '../src/structure/conductor.ts';
import { clampUnit } from '../src/units.ts';

export function liveParams(m2: number, m8: number, fillIntensity: number): LiveParams {
  return { m2: clampUnit(m2), m8: clampUnit(m8), fillIntensity: clampUnit(fillIntensity) };
}
