import { Pause, Play, Square, Volume2, VolumeX, type IconNode } from 'lucide';
import type { PlaybackSession } from '../engine/transport.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit } from '../units.ts';
import { icon, iconButton, setIcon } from './icons.ts';

/** Where playback stands: no session while stopped. */
export type PlaybackState = PlaybackSession['state'] | 'stopped';

const PLAY_BUTTON: Readonly<Record<PlaybackState, readonly [IconNode, string]>> = {
  stopped: [Play, '再生'],
  playing: [Pause, '一時停止'],
  paused: [Play, '再開'],
};

export interface Controls {
  readonly element: HTMLElement;
  show(state: PlaybackState): void;
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
  const render = () => {
    const { volume: level } = store.get();
    volume.value = String(level);
    volumeIcon.replaceChildren(icon(level > 0 ? Volume2 : VolumeX));
  };
  store.subscribe(render);
  render();
  const volumeLabel = document.createElement('label');
  volumeLabel.className = 'volume';
  volumeLabel.append(volumeIcon, volume);

  element.append(play, stop, volumeLabel);
  return {
    element,
    show(state) {
      setIcon(play, ...PLAY_BUTTON[state]);
      play.classList.toggle('playing', state === 'playing');
      stop.disabled = state === 'stopped';
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onStop(handler) {
      stop.addEventListener('click', handler);
    },
  };
}
