import type { PlaybackSession } from '../engine/transport.ts';
import type { ParamStore } from '../params/store.ts';
import { clampUnit } from '../units.ts';

/** Where playback stands: no session while stopped. */
export type PlaybackState = PlaybackSession['state'] | 'stopped';

const PLAY_LABEL: Readonly<Record<PlaybackState, string>> = { stopped: '再生', playing: '一時停止', paused: '再開' };

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
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'play';
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'stop';
  stop.textContent = '停止';

  // Kept out of the parameters' menu: it shapes how loud the listener hears, never what plays.
  const volume = document.createElement('input');
  Object.assign(volume, { type: 'range', min: '0', max: '1', step: '0.01', title: '音量' });
  volume.setAttribute('aria-label', '音量');
  volume.addEventListener('input', () => store.update({ volume: clampUnit(Number(volume.value)) }));
  const render = () => {
    volume.value = String(store.get().volume);
  };
  store.subscribe(render);
  render();
  const volumeLabel = document.createElement('label');
  volumeLabel.className = 'volume';
  volumeLabel.append('音量', volume);

  element.append(play, stop, volumeLabel);
  return {
    element,
    show(state) {
      play.textContent = PLAY_LABEL[state];
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
