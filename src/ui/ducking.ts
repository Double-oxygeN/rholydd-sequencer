import { RELEASE_RANGE, clampRelease, type DuckingSettings } from '../params/mixer.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit } from '../units.ts';
import { field, range, row, showValue } from './dom.ts';
import type { Messages } from './messages.ts';

export interface DuckingControls {
  readonly element: HTMLElement;
  render(settings: DuckingSettings): void;
}

export function createDuckingControls(store: ParamStore, messages: Messages): DuckingControls {
  const update = (patch: Partial<DuckingSettings>) => store.update({ ducking: { ...store.get().ducking, ...patch } });
  const depth = range(0, 1, 0.01);
  depth.addEventListener('input', () => update({ depth: clampUnit(Number(depth.value)) }));
  const depthOut = document.createElement('output');
  const release = range(RELEASE_RANGE.min, RELEASE_RANGE.max, 5);
  release.addEventListener('input', () => update({ release: clampRelease(Number(release.value)) }));
  const releaseOut = document.createElement('output');

  const element = document.createElement('div');
  element.className = 'mixer-ducking';
  element.append(
    field(messages.duckingDepth, row(depth, depthOut)),
    field(messages.duckingRelease, row(release, releaseOut)),
  );
  return {
    element,
    render(settings) {
      depth.value = String(settings.depth);
      showValue(depth, depthOut, messages.percent(settings.depth));
      release.value = String(settings.release);
      showValue(release, releaseOut, messages.milliseconds(settings.release));
    },
  };
}
