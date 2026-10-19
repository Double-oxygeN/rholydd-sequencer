import { STEPS_PER_BAR, STEPS_PER_PAIR, type Step } from '../generators/types.ts';
import { cycleScenes, type CycleLayout } from '../structure/arrangement.ts';
import type { Context } from '../structure/conductor.ts';
import { PAIRS_PER_SECTION } from '../structure/form.ts';
import type { CounterText, Messages } from './messages.ts';

export interface PositionView {
  readonly element: HTMLElement;
  /** The counters and the meters, which stay as they are while paused. */
  readonly counters: HTMLElement;
  show(ctx: Context, step: Step): void;
  clear(): void;
}

/**
 * Bars and cycles played so far, and where playback stands within the cycle and its 8 bars. The meters go no finer
 * than what the sequencer shows: 2 bars, or the one bar playing on narrow screens (style.css picks the meter). The
 * scene colours stand in for scene names.
 */
export function createPositionView(messages: Messages): PositionView {
  const element = document.createElement('div');
  element.className = 'position';
  const cycle = sceneMeter();
  const pairs = sectionMeter(PAIRS_PER_SECTION, 'pair-meter');
  const bars = sectionMeter(PAIRS_PER_SECTION * BARS_PER_PAIR, 'bar-meter');
  // Pictures of the place in the piece: the counters say it in words, so screen readers hear only what each shows.
  picture(cycle.element, messages.cyclePosition);
  picture(pairs.element, messages.sectionPosition);
  picture(bars.element, messages.sectionPosition);
  element.append(cycle.element, pairs.element, bars.element);

  const counters = document.createElement('div');
  counters.className = 'counters';
  const barCount = counter(messages.barCount);
  const cycleCount = counter(messages.cycleCount);
  counters.append(barCount.element, cycleCount.element);

  const clear = () => {
    cycle.clear();
    pairs.set(null);
    bars.set(null);
    // A session that has not started has no place in the piece to count.
    counters.hidden = true;
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
      const barInPair = Math.floor(step / STEPS_PER_BAR);
      pairs.set(ctx.pairIn8);
      bars.set(ctx.pairIn8 * BARS_PER_PAIR + barInPair);
      barCount.set(ctx.bar + barInPair + 1);
      cycleCount.set(ctx.cycle + 1);
      counters.hidden = false;
    },
    clear,
  };
}

function counter(text: (n: number) => CounterText) {
  const element = document.createElement('span');
  element.className = 'counter';
  const before = document.createTextNode('');
  const value = document.createElement('strong');
  const after = document.createTextNode('');
  element.append(before, value, after);
  return {
    element,
    set(n: number) {
      const words = text(n);
      before.data = words.before;
      value.textContent = String(n);
      after.data = words.after;
    },
  };
}

/**
 * What the cycle meter shows before playback: a 128-bar cycle, all of it still to come, so the meter has its shape
 * from the start. The lead-ins do not show on the meter.
 */
const PREVIEW_LAYOUT: CycleLayout = {
  intro: 2,
  breakdown: 2,
  firstDrop: 1,
  secondDrop: 1,
  leadIns: { first: 'silence', second: 'straight' },
};

function picture(element: HTMLElement, label: string): void {
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
}

/** One cell per 8 bars of the cycle, coloured by scene, so that the next drop can be seen coming. */
function sceneMeter() {
  const element = document.createElement('div');
  element.className = 'meter scene-meter';
  let cells: HTMLElement[] = [];
  let shape = '';
  const show = (scenes: readonly string[], current: number) => {
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
  };
  return {
    element,
    show,
    clear() {
      show(
        cycleScenes(PREVIEW_LAYOUT).map((role) => role.scene),
        -1,
      );
    },
  };
}

const BARS_PER_PAIR = STEPS_PER_PAIR / STEPS_PER_BAR;

/** One cell per 2 bars, or per bar, of the 8 bars playing. */
function sectionMeter(length: number, className: string) {
  const element = document.createElement('div');
  element.className = `meter ${className}`;
  element.style.gridTemplateColumns = `repeat(${length}, 1fr)`;
  const cells = Array.from({ length }, () => document.createElement('span'));
  element.append(...cells);
  return {
    element,
    set(current: number | null) {
      cells.forEach((cell, i) => cell.classList.toggle('on', current !== null && i <= current));
    },
  };
}
