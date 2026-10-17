import { RELEASE_RANGE, clampRelease, type DuckingSettings } from '../params/mixer.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit } from '../units.ts';
import { field, range, row } from './dom.ts';

export interface DuckingControls {
  readonly element: HTMLElement;
  render(settings: DuckingSettings): void;
}

export function createDuckingControls(store: ParamStore): DuckingControls {
  const update = (patch: Partial<DuckingSettings>) => store.update({ ducking: { ...store.get().ducking, ...patch } });
  const depth = range(0, 1, 0.01);
  depth.addEventListener('input', () => update({ depth: clampUnit(Number(depth.value)) }));
  const depthOut = document.createElement('output');
  const release = range(RELEASE_RANGE.min, RELEASE_RANGE.max, 5);
  release.addEventListener('input', () => update({ release: clampRelease(Number(release.value)) }));
  const releaseOut = document.createElement('output');

  const element = document.createElement('div');
  element.className = 'mixer-ducking';
  element.append(field('ダッキング量', row(depth, depthOut)), field('ダッキングの戻り時間', row(release, releaseOut)));
  return {
    element,
    render(settings) {
      depth.value = String(settings.depth);
      depthOut.textContent = `${Math.round(settings.depth * 100)}%`;
      release.value = String(settings.release);
      releaseOut.textContent = `${settings.release} ms`;
    },
  };
}
