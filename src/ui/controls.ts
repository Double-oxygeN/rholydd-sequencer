import { Pause, Play, Square, Volume2, VolumeX, type IconNode } from 'lucide';
import type { PlaybackSession } from '../engine/transport.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit } from '../units.ts';
import { showValue } from './dom.ts';
import { icon, iconButton, setIcon } from './icons.ts';

/** Where playback stands: no session while stopped. */
export type PlaybackState = PlaybackSession['state'] | 'stopped';

/**
 * What the buttons show: playback, or the samples still loading, when no session can start yet. Loading stays out of
 * PlaybackState, which only a session decides.
 */
export type ControlsState = PlaybackState | 'loading';

const PLAY_BUTTON: Readonly<Record<ControlsState, readonly [IconNode, string]>> = {
  loading: [Play, '再生'],
  stopped: [Play, '再生'],
  playing: [Pause, '一時停止'],
  paused: [Play, '再開'],
};

export interface Controls {
  readonly element: HTMLElement;
  show(state: ControlsState): void;
  onPlay(handler: () => void): void;
  onStop(handler: () => void): void;
}

/** One button plays, pauses and resumes; stop sits apart, since it throws the place in the piece away. */
export function createControls(store: ParamStore): Controls {
  const element = document.createElement('div');
  element.className = 'controls';
  const play = iconButton(Play, '再生', 'play');
  const stop = iconButton(Square, '停止', 'stop');

  // Kept out of the parameters' menu: it shapes how loud the listener hears, never what plays.
  const volume = document.createElement('input');
  Object.assign(volume, { type: 'range', min: '0', max: '1', step: '0.01', title: '音量' });
  volume.setAttribute('aria-label', '音量');
  volume.addEventListener('input', () => store.update({ volume: clampUnit(Number(volume.value)) }));
  const volumeIcon = document.createElement('span');
  volumeIcon.className = 'volume-icon';
  // The level shows above the thumb only while the slider is pointed at or moved, to keep the bar uncluttered.
  const slider = document.createElement('span');
  slider.className = 'volume-slider';
  const value = document.createElement('output');
  value.className = 'volume-value';
  slider.append(volume, value);
  const render = () => {
    const { volume: level } = store.get();
    volume.value = String(level);
    showValue(volume, value, `${Math.round(level * 100)}%`);
    slider.style.setProperty('--value', String(level));
    volumeIcon.replaceChildren(icon(level > 0 ? Volume2 : VolumeX));
  };
  store.subscribe(render);
  render();
  showWhileAdjusting(slider, volume);
  const volumeLabel = document.createElement('label');
  volumeLabel.className = 'volume';
  volumeLabel.append(volumeIcon, slider);

  element.append(play, stop, volumeLabel);
  const show = (state: ControlsState) => {
    setIcon(play, ...PLAY_BUTTON[state]);
    play.classList.toggle('playing', state === 'playing');
    // A press while loading is dropped rather than held over: the status line already says that the samples load.
    play.disabled = state === 'loading';
    stop.disabled = state === 'loading' || state === 'stopped';
  };
  show('loading');
  return {
    element,
    show,
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onStop(handler) {
      stop.addEventListener('click', handler);
    },
  };
}

// How long the level stays up after a key moves the slider, since keys give no sign of when they are done.
const KEY_ADJUST_MS = 1000;

/** Marks the slider as being adjusted from the press to the release, wherever the pointer goes meanwhile. */
function showWhileAdjusting(slider: HTMLElement, input: HTMLInputElement): void {
  let pressed = false;
  let timer: number | undefined;
  input.addEventListener('pointerdown', () => {
    pressed = true;
    slider.classList.add('adjusting');
  });
  window.addEventListener('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    slider.classList.remove('adjusting');
  });
  input.addEventListener('keydown', () => {
    slider.classList.add('adjusting');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!pressed) slider.classList.remove('adjusting');
    }, KEY_ADJUST_MS);
  });
}
