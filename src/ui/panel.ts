import { Dices } from 'lucide';
import type { PlaybackState } from './controls.ts';
import { field, row, showValue } from './dom.ts';
import { iconButton } from './icons.ts';
import type { Messages } from './messages.ts';
import { createResetButton } from './reset.ts';
import { BPM_RANGE, clampBpm, randomSeed, type ParamStore, type Params } from '../params/store.ts';
import { parseSeed } from '../random/rng.ts';
import type { LiveParams } from '../structure/conductor.ts';
import { KEY_NAMES, toKey } from '../structure/key.ts';
import { clampUnit } from '../units.ts';

const LIVE_PARAMS: readonly (keyof LiveParams)[] = ['m2', 'm8', 'm32', 'fillIntensity', 'energyDepth'];

export interface Panel {
  readonly element: HTMLElement;
  show(state: PlaybackState): void;
}

export function createPanel(store: ParamStore, messages: Messages): Panel {
  const element = document.createElement('form');
  element.className = 'panel';
  element.addEventListener('submit', (e) => e.preventDefault());

  const bpm = input({ type: 'number', min: String(BPM_RANGE.min), max: String(BPM_RANGE.max), step: '1' });
  bpm.value = String(store.get().bpm);
  bpm.addEventListener('change', () => {
    const value = clampBpm(Number(bpm.value));
    bpm.value = String(value);
    store.update({ bpm: value });
  });

  const initialKey = document.createElement('select');
  initialKey.append(...KEY_NAMES.map((name, i) => new Option(messages.minorKey(name), String(i))));
  initialKey.value = String(store.get().initialKey);
  initialKey.addEventListener('change', () => {
    const value = toKey(Number(initialKey.value));
    if (value !== undefined) store.update({ initialKey: value });
  });

  const seed = input({ type: 'text', inputMode: 'numeric', spellcheck: false });
  seed.value = String(store.get().seed);
  seed.addEventListener('input', () => {
    const value = parseSeed(seed.value);
    seed.setCustomValidity(value === undefined ? messages.invalidSeed : '');
    if (value !== undefined) store.update({ seed: value });
  });
  const dice = iconButton(Dices, messages.rollSeed, 'dice');
  dice.addEventListener('click', () => {
    const value = randomSeed();
    seed.value = String(value);
    seed.setCustomValidity('');
    store.update({ seed: value });
  });

  element.append(
    field('BPM', bpm),
    field(messages.initialKey, initialKey),
    ...LIVE_PARAMS.map((key) => field(messages.liveParam[key], slider(store, key, messages))),
    field(messages.seed, row(seed, dice)),
    createResetButton(store, 'live', messages),
  );

  return {
    element,
    // A session fixes its tempo and key until it stops, pausing included.
    show(state) {
      bpm.disabled = state !== 'stopped';
      initialKey.disabled = state !== 'stopped';
    },
  };
}

function slider(store: ParamStore, key: keyof LiveParams, messages: Messages): HTMLElement {
  const range = input({ type: 'range', min: '0', max: '1', step: '0.01' });
  const output = document.createElement('output');
  const render = (params: Params) => {
    range.value = String(params[key]);
    showValue(range, output, messages.percent(params[key]));
  };
  range.addEventListener('input', () => store.update({ [key]: clampUnit(Number(range.value)) }));
  store.subscribe(render);
  render(store.get());
  return row(range, output);
}

type InputProps = Partial<Pick<HTMLInputElement, 'type' | 'min' | 'max' | 'step' | 'inputMode' | 'spellcheck'>>;

function input(props: InputProps): HTMLInputElement {
  const el = document.createElement('input');
  Object.assign(el, props);
  return el;
}
