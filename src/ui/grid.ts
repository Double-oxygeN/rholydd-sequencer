import { PARTS, STEPS_PER_PAIR, STEPS_PER_BAR, type NoteEvent, type Part, type Step } from '../generators/types.ts';

const PART_LABEL: Readonly<Record<Part, string>> = { kick: 'Kick', snare: 'Snare', hat: 'Hat', ghost: 'Ghost' };

export interface StepGrid {
  readonly element: HTMLElement;
  show(events: readonly NoteEvent[]): void;
  highlight(step: Step | null): void;
}

export function createStepGrid(): StepGrid {
  const element = document.createElement('div');
  element.className = 'grid';
  const cells = new Map<string, HTMLElement>();
  const columns: HTMLElement[][] = Array.from({ length: STEPS_PER_PAIR }, () => []);

  for (const part of PARTS) {
    const label = document.createElement('div');
    label.className = 'grid-label';
    label.textContent = PART_LABEL[part];
    element.append(label);
    for (let step = 0; step < STEPS_PER_PAIR; step++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      if (step % 4 === 0) cell.classList.add('beat');
      if (step === STEPS_PER_BAR) cell.classList.add('bar');
      cells.set(`${part}:${step}`, cell);
      columns[step]!.push(cell);
      element.append(cell);
    }
  }

  let highlighted: Step | null = null;
  return {
    element,
    show(events) {
      for (const cell of cells.values()) {
        cell.dataset.layer = '';
        cell.style.removeProperty('--velocity');
      }
      for (const { part, step, velocity, layer } of events) {
        const cell = cells.get(`${part}:${step}`);
        if (cell === undefined) continue;
        cell.dataset.layer = layer;
        cell.style.setProperty('--velocity', String(velocity));
      }
    },
    highlight(step) {
      if (highlighted !== null) for (const cell of columns[highlighted] ?? []) cell.classList.remove('now');
      highlighted = step;
      if (step !== null) for (const cell of columns[step] ?? []) cell.classList.add('now');
    },
  };
}
