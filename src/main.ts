import * as Tone from 'tone';
import { configureAudioContext, loadDrumKit } from './engine/audio.ts';
import { createSequencer } from './engine/transport.ts';
import { createParamStore, defaultParams } from './params/store.ts';
import { DEFAULT_KEY } from './structure/key.ts';
import { createStepGrid } from './ui/grid.ts';
import { createPanel } from './ui/panel.ts';
import { createPositionView } from './ui/position.ts';
import './ui/style.css';

const SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/drums/`;

async function boot(root: HTMLElement) {
  configureAudioContext();
  const store = createParamStore(defaultParams());
  const panel = createPanel(store);
  const position = createPositionView();
  const grid = createStepGrid();

  const title = document.createElement('h1');
  title.textContent = 'GenDnB';
  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = 'サンプルを読み込み中…';
  root.append(title, panel.element, position.element, grid.element, status);

  const kit = await loadDrumKit(SAMPLE_BASE_URL);
  status.textContent = '';
  kit.setVolume(store.get().volume);
  store.subscribe((params) => kit.setVolume(params.volume));

  const sequencer = createSequencer(kit, store.get, {
    pairStarted: (_, events) => grid.show(events),
    stepStarted: (ctx, step) => {
      grid.highlight(step);
      position.show(ctx, step);
    },
  });

  let playing = false;
  panel.setPlaying(playing);
  panel.onToggle(async () => {
    if (playing) {
      sequencer.stop();
      grid.highlight(null);
      position.clear();
    } else {
      // Browsers only allow the AudioContext to start from a user gesture.
      await Tone.start();
      const { bpm, seed } = store.get();
      sequencer.start({ bpm, seed, key: DEFAULT_KEY });
    }
    playing = !playing;
    panel.setPlaying(playing);
  });
}

const root = document.getElementById('app');
if (root !== null) {
  boot(root).catch((error: unknown) => {
    root.textContent = `起動に失敗しました: ${String(error)}`;
  });
}
