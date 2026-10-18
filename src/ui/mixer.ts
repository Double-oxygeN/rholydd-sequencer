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
import type { Messages } from './messages.ts';
import { createResetButton } from './reset.ts';

export interface MixerView {
  readonly element: HTMLElement;
  showLevel(report: LevelReport): void;
  /** Clears the held peak and the clip count, for a new session. */
  resetLevel(): void;
}

/** What the one slider of every channel row adjusts. */
export const MIXER_MODES = ['level', 'pan', 'send'] as const;
export type MixerMode = (typeof MIXER_MODES)[number];

export function createMixerView(store: ParamStore, messages: Messages): MixerView {
  const element = document.createElement('section');
  element.className = 'mixer';
  const table = document.createElement('div');
  table.className = 'mixer-table';
  const rows = CHANNEL_IDS.map((id) => channelRow(store, id, table, messages));
  const modes = modeSwitch(table, messages, (mode) => {
    for (const r of rows) r.show(mode);
  });
  const ducking = createDuckingControls(store, messages);
  const level = createLevelMeter(messages);
  element.append(modes, table, ducking.element, createResetButton(store, 'mix', messages), level.element);

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
function modeSwitch(table: HTMLElement, messages: Messages, onChange: (mode: MixerMode) => void): HTMLElement {
  const tabs = createTabs({
    ids: MIXER_MODES,
    label: messages.mixerModes,
    button(mode) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = messages.mixerMode[mode];
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

function channelRow(store: ParamStore, id: ChannelId, table: HTMLElement, messages: Messages): ChannelRow {
  const update = (patch: Partial<{ level: Decibels; muted: boolean; soloed: boolean; pan: Pan; send: UnitInterval }>) => {
    const mixer = store.get().mixer;
    store.update({ mixer: { ...mixer, [id]: { ...mixer[id], ...patch } } });
  };
  const initial = store.get().mixer[id];

  const name = messages.channel[id];
  const label = (control: string) => messages.channelControl(name, control);
  const level = range(LEVEL_RANGE.min, LEVEL_RANGE.max, 1);
  level.setAttribute('aria-label', label(messages.mixerMode.level));
  level.addEventListener('input', () => update({ level: clampLevel(Number(level.value)) }));
  const levelOut = document.createElement('output');

  const mute = toggle('M', 'mute', messages.mute, label(messages.mute));
  mute.addEventListener('click', () => update({ muted: !store.get().mixer[id].muted }));

  const solo = toggle('S', 'solo', messages.solo, label(messages.solo));
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
        showValue(level, levelOut, messages.decibels(settings.level));
        showOn(mute, settings.muted);
        if (isSoloable(settings)) showOn(solo, settings.soloed);
      },
    };
  }

  const pan = range(-1, 1, 0.05);
  pan.setAttribute('aria-label', label(messages.mixerMode.pan));
  pan.addEventListener('input', () => update({ pan: clampPan(Number(pan.value)) }));
  // Double-click recentres, as on a hardware desk.
  pan.addEventListener('dblclick', () => update({ pan: clampPan(0) }));
  const panOut = document.createElement('output');
  const send = range(0, 1, 0.01);
  send.setAttribute('aria-label', label(messages.mixerMode.send));
  send.addEventListener('input', () => update({ send: clampUnit(Number(send.value)) }));
  const sendOut = document.createElement('output');
  slots.pan = row(pan, panOut);
  slots.send = row(send, sendOut);

  return {
    show,
    render(mixer) {
      const settings = mixer[id];
      level.value = String(settings.level);
      showValue(level, levelOut, messages.decibels(settings.level));
      showOn(mute, settings.muted);
      if (isSoloable(settings)) showOn(solo, settings.soloed);
      if (!isSending(settings)) return;
      pan.value = String(settings.pan);
      showValue(pan, panOut, messages.pan(settings.pan));
      send.value = String(settings.send);
      showValue(send, sendOut, messages.percent(settings.send));
    },
  };
}

function showOn(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle('on', on);
  button.setAttribute('aria-pressed', String(on));
}

/** Shows a letter, as on a hardware desk, while screen readers hear which channel it belongs to. */
function toggle(text: string, className: string, title: string, name: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', name);
  return button;
}
