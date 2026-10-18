import { peakDbfs, type LevelReport } from '../engine/clip.ts';
import { field } from './dom.ts';
import type { Messages } from './messages.ts';

// The meter's floor; anything quieter shows as empty.
const METER_FLOOR_DB = -48;

export interface LevelMeter {
  readonly element: HTMLElement;
  show(report: LevelReport): void;
  reset(): void;
}

export function createLevelMeter(messages: Messages): LevelMeter {
  const element = document.createElement('div');
  element.className = 'level';
  const bar = document.createElement('div');
  bar.className = 'level-bar';
  const fill = document.createElement('div');
  fill.className = 'level-fill';
  bar.append(fill);
  const peakText = document.createElement('span');
  const clipText = document.createElement('span');
  clipText.className = 'level-clips';
  element.append(field(messages.masterPeak, bar), peakText, clipText);

  let held = 0;
  let clips = 0;
  const render = (current: number) => {
    const db = peakDbfs(current);
    fill.style.width = `${Math.max(0, Math.min(1, 1 - db / METER_FLOOR_DB)) * 100}%`;
    peakText.textContent = messages.heldPeak(peakDbfs(held));
    clipText.textContent = messages.clipCount(clips);
    clipText.classList.toggle('on', clips > 0);
  };
  render(0);
  return {
    element,
    show(report) {
      held = Math.max(held, report.peak);
      clips += report.clips;
      render(report.peak);
    },
    reset() {
      held = 0;
      clips = 0;
      render(0);
    },
  };
}
