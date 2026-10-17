import type { PlaybackState } from './controls.ts';

/** What the page does to playback, whether a button or the OS asked for it. */
export type PlaybackCommand = 'start' | 'pause' | 'resume' | 'stop';

/** The Media Session actions taken: an endless piece has no tracks to skip and no place to seek to. */
export const MEDIA_ACTIONS = ['play', 'pause', 'stop'] as const;
export type MediaAction = (typeof MEDIA_ACTIONS)[number];

const TOGGLE: Readonly<Record<PlaybackState, Exclude<PlaybackCommand, 'stop'>>> = {
  stopped: 'start',
  playing: 'pause',
  paused: 'resume',
};

/** The play button plays, pauses and resumes in turn. */
export function toggleCommand(state: PlaybackState): Exclude<PlaybackCommand, 'stop'> {
  return TOGGLE[state];
}

// The OS sends play and pause as separate actions, so a play while playing must not pause.
const MEDIA: Readonly<Record<MediaAction, Readonly<Record<PlaybackState, PlaybackCommand | null>>>> = {
  play: { stopped: 'start', playing: null, paused: 'resume' },
  pause: { stopped: null, playing: 'pause', paused: null },
  stop: { stopped: null, playing: 'stop', paused: 'stop' },
};

export function mediaCommand(action: MediaAction, state: PlaybackState): PlaybackCommand | null {
  return MEDIA[action][state];
}

/** States an AudioContext reports. Safari on iOS adds 'interrupted', which the standard does not list. */
export type AudioState = AudioContextState | 'interrupted';

/**
 * iOS stops the audio when the screen locks or another app comes forward, while the page and the OS would go on
 * showing playback. Pausing makes both show what is heard, and a resume plays on from the step where it stopped.
 */
export function interruptionCommand(audio: AudioState, state: PlaybackState): PlaybackCommand | null {
  return audio !== 'running' && state === 'playing' ? 'pause' : null;
}
