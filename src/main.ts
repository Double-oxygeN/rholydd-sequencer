import * as Tone from 'tone';
import { configureAudioContext, loadInstruments } from './engine/audio.ts';
import { createSequencer, type PlaybackSession } from './engine/transport.ts';
import { initialParams } from './params/config.ts';
import { loadConfig } from './params/load-config.ts';
import { seedFromQuery } from './params/query.ts';
import { createParamStore } from './params/store.ts';
import { createControls } from './ui/controls.ts';
import { createStepGrid } from './ui/grid.ts';
import { createOffCanvasMenu } from './ui/menu.ts';
import { createMixerView } from './ui/mixer.ts';
import { createPanel } from './ui/panel.ts';
import { createPositionView } from './ui/position.ts';
import { createSpectrumView } from './ui/spectrum.ts';
import { createViews } from './ui/views.ts';
import './ui/style.css';

const SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/drums/`;
const CONFIG_URL = `${import.meta.env.BASE_URL}config.json`;

async function boot(root: HTMLElement) {
  configureAudioContext();
  const { value: config, warnings } = await loadConfig(CONFIG_URL);
  for (const warning of warnings) console.warn(warning);
  const store = createParamStore(initialParams(config, seedFromQuery(location.search)));
  const controls = createControls(store);
  const panel = createPanel(store);
  const position = createPositionView();
  controls.element.append(position.counters);
  const grid = createStepGrid();
  const spectrum = createSpectrumView();
  const views = createViews({ sequencer: grid.element, spectrum: spectrum.element });
  const mixerView = createMixerView(store);

  const title = document.createElement('h1');
  title.textContent = 'GenDnB';
  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = 'サンプルを読み込み中…';
  const menu = createOffCanvasMenu({ parameters: panel.element, mixer: mixerView.element });
  root.append(title, controls.element, position.element, views.element, status, menu.element, menu.toggle);

  const instruments = await loadInstruments(SAMPLE_BASE_URL, store.get().mixer, config.sound);
  status.textContent = warnings.length > 0 ? '設定ファイルの一部の値を無視しました（詳細はコンソール）' : '';
  instruments.setVolume(store.get().volume);
  instruments.onLevel((report) => mixerView.showLevel(report));
  let mixer = store.get().mixer;
  store.subscribe((params) => {
    instruments.setVolume(params.volume);
    if (params.mixer !== mixer) instruments.setMixer(params.mixer);
    mixer = params.mixer;
  });

  const sequencer = createSequencer(instruments, store.get, {
    pairStarted: (_, events) => grid.show(events),
    stepStarted: (ctx, step) => {
      grid.highlight(step);
      position.show(ctx, step);
    },
  });

  let session: PlaybackSession | null = null;
  // The spectrum only draws while it is shown and something plays (N-16).
  const drawSpectrum = () => {
    if (views.current() === 'spectrum' && session?.state === 'playing') spectrum.run(instruments.spectrum);
    else spectrum.halt();
  };
  views.onChange(drawSpectrum);
  const render = () => {
    const state = session?.state ?? 'stopped';
    controls.show(state);
    panel.show(state);
    drawSpectrum();
  };
  render();
  controls.onPlay(async () => {
    if (session === null) {
      // Browsers only allow the AudioContext to start from a user gesture.
      await Tone.start();
      const { bpm, seed, initialKey } = store.get();
      // Only a new session clears the peak and the clip count: they count from the start of playback.
      mixerView.resetLevel();
      session = sequencer.start({ bpm, seed, initialKey, tuning: config.generation });
    } else {
      // A paused session keeps the grid and the position where they stopped.
      session = session.state === 'playing' ? session.pause() : session.resume();
    }
    render();
  });
  controls.onStop(() => {
    session?.stop();
    session = null;
    grid.highlight(null);
    position.clear();
    render();
  });
}

const root = document.getElementById('app');
if (root !== null) {
  boot(root).catch((error: unknown) => {
    root.textContent = `起動に失敗しました: ${String(error)}`;
  });
}
