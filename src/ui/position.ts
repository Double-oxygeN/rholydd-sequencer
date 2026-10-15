import { STEPS_PER_BAR, type Step } from '../generators/types.ts';
import { cycleScenes } from '../structure/arrangement.ts';
import type { Context } from '../structure/conductor.ts';
import { PAIRS_PER_SECTION } from '../structure/form.ts';

export interface PositionView {
  readonly element: HTMLElement;
  /** The counters and the meters, which stay as they are while paused. */
  readonly counters: HTMLElement;
  show(ctx: Context, step: Step): void;
  clear(): void;
}

/**
 * Bars and cycles played so far, and where playback stands within the cycle and its 8 bars. The sequencer already
 * shows the 2 bars playing, so the meters go no finer than that, and the scene colours stand in for scene names.
 */
export function createPositionView(): PositionView {
  const element = document.createElement('div');
  element.className = 'position';
  const cycle = sceneMeter();
  const pairs = pairMeter();
  element.append(cycle.element, pairs.element);

  const counters = document.createElement('div');
  counters.className = 'counters';
  const bars = counter('小節');
  const cycles = counter('サイクル');
  counters.append(bars.element, cycles.element);

  const clear = () => {
    cycle.clear();
    pairs.set(null);
    bars.set(null);
    cycles.set(null);
  };
  clear();

  return {
    element,
    counters,
    show(ctx, step) {
      cycle.show(
        cycleScenes(ctx.layout).map((role) => role.scene),
        ctx.sectionInCycle,
      );
      pairs.set(ctx.pairIn8);
      bars.set(ctx.bar + Math.floor(step / STEPS_PER_BAR) + 1);
      cycles.set(ctx.cycle + 1);
    },
    clear,
  };
}

function counter(unit: string) {
  const element = document.createElement('span');
  element.className = 'counter';
  const value = document.createElement('strong');
  element.append(value, unit);
  return {
    element,
    set(n: number | null) {
      value.textContent = n === null ? '–' : String(n);
    },
  };
}

/** One cell per 8 bars of the cycle, coloured by scene, so that the next drop can be seen coming. */
function sceneMeter() {
  const element = document.createElement('div');
  element.className = 'meter scene-meter';
  let cells: HTMLElement[] = [];
  let shape = '';
  return {
    element,
    show(scenes: readonly string[], current: number) {
      // Rebuilt only when a new cycle brings a different layout.
      if (scenes.join() !== shape) {
        shape = scenes.join();
        cells = scenes.map((scene) => {
          const cell = document.createElement('span');
          cell.dataset.scene = scene;
          return cell;
        });
        element.style.gridTemplateColumns = `repeat(${cells.length}, 1fr)`;
        element.replaceChildren(...cells);
      }
      cells.forEach((cell, i) => cell.classList.toggle('on', i <= current));
    },
    clear() {
      shape = '';
      cells = [];
      element.replaceChildren();
    },
  };
}

/** One cell per 2 bars of the 8 bars playing. */
function pairMeter() {
  const element = document.createElement('div');
  element.className = 'meter';
  element.style.gridTemplateColumns = `repeat(${PAIRS_PER_SECTION}, 1fr)`;
  const cells = Array.from({ length: PAIRS_PER_SECTION }, () => document.createElement('span'));
  element.append(...cells);
  return {
    element,
    set(current: number | null) {
      cells.forEach((cell, i) => cell.classList.toggle('on', current !== null && i <= current));
    },
  };
}
