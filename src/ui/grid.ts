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

/** A cell's line numbers in the CSS grid, counted from 1. */
interface GridArea {
  readonly row: number;
  readonly column: number;
}

const BARS_PER_PAIR = STEPS_PER_PAIR / STEPS_PER_BAR;

/**
 * Where a lane's cell goes on wide screens, all 32 steps in one line, and on narrow ones, one bar under the other
 * with an empty row between them: 32 steps in one line leave cells of a few pixels on a phone.
 */
function cellAreas(lane: number, step: number): Readonly<Record<'wide' | 'narrow', GridArea>> {
  const bar = Math.floor(step / STEPS_PER_BAR);
  return {
    wide: { row: lane + 1, column: step + 2 },
    narrow: { row: bar * (ROWS.length + 1) + lane + 1, column: (step % STEPS_PER_BAR) + 2 },
  };
}

function place(element: HTMLElement, areas: Readonly<Record<'wide' | 'narrow', GridArea>>): void {
  for (const [layout, area] of Object.entries(areas)) {
    element.style.setProperty(`--${layout}-row`, String(area.row));
    element.style.setProperty(`--${layout}-column`, String(area.column));
  }
}

export function createStepGrid(): StepGrid {
  const element = document.createElement('div');
  element.className = 'grid';
  const cells = new Map<string, HTMLElement>();
  const columns: HTMLElement[][] = Array.from({ length: STEPS_PER_PAIR }, () => []);

  ROWS.forEach((row, lane) => {
    for (let bar = 0; bar < BARS_PER_PAIR; bar++) {
      const label = document.createElement('div');
      label.className = 'grid-label';
      // The later bars' labels only show where the bars are folded under one another.
      if (bar > 0) label.classList.add('folded');
      label.textContent = ROW_LABEL[row];
      const first = cellAreas(lane, bar * STEPS_PER_BAR);
      place(label, {
        wide: { row: first.wide.row, column: 1 },
        narrow: { row: first.narrow.row, column: 1 },
      });
      element.append(label);
    }
    for (let step = 0; step < STEPS_PER_PAIR; step++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      if (step % 4 === 0) cell.classList.add('beat');
      if (step === STEPS_PER_BAR) cell.classList.add('bar');
      place(cell, cellAreas(lane, step));
      cells.set(`${row}:${step}`, cell);
      columns[step]!.push(cell);
      element.append(cell);
    }
  });

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
      // Ghosts go first, so that a snare on the same step, should one ever come, shows over them.
      const ordered = [...events].sort((a, b) => Number(isGhost(b)) - Number(isGhost(a)));
      for (const event of ordered) {
        switch (event.instrument) {
          // Every hit looks alike whether pattern, ornament or fill; only its velocity shades it, so ghosts read
          // as the soft snare strokes they are.
          case 'drums':
            paint(ROW_OF[event.part], event.step, 'hit', event.velocity, event.part === 'ghost' ? 'Ghost' : '');
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
