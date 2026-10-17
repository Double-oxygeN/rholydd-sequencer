import { clampUnit, type Brand, type UnitInterval } from '../units.ts';

/**
 * Settings that only shape the sound. They never reach the ensemble, so no mixer move can change the events a
 * seed generates.
 */

/** Fader level in whole decibels within LEVEL_RANGE. 0 dB passes the part through unchanged. */
export type Decibels = Brand<number, 'Decibels'>;
/** Stereo position from −1 (left) to 1 (right). */
export type Pan = Brand<number, 'Pan'>;
/** Whole milliseconds within RELEASE_RANGE. */
export type Milliseconds = Brand<number, 'Milliseconds'>;

export const LEVEL_RANGE = { min: -40, max: 6 } as const;
export const RELEASE_RANGE = { min: 30, max: 300 } as const;

export function clampLevel(x: number): Decibels {
  if (Number.isNaN(x)) return 0 as Decibels;
  return Math.round(Math.min(LEVEL_RANGE.max, Math.max(LEVEL_RANGE.min, x))) as Decibels;
}

export function clampPan(x: number): Pan {
  if (Number.isNaN(x)) return 0 as Pan;
  return (Math.round(Math.min(1, Math.max(-1, x)) * 100) / 100) as Pan;
}

export function clampRelease(x: number): Milliseconds {
  if (Number.isNaN(x)) return DEFAULT_DUCKING.release;
  return Math.round(Math.min(RELEASE_RANGE.max, Math.max(RELEASE_RANGE.min, x))) as Milliseconds;
}

/** What every channel has. The reverb return has nothing more. */
export interface Fader {
  readonly level: Decibels;
  readonly muted: boolean;
}

/** A source channel, which can be soloed. */
export interface Channel extends Fader {
  readonly soloed: boolean;
}

export interface PannedChannel extends Channel {
  readonly pan: Pan;
}

export interface SendingChannel extends PannedChannel {
  /** Share of the post-fader signal sent to the reverb. */
  readonly send: UnitInterval;
}

/** The kick and the sub have no pan and no send: the low end stays mono and dry. */
export interface MixerSettings {
  readonly kick: Channel;
  readonly snare: SendingChannel;
  readonly hat: SendingChannel;
  readonly ghost: SendingChannel;
  readonly sub: Channel;
  readonly reese: SendingChannel;
  readonly stab: SendingChannel;
  readonly pad: SendingChannel;
  /** Risers and impacts. */
  readonly fx: SendingChannel;
  /** Never soloed and never silenced by a solo, so that a soloed part keeps its reverb. */
  readonly reverbReturn: Fader;
}

export type ChannelId = keyof MixerSettings;
export type SoloableId = Exclude<ChannelId, 'reverbReturn'>;

export const CHANNEL_IDS: readonly ChannelId[] = [
  'kick',
  'snare',
  'hat',
  'ghost',
  'sub',
  'reese',
  'stab',
  'pad',
  'fx',
  'reverbReturn',
];

export const SOLOABLE_IDS = CHANNEL_IDS.filter((id): id is SoloableId => id !== 'reverbReturn');

export function isSending(channel: Fader): channel is SendingChannel {
  return 'send' in channel;
}

export function isSoloable(channel: Fader): channel is Channel {
  return 'soloed' in channel;
}

/**
 * Which channels sound. Once any channel is soloed, only the soloed ones do, and a mute always wins over a solo.
 * The reverb return answers to its mute alone, so a soloed part is heard with its reverb.
 */
export function audibleChannels(mixer: MixerSettings): Readonly<Record<ChannelId, boolean>> {
  const anySolo = SOLOABLE_IDS.some((id) => mixer[id].soloed);
  return Object.fromEntries(
    CHANNEL_IDS.map((id) => {
      const channel = mixer[id];
      return [id, !channel.muted && (!anySolo || !isSoloable(channel) || channel.soloed)];
    }),
  ) as Record<ChannelId, boolean>;
}

const dry = (): Channel => ({ level: 0 as Decibels, muted: false, soloed: false });
const wet = (pan: number, send: number): SendingChannel => ({
  level: 0 as Decibels,
  muted: false,
  soloed: false,
  pan: clampPan(pan),
  send: clampUnit(send),
});

export const DEFAULT_MIXER: MixerSettings = {
  kick: dry(),
  snare: wet(0, 0.15),
  hat: wet(0.2, 0.1),
  ghost: wet(-0.15, 0.1),
  sub: dry(),
  reese: wet(0, 0),
  stab: wet(-0.2, 0.35),
  pad: wet(0, 0.4),
  fx: wet(0, 0.3),
  reverbReturn: { level: 0 as Decibels, muted: false },
};

export interface DuckingSettings {
  /** How far the ducked parts dip on each kick, before the per-part ratio. */
  readonly depth: UnitInterval;
  /** Time to come back to full level after a kick. */
  readonly release: Milliseconds;
}

export const DEFAULT_DUCKING: DuckingSettings = { depth: clampUnit(0.6), release: 200 as Milliseconds };
