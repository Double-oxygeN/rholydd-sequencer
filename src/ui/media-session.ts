import type { Seed } from '../random/rng.ts';
import type { PlaybackState } from './controls.ts';
import { MEDIA_ACTIONS, type MediaAction } from './playback.ts';

export interface MediaSessionLink {
  /** Tells the browser and the OS where playback stands and which seed plays. */
  show(state: PlaybackState, seed: Seed): void;
}

const MEDIA_STATE: Readonly<Record<PlaybackState, MediaSessionPlaybackState>> = {
  stopped: 'none',
  playing: 'playing',
  paused: 'paused',
};

/** Chrome shows no media controls for media of five seconds or less. */
export const SILENCE = { seconds: 10, sampleRate: 8000 } as const;
const WAV_HEADER_BYTES = 44;
const FMT_CHUNK_BYTES = 16;
const PCM_FORMAT = 1;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 8;
// 8-bit PCM is unsigned, so silence sits halfway up.
export const SILENT_SAMPLE = 128;

/** A mono 8-bit WAV of silence, as small as a file of that length gets. */
export function silentWav(): Uint8Array<ArrayBuffer> {
  const samples = SILENCE.seconds * SILENCE.sampleRate;
  const bytesPerFrame = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const bytes = new Uint8Array(WAV_HEADER_BYTES + samples * bytesPerFrame);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, chunk: string) => {
    for (let i = 0; i < chunk.length; i++) bytes[offset + i] = chunk.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, FMT_CHUNK_BYTES, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SILENCE.sampleRate, true);
  view.setUint32(28, SILENCE.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  text(36, 'data');
  view.setUint32(40, samples * bytesPerFrame, true);
  bytes.fill(SILENT_SAMPLE, WAV_HEADER_BYTES);
  return bytes;
}

const NO_LINK: MediaSessionLink = { show() {} };

/**
 * Media keys, the lock screen and the media notification, through the Media Session API. Browsers offer these only
 * to pages playing an audio element, never to Web Audio alone, so a silent element loops while the piece plays. The
 * sound itself stays on Web Audio: sending it through the element would change its path and its latency.
 */
export function linkMediaSession(onAction: (action: MediaAction) => void): MediaSessionLink {
  if (!('mediaSession' in navigator)) return NO_LINK;
  const session = navigator.mediaSession;
  for (const action of MEDIA_ACTIONS) {
    try {
      session.setActionHandler(action, () => onAction(action));
    } catch {
      // Browsers that do not know an action throw for it; the others still work.
    }
  }
  const audio = new Audio(URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' })));
  audio.loop = true;
  // Kept in the document: browser extensions that bridge media sessions to the desktop pause an element outside it
  // and play it again, which would read as the browser pausing the piece.
  audio.hidden = true;
  document.body.append(audio);
  let held = false;
  // The browser pauses the element on its own when headphones are unplugged or another tab takes the audio.
  audio.addEventListener('pause', () => {
    if (held) onAction('pause');
  });
  return {
    show(state, seed) {
      session.playbackState = MEDIA_STATE[state];
      session.metadata = state === 'stopped' ? null : new MediaMetadata({ title: 'GenDnB', artist: `シード ${seed}` });
      held = state === 'playing';
      if (held) {
        audio.play().catch((error: unknown) => {
          // Refused without a user gesture. The piece still plays through Web Audio, only without the controls.
          if (error instanceof DOMException && error.name === 'NotAllowedError') held = false;
        });
      } else if (!audio.paused) {
        // Pausing an element that has not loaded yet starts loading it, which then aborts the next play with a pause
        // event of its own, taken for the browser pausing it.
        audio.pause();
      }
    },
  };
}
