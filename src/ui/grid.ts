import { PARTS, STEPS_PER_BAR, STEPS_PER_PAIR, type NoteEvent, type Part, type Pitch, type Step } from '../generators/types.ts';
import { KEY_NAMES } from '../structure/key.ts';

type Row = Part | 'bass';

const ROWS: readonly Row[] = [...PARTS, 'bass'];
const ROW_LABEL: Readonly<Record<Row, string>> = { kick: 'Kick', snare: 'Snare', hat: 'Hat', ghost: 'Ghost', bass: 'Bass' };

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

  for (const row of ROWS) {
    const label = document.createElement('div');
    label.className = 'grid-label';
    label.textContent = ROW_LABEL[row];
    element.append(label);
    for (let step = 0; step < STEPS_PER_PAIR; step++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      if (step % 4 === 0) cell.classList.add('beat');
      if (step === STEPS_PER_BAR) cell.classList.add('bar');
      cells.set(`${row}:${step}`, cell);
      columns[step]!.push(cell);
      element.append(cell);
    }
  }

  const paint = (row: Row, step: number, layer: string, velocity: number, title = '') => {
    const cell = cells.get(`${row}:${step}`);
    if (cell === undefined) return;
    cell.dataset.layer = layer;
    cell.style.setProperty('--velocity', String(velocity));
    cell.title = title;
  };

  let highlighted: Step | null = null;
  return {
    element,
    show(events) {
      for (const cell of cells.values()) {
        cell.dataset.layer = '';
        cell.style.removeProperty('--velocity');
        cell.title = '';
      }
      for (const event of events) {
        switch (event.instrument) {
          case 'drums':
            paint(event.part, event.step, event.layer, event.velocity);
            break;
          case 'bass': {
            const name = noteName(event.pitch);
            paint('bass', event.step, 'bass', event.velocity, name);
            for (let i = 1; i < event.length; i++) paint('bass', event.step + i, 'sustain', event.velocity, name);
            break;
          }
        }
      }
    },
    highlight(step) {
      if (highlighted !== null) for (const cell of columns[highlighted] ?? []) cell.classList.remove('now');
      highlighted = step;
      if (step !== null) for (const cell of columns[step] ?? []) cell.classList.add('now');
    },
  };
}

function noteName(pitch: Pitch): string {
  return `${KEY_NAMES[pitch % 12] ?? ''}${Math.floor(pitch / 12) - 1}`;
}
