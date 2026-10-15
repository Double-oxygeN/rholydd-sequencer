import { STEPS_PER_BAR, STEPS_PER_PAIR, type NoteEvent, type Part, type Pitch, type Step } from '../generators/types.ts';
import { KEY_NAMES } from '../structure/key.ts';

/** Ghosts share the snare's lane: both are snare strokes, and the generators never put the two on one step. */
type Row = Exclude<Part, 'ghost'> | 'sub' | 'reese' | 'stab';

const ROWS: readonly Row[] = ['kick', 'snare', 'hat', 'sub', 'reese', 'stab'];
const ROW_LABEL: Readonly<Record<Row, string>> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hat',
  sub: 'Sub',
  reese: 'Reese',
  stab: 'Stab',
};
const ROW_OF: Readonly<Record<Part, Row>> = { kick: 'kick', snare: 'snare', hat: 'hat', ghost: 'snare' };

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

  const paint = (row: Row, step: number, layer: string, velocity: number, title = '', part = '') => {
    const cell = cells.get(`${row}:${step}`);
    if (cell === undefined) return;
    cell.dataset.layer = layer;
    cell.dataset.part = part;
    cell.style.setProperty('--velocity', String(velocity));
    cell.title = title;
  };

  let highlighted: Step | null = null;
  return {
    element,
    show(events) {
      for (const cell of cells.values()) {
        cell.dataset.layer = '';
        cell.dataset.part = '';
        cell.style.removeProperty('--velocity');
        cell.title = '';
      }
      // Ghosts go first, so that a snare on the same step, should one ever come, shows over them.
      const ordered = [...events].sort((a, b) => Number(isGhost(b)) - Number(isGhost(a)));
      for (const event of ordered) {
        switch (event.instrument) {
          case 'drums':
            paint(ROW_OF[event.part], event.step, event.layer, event.velocity, event.part === 'ghost' ? 'Ghost' : '', event.part);
            break;
          case 'sub':
          case 'reese':
          case 'stab': {
            const name = 'pitch' in event ? noteName(event.pitch) : event.voicing.map(noteName).join(' ');
            paint(event.instrument, event.step, 'note', event.velocity, name);
            for (let i = 1; i < event.length; i++) paint(event.instrument, event.step + i, 'sustain', event.velocity, name);
            break;
          }
          // The pad holds one chord for the whole 2 bars, which the chord name above already shows.
          case 'pad':
            break;
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

function isGhost(event: NoteEvent): boolean {
  return event.instrument === 'drums' && event.part === 'ghost';
}

function noteName(pitch: Pitch): string {
  return `${KEY_NAMES[pitch % 12] ?? ''}${Math.floor(pitch / 12) - 1}`;
}
