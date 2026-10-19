import * as Tone from 'tone';
import { APP_NAME } from './app-name.ts';
import { configureAudioContext, loadInstruments } from './engine/audio.ts';
import { releaseEndedOscillators } from './engine/oscillator-release.ts';
import { disposeEndedSourcesOnTimers } from './engine/source-disposal.ts';
import { createSequencer, type PlaybackSession } from './engine/transport.ts';
import { initialParams } from './params/config.ts';
import { loadConfig } from './params/load-config.ts';
import { seedFromQuery } from './params/query.ts';
import { createParamStore } from './params/store.ts';
import { createControls, type PlaybackState } from './ui/controls.ts';
import { createStepGrid } from './ui/grid.ts';
import { createOffCanvasMenu } from './ui/menu.ts';
import { createMixerView } from './ui/mixer.ts';
import { createPanel } from './ui/panel.ts';
import { createPositionView } from './ui/position.ts';
import { createShareDialog } from './ui/share.ts';
import { createSpectrumView } from './ui/spectrum.ts';
import { createViews } from './ui/views.ts';
import { linkMediaSession } from './ui/media-session.ts';
import { MESSAGES, pickLanguage, type Messages } from './ui/messages.ts';
import { interruptionCommand, mediaCommand, toggleCommand, type AudioState, type PlaybackCommand } from './ui/playback.ts';
import './ui/styles/index.css';

const SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/drums/`;
const CONFIG_URL = `${import.meta.env.BASE_URL}config.json`;
// Two sizes, the home screen icon's own files, so that the OS picks the one nearer what it shows.
const ARTWORK: readonly MediaImage[] = [192, 512].map((size) => ({
  src: `${import.meta.env.BASE_URL}icons/icon-${size}.png`,
  sizes: `${size}x${size}`,
  type: 'image/png',
}));

async function boot(root: HTMLElement, messages: Messages) {
  releaseEndedOscillators();
  disposeEndedSourcesOnTimers();
  configureAudioContext();
  const { value: config, warnings } = await loadConfig(CONFIG_URL);
  for (const warning of warnings) console.warn(warning);
  const store = createParamStore(initialParams(config, seedFromQuery(location.search)));
  const controls = createControls(store, messages);
  const panel = createPanel(store, messages);
  const position = createPositionView(messages);
  controls.element.append(position.counters);
  const grid = createStepGrid(messages);
  const spectrum = createSpectrumView(messages);
  const views = createViews({ sequencer: grid.element, spectrum: spectrum.element }, messages);
  const mixerView = createMixerView(store, messages);

  const title = document.createElement('h1');
  // Decoration only: the name beside it already says which app this is, and would be read out twice.
  const logo = new Image(32, 32);
  logo.src = `${import.meta.env.BASE_URL}icons/icon.svg`;
  logo.alt = '';
  const name = document.createElement('span');
  name.textContent = APP_NAME;
  title.append(logo, name);
  const status = document.createElement('p');
  status.className = 'status';
  // In the page from the start, so that screen readers read out what is written into it later.
  status.setAttribute('role', 'status');
  status.textContent = messages.loadingSamples;
  const menu = createOffCanvasMenu({ parameters: panel.element, mixer: mixerView.element }, messages);
  let session: PlaybackSession | null = null;
  // The seed field may change during playback and only applies from the next start, so a session shares its own.
  let sessionSeed = store.get().seed;
  const playingSeed = () => (session === null ? store.get().seed : sessionSeed);
  const share = createShareDialog(new URL(import.meta.env.BASE_URL, location.href).href, playingSeed, messages);
  // The buttons fixed at the top right come right after the heading, as they appear, so that Tab reaches them in
  // the order the page reads; the menu follows its button, to be next once it opens.
  const header = document.createElement('header');
  header.append(title, share.toggle, menu.toggle);
  root.append(header, menu.element, controls.element, position.element, views.element, status, share.element);

  const instruments = await loadInstruments(SAMPLE_BASE_URL, store.get().mixer, config.sound);
  status.textContent = warnings.length > 0 ? messages.configIgnored : '';
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

  // The spectrum only draws while it is shown and something plays, so that nothing is drawn that no one sees.
  const drawSpectrum = () => {
    if (views.current() === 'spectrum' && session?.state === 'playing') spectrum.run(instruments.spectrum);
    else spectrum.halt();
  };
  views.onChange(drawSpectrum);
  const playbackState = (): PlaybackState => session?.state ?? 'stopped';
  const media = linkMediaSession(messages, ARTWORK, (action) => {
    const command = mediaCommand(action, playbackState());
    if (command !== null) void run(command);
  });
  const render = () => {
    const state = playbackState();
    controls.show(state);
    panel.show(state);
    media.show(state, playingSeed());
    drawSpectrum();
  };
  // The buttons and the OS media controls both come through here, so the page and the OS always show the same state.
  const run = async (command: PlaybackCommand) => {
    switch (command) {
      case 'start': {
        // Browsers only allow the AudioContext to start from a user gesture.
        await Tone.start();
        // A second start may have waited on the same gesture, and must not begin a second session.
        if (session !== null) return;
        const { bpm, seed, initialKey } = store.get();
        // Only a new session clears the peak and the clip count: they count from the start of playback.
        mixerView.resetLevel();
        sessionSeed = seed;
        session = sequencer.start({ bpm, seed, initialKey, tuning: config.generation });
        break;
      }
      // A paused session keeps the grid and the position where they stopped.
      case 'pause':
        if (session?.state === 'playing') session = session.pause();
        break;
      case 'resume':
        // A pause that the system's interruption forced leaves the AudioContext suspended until a gesture wakes it.
        await Tone.start();
        if (session?.state === 'paused') session = session.resume();
        break;
      case 'stop':
        session?.stop();
        session = null;
        grid.highlight(null);
        position.clear();
        break;
    }
    render();
  };
  render();
  Tone.getContext().on('statechange', (audio: AudioState) => {
    const command = interruptionCommand(audio, playbackState());
    if (command !== null) void run(command);
  });
  controls.onPlay(() => void run(toggleCommand(playbackState())));
  controls.onStop(() => void run('stop'));
}

// The build alone, so that a kept old version never gets in the way of checking edited code on the dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      // Refused where storage is off, as in some private windows; the page still plays online.
      console.warn(error);
    });
  });
}

const root = document.getElementById('app');
if (root !== null) {
  // Read here alone, as location is: the language is the browser's to tell, and the page offers no switch.
  const language = pickLanguage(navigator.languages);
  document.documentElement.lang = language;
  const messages = MESSAGES[language];
  boot(root, messages).catch((error: unknown) => {
    root.textContent = messages.bootFailed(String(error));
  });
}
