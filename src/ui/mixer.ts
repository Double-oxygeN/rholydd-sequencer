import {
  CHANNEL_IDS,
  LEVEL_RANGE,
  RELEASE_RANGE,
  clampLevel,
  clampRelease,
  clampPan,
  isSending,
  type ChannelId,
  type Decibels,
  type DuckingSettings,
  type MixerSettings,
  type Pan,
} from '../params/mixer.ts';
import { peakDbfs, type LevelReport } from '../engine/clip.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit, type UnitInterval } from '../units.ts';

const CHANNEL_LABEL: Readonly<Record<ChannelId, string>> = {
  kick: 'キック',
  snare: 'スネア',
  hat: 'ハイハット',
  ghost: 'ゴースト',
  sub: 'サブベース',
  reese: 'リースベース',
  stab: 'スタブ',
  pad: 'パッド',
  reverbReturn: 'リバーブ',
};

export interface MixerView {
  readonly element: HTMLElement;
  showLevel(report: LevelReport): void;
  /** Clears the held peak and the clip count, for a new session. */
  resetLevel(): void;
}

export function createMixerView(store: ParamStore): MixerView {
  const element = document.createElement('section');
  element.className = 'mixer';
  const table = document.createElement('div');
  table.className = 'mixer-table';
  table.append(...['', '音量', 'パン', 'センド', ''].map((text) => cell('mixer-head', text)));
  const renders = CHANNEL_IDS.map((id) => channelRow(store, id, table));
  const ducking = duckingControls(store);
  const level = levelMeter();
  element.append(table, ducking.element, level.element);

  const render = (mixer: MixerSettings) => {
    for (const r of renders) r(mixer);
  };
  store.subscribe((params) => {
    render(params.mixer);
    ducking.render(params.ducking);
  });
  render(store.get().mixer);
  ducking.render(store.get().ducking);
  return { element, showLevel: level.show, resetLevel: level.reset };
}

// The meter's floor; anything quieter shows as empty.
const METER_FLOOR_DB = -48;

function levelMeter() {
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
  element.append(field('マスターのピーク', bar), peakText, clipText);

  let held = 0;
  let clips = 0;
  const render = (current: number) => {
    const db = peakDbfs(current);
    fill.style.width = `${Math.max(0, Math.min(1, 1 - db / METER_FLOOR_DB)) * 100}%`;
    peakText.textContent = `最大 ${formatDbfs(held)}`;
    clipText.textContent = `クリップ ${clips} サンプル`;
    clipText.classList.toggle('on', clips > 0);
  };
  render(0);
  return {
    element,
    show(report: LevelReport) {
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

function formatDbfs(peak: number): string {
  return peak <= 0 ? '−∞ dBFS' : `${peakDbfs(peak).toFixed(1).replace('-', '−')} dBFS`;
}

function duckingControls(store: ParamStore) {
  const update = (patch: Partial<DuckingSettings>) => store.update({ ducking: { ...store.get().ducking, ...patch } });
  const depth = range(0, 1, 0.01);
  depth.addEventListener('input', () => update({ depth: clampUnit(Number(depth.value)) }));
  const depthOut = document.createElement('output');
  const release = range(RELEASE_RANGE.min, RELEASE_RANGE.max, 5);
  release.addEventListener('input', () => update({ release: clampRelease(Number(release.value)) }));
  const releaseOut = document.createElement('output');

  const element = document.createElement('div');
  element.className = 'mixer-ducking';
  element.append(field('ダッキング量', row(depth, depthOut)), field('ダッキングの戻り時間', row(release, releaseOut)));
  return {
    element,
    render(settings: DuckingSettings) {
      depth.value = String(settings.depth);
      depthOut.textContent = `${Math.round(settings.depth * 100)}%`;
      release.value = String(settings.release);
      releaseOut.textContent = `${settings.release} ms`;
    },
  };
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

/** Appends one row of controls and returns how to show new settings in it. */
function channelRow(store: ParamStore, id: ChannelId, table: HTMLElement): (mixer: MixerSettings) => void {
  const update = (patch: Partial<{ level: Decibels; muted: boolean; pan: Pan; send: UnitInterval }>) => {
    const mixer = store.get().mixer;
    store.update({ mixer: { ...mixer, [id]: { ...mixer[id], ...patch } } });
  };
  const initial = store.get().mixer[id];

  const level = range(LEVEL_RANGE.min, LEVEL_RANGE.max, 1);
  level.addEventListener('input', () => update({ level: clampLevel(Number(level.value)) }));
  const levelOut = document.createElement('output');

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'mute';
  mute.textContent = 'M';
  mute.title = 'ミュート';
  mute.addEventListener('click', () => update({ muted: !store.get().mixer[id].muted }));

  table.append(cell('mixer-label', CHANNEL_LABEL[id]), row(level, levelOut));
  if (!isSending(initial)) {
    table.append(cell('mixer-none', ''), cell('mixer-none', ''), mute);
    return (mixer) => {
      const settings = mixer[id];
      level.value = String(settings.level);
      levelOut.textContent = formatLevel(settings.level);
      showMuted(mute, settings.muted);
    };
  }

  const pan = range(-1, 1, 0.05);
  pan.addEventListener('input', () => update({ pan: clampPan(Number(pan.value)) }));
  // Double-click recentres, as on a hardware desk.
  pan.addEventListener('dblclick', () => update({ pan: clampPan(0) }));
  const panOut = document.createElement('output');
  const send = range(0, 1, 0.01);
  send.addEventListener('input', () => update({ send: clampUnit(Number(send.value)) }));
  const sendOut = document.createElement('output');
  table.append(row(pan, panOut), row(send, sendOut), mute);

  return (mixer) => {
    const settings = mixer[id];
    level.value = String(settings.level);
    levelOut.textContent = formatLevel(settings.level);
    showMuted(mute, settings.muted);
    if (!isSending(settings)) return;
    pan.value = String(settings.pan);
    panOut.textContent = formatPan(settings.pan);
    send.value = String(settings.send);
    sendOut.textContent = `${Math.round(settings.send * 100)}%`;
  };
}

function showMuted(button: HTMLButtonElement, muted: boolean): void {
  button.classList.toggle('on', muted);
  button.setAttribute('aria-pressed', String(muted));
}

function formatLevel(level: Decibels): string {
  return `${level > 0 ? '+' : ''}${level} dB`;
}

function formatPan(pan: Pan): string {
  const amount = Math.round(Math.abs(pan) * 100);
  return amount === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${amount}`;
}

function range(min: number, max: number, step: number): HTMLInputElement {
  const el = document.createElement('input');
  Object.assign(el, { type: 'range', min: String(min), max: String(max), step: String(step) });
  return el;
}

function cell(className: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

function row(...children: HTMLElement[]): HTMLElement {
  const div = document.createElement('div');
  div.className = 'row';
  div.append(...children);
  return div;
}
