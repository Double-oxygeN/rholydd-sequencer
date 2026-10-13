import { BPM_RANGE, clampBpm, randomSeed, type ParamStore, type Params } from '../params/store.ts';
import { parseSeed } from '../random/rng.ts';
import { clampUnit } from '../units.ts';

type UnitKey = 'm2' | 'm8' | 'fillIntensity' | 'volume';

const UNIT_CONTROLS: readonly { key: UnitKey; label: string }[] = [
  { key: 'm2', label: '2bar 変化率' },
  { key: 'm8', label: '8bar 変化率' },
  { key: 'fillIntensity', label: 'フィル強度' },
  { key: 'volume', label: '音量' },
];

export interface Panel {
  readonly element: HTMLElement;
  setPlaying(playing: boolean): void;
  onToggle(handler: () => void): void;
}

export function createPanel(store: ParamStore): Panel {
  const element = document.createElement('form');
  element.className = 'panel';
  element.addEventListener('submit', (e) => e.preventDefault());

  const play = button('再生', 'play');
  const bpm = input({ type: 'number', min: String(BPM_RANGE.min), max: String(BPM_RANGE.max), step: '1' });
  bpm.value = String(store.get().bpm);
  bpm.addEventListener('change', () => {
    const value = clampBpm(Number(bpm.value));
    bpm.value = String(value);
    store.update({ bpm: value });
  });

  const seed = input({ type: 'text', inputMode: 'numeric', spellcheck: false });
  seed.value = String(store.get().seed);
  seed.addEventListener('input', () => {
    const value = parseSeed(seed.value);
    seed.setCustomValidity(value === undefined ? '0〜4294967295 の整数を入力してください' : '');
    if (value !== undefined) store.update({ seed: value });
  });
  const dice = button('ランダム', 'dice');
  dice.type = 'button';
  dice.addEventListener('click', () => {
    const value = randomSeed();
    seed.value = String(value);
    seed.setCustomValidity('');
    store.update({ seed: value });
  });

  element.append(
    play,
    field('BPM', bpm),
    ...UNIT_CONTROLS.map(({ key, label }) => field(label, slider(store, key))),
    field('シード', row(seed, dice)),
  );

  return {
    element,
    setPlaying(playing) {
      play.textContent = playing ? '停止' : '再生';
      play.classList.toggle('playing', playing);
      bpm.disabled = playing;
    },
    onToggle(handler) {
      play.addEventListener('click', handler);
    },
  };
}

function slider(store: ParamStore, key: UnitKey): HTMLElement {
  const range = input({ type: 'range', min: '0', max: '1', step: '0.01' });
  const output = document.createElement('output');
  const render = (params: Params) => {
    range.value = String(params[key]);
    output.textContent = params[key].toFixed(2);
  };
  range.addEventListener('input', () => store.update({ [key]: clampUnit(Number(range.value)) }));
  store.subscribe(render);
  render(store.get());
  return row(range, output);
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const title = document.createElement('span');
  title.className = 'field-label';
  title.textContent = label;
  wrapper.append(title, control);
  return wrapper;
}

function row(...children: HTMLElement[]): HTMLElement {
  const div = document.createElement('div');
  div.className = 'row';
  div.append(...children);
  return div;
}

function button(text: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = text;
  el.className = className;
  return el;
}

type InputProps = Partial<Pick<HTMLInputElement, 'type' | 'min' | 'max' | 'step' | 'inputMode' | 'spellcheck'>>;

function input(props: InputProps): HTMLInputElement {
  const el = document.createElement('input');
  Object.assign(el, props);
  return el;
}
