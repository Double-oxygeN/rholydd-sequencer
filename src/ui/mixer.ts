import type { LevelReport } from '../engine/clip.ts';
import {
  CHANNEL_IDS,
  LEVEL_RANGE,
  clampLevel,
  clampPan,
  isSending,
  isSoloable,
  type ChannelId,
  type Decibels,
  type MixerSettings,
  type Pan,
} from '../params/mixer.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit, type UnitInterval } from '../units.ts';
import { cell, range, row, showValue } from './dom.ts';
import { createTabs } from './tabs.ts';
import { createDuckingControls } from './ducking.ts';
import { createLevelMeter } from './level-meter.ts';

const CHANNEL_LABEL: Readonly<Record<ChannelId, string>> = {
  kick: 'キック',
  snare: 'スネア',
  hat: 'ハイハット',
  ghost: 'ゴースト',
  sub: 'サブベース',
  reese: 'リースベース',
  stab: 'スタブ',
  pad: 'パッド',
  fx: 'FX',
  reverbReturn: 'リバーブ',
};

export interface MixerView {
  readonly element: HTMLElement;
  showLevel(report: LevelReport): void;
  /** Clears the held peak and the clip count, for a new session. */
  resetLevel(): void;
}

/** What the one slider of every channel row adjusts. */
export const MIXER_MODES = ['level', 'pan', 'send'] as const;
export type MixerMode = (typeof MIXER_MODES)[number];

const MODE_LABEL: Readonly<Record<MixerMode, string>> = { level: '音量', pan: 'パン', send: 'センド' };

export function createMixerView(store: ParamStore): MixerView {
  const element = document.createElement('section');
  element.className = 'mixer';
  const table = document.createElement('div');
  table.className = 'mixer-table';
  const rows = CHANNEL_IDS.map((id) => channelRow(store, id, table));
  const modes = modeSwitch(table, (mode) => {
    for (const r of rows) r.show(mode);
  });
  const ducking = createDuckingControls(store);
  const level = createLevelMeter();
  element.append(modes, table, ducking.element, level.element);

  const render = (mixer: MixerSettings) => {
    for (const r of rows) r.render(mixer);
  };
  store.subscribe((params) => {
    render(params.mixer);
    ducking.render(params.ducking);
  });
  render(store.get().mixer);
  ducking.render(store.get().ducking);
  return { element, showLevel: level.show, resetLevel: level.reset };
}

/**
 * One switch for all channels, so that each row needs a single slider that can take the whole width, and the
 * channels compare at a glance on the same quantity.
 */
function modeSwitch(table: HTMLElement, onChange: (mode: MixerMode) => void): HTMLElement {
  const tabs = createTabs({
    ids: MIXER_MODES,
    label: 'ミキサーの調整の対象',
    button(mode) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = MODE_LABEL[mode];
      return button;
    },
    panel: () => table,
    initial: 'level',
    onSelect: onChange,
  });
  tabs.element.className = 'mixer-modes';
  return tabs.element;
}

interface ChannelRow {
  render(mixer: MixerSettings): void;
  show(mode: MixerMode): void;
}

function channelRow(store: ParamStore, id: ChannelId, table: HTMLElement): ChannelRow {
  const update = (patch: Partial<{ level: Decibels; muted: boolean; soloed: boolean; pan: Pan; send: UnitInterval }>) => {
    const mixer = store.get().mixer;
    store.update({ mixer: { ...mixer, [id]: { ...mixer[id], ...patch } } });
  };
  const initial = store.get().mixer[id];

  const name = CHANNEL_LABEL[id];
  const level = range(LEVEL_RANGE.min, LEVEL_RANGE.max, 1);
  level.setAttribute('aria-label', `${name} ${MODE_LABEL.level}`);
  level.addEventListener('input', () => update({ level: clampLevel(Number(level.value)) }));
  const levelOut = document.createElement('output');

  const mute = toggle('M', 'mute', 'ミュート', name);
  mute.addEventListener('click', () => update({ muted: !store.get().mixer[id].muted }));

  const solo = toggle('S', 'solo', 'ソロ', name);
  solo.addEventListener('click', () => {
    const settings = store.get().mixer[id];
    if (isSoloable(settings)) update({ soloed: !settings.soloed });
  });
  const soloCell = isSoloable(initial) ? solo : cell('mixer-none', '');

  const slots: Record<MixerMode, HTMLElement> = {
    level: row(level, levelOut),
    // The kick, the sub and the reverb return have no pan and no send: the low end stays mono and dry.
    pan: cell('mixer-none', '—'),
    send: cell('mixer-none', '—'),
  };
  const slot = document.createElement('div');
  slot.className = 'mixer-slot';
  table.append(cell('mixer-label', name), slot, mute, soloCell);
  const show = (mode: MixerMode) => slot.replaceChildren(slots[mode]);
  if (!isSending(initial)) {
    return {
      show,
      render(mixer) {
        const settings = mixer[id];
        level.value = String(settings.level);
        showValue(level, levelOut, formatLevel(settings.level));
        showOn(mute, settings.muted);
        if (isSoloable(settings)) showOn(solo, settings.soloed);
      },
    };
  }

  const pan = range(-1, 1, 0.05);
  pan.setAttribute('aria-label', `${name} ${MODE_LABEL.pan}`);
  pan.addEventListener('input', () => update({ pan: clampPan(Number(pan.value)) }));
  // Double-click recentres, as on a hardware desk.
  pan.addEventListener('dblclick', () => update({ pan: clampPan(0) }));
  const panOut = document.createElement('output');
  const send = range(0, 1, 0.01);
  send.setAttribute('aria-label', `${name} ${MODE_LABEL.send}`);
  send.addEventListener('input', () => update({ send: clampUnit(Number(send.value)) }));
  const sendOut = document.createElement('output');
  slots.pan = row(pan, panOut);
  slots.send = row(send, sendOut);

  return {
    show,
    render(mixer) {
      const settings = mixer[id];
      level.value = String(settings.level);
      showValue(level, levelOut, formatLevel(settings.level));
      showOn(mute, settings.muted);
      if (isSoloable(settings)) showOn(solo, settings.soloed);
      if (!isSending(settings)) return;
      pan.value = String(settings.pan);
      showValue(pan, panOut, formatPan(settings.pan));
      send.value = String(settings.send);
      showValue(send, sendOut, `${Math.round(settings.send * 100)}%`);
    },
  };
}

function showOn(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle('on', on);
  button.setAttribute('aria-pressed', String(on));
}

/** Shows a letter, as on a hardware desk, while screen readers hear which channel it belongs to. */
function toggle(text: string, className: string, title: string, channel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', `${channel} ${title}`);
  return button;
}

function formatLevel(level: Decibels): string {
  return `${level > 0 ? '+' : ''}${level} dB`;
}

function formatPan(pan: Pan): string {
  const amount = Math.round(Math.abs(pan) * 100);
  return amount === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${amount}`;
}
