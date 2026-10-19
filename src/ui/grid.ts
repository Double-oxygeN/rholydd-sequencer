import { STEPS_PER_BAR, STEPS_PER_PAIR, type Cymbal, type NoteEvent, type Part, type Pitch, type Step } from '../generators/types.ts';
import { KEY_NAMES } from '../structure/key.ts';
import type { Messages } from './messages.ts';

/**
 * Ghosts share the snare's lane: both are snare strokes, and the generators never put the two on one step. The crash
 * and the ride share one lane too, as the ride always leaves the crash's step to it; every lane more shrinks the cells
 * on a narrow screen.
 */
type Row = Exclude<Part, 'ghost'> | 'cymbal' | 'sub' | 'reese' | 'stab';

const ROWS: readonly Row[] = ['kick', 'snare', 'hat', 'cymbal', 'sub', 'reese', 'stab'];
const ROW_LABEL: Readonly<Record<Row, string>> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hat',
  cymbal: 'Cym',
  sub: 'Sub',
  reese: 'Reese',
  stab: 'Stab',
};
const ROW_OF: Readonly<Record<Part, Row>> = { kick: 'kick', snare: 'snare', hat: 'hat', ghost: 'snare' };
const CYMBAL_NAME: Readonly<Record<Cymbal, string>> = { crash: 'Crash', ride: 'Ride' };

export interface StepGrid {
  readonly element: HTMLElement;
  show(events: readonly NoteEvent[]): void;
  highlight(step: Step | null): void;
}

export function createStepGrid(messages: Messages): StepGrid {
  const element = document.createElement('div');
  element.className = 'grid';
  // Read out step by step, the grid would talk over the music it shows.
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', messages.sequencer);
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
      cell.dataset.bar = String(barOf(step));
      cells.set(`${row}:${step}`, cell);
      columns[step]!.push(cell);
      element.append(cell);
    }
  }
  // Narrow screens show only this bar of the two (style.css), the one holding the step that plays or last played.
  element.dataset.bar = '0';

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
          case 'cymbal':
            paint('cymbal', event.step, 'hit', event.velocity, CYMBAL_NAME[event.part]);
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
      element.dataset.bar = String(step === null ? 0 : barOf(step));
    },
  };
}

function barOf(step: number): number {
  return Math.floor(step / STEPS_PER_BAR);
}

function isGhost(event: NoteEvent): boolean {
  return event.instrument === 'drums' && event.part === 'ghost';
}

function noteName(pitch: Pitch): string {
  return `${KEY_NAMES[pitch % 12] ?? ''}${Math.floor(pitch / 12) - 1}`;
}
