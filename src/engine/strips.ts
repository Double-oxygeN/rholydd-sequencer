import * as Tone from 'tone';
import { PARTS } from '../generators/types.ts';
import { CHANNEL_IDS, audibleChannels, isSending, type ChannelId, type Decibels, type MixerSettings } from '../params/mixer.ts';
import type { SoundTuning, SourceId } from './tuning.ts';

// Short enough to feel immediate, long enough not to click.
const MIXER_RAMP_SECONDS = 0.05;

export type MixerParam = Tone.Param<'decibels' | 'audioRange' | 'gain'>;

const settling = new WeakMap<MixerParam, ReturnType<typeof setTimeout>>();

/**
 * Moves a mixer parameter to the value over MIXER_RAMP_SECONDS from now, then sets it once more at the audio's
 * current time when the ramp is over. Chrome sometimes never applies a value scheduled ahead of the audio's current
 * time, and a part then kept sounding after a solo silenced it; a value set at the current time was always applied.
 * Tone's rampTo and mute are not used, as both only schedule ahead. A mixer move is not tied to the beat, so it
 * starts now rather than a look-ahead later.
 */
export function glide(param: MixerParam, value: number): void {
  const start = Tone.immediate();
  clearTimeout(settling.get(param));
  // Before the first play the audio's clock stands still, so a ramp would never end; nothing sounds yet to click.
  if (Tone.getContext().state !== 'running') {
    param.cancelScheduledValues(start);
    param.setValueAtTime(value, start);
    return;
  }
  const end = start + MIXER_RAMP_SECONDS;
  const from = param.getValueAtTime(start);
  param.cancelScheduledValues(start);
  param.setValueAtTime(from, start);
  param.linearRampToValueAtTime(value, end);
  const settle = () => {
    const now = Tone.immediate();
    if (now < end) settling.set(param, setTimeout(settle, (end - now) * 1000));
    else param.setValueAtTime(value, now);
  };
  settling.set(param, setTimeout(settle, MIXER_RAMP_SECONDS * 1000));
}

export interface Strip {
  /** Where the source connects, after its trim. */
  readonly input: Tone.ToneAudioNode;
  apply(settings: MixerSettings[ChannelId], audible: boolean): void;
}

export interface Buses {
  readonly drums: Tone.InputNode;
  readonly mix: Tone.InputNode;
  readonly reverb: Tone.InputNode;
}

// The cymbals are glued to the drums by the same compressor.
const DRUM_CHANNELS: readonly ChannelId[] = [...PARTS, 'cymbal'];

export function createStrips(mixer: MixerSettings, trimDb: SoundTuning['trimDb'], buses: Buses): Record<ChannelId, Strip> {
  const audible = audibleChannels(mixer);
  return Object.fromEntries(
    CHANNEL_IDS.map((id) => {
      const settings = mixer[id];
      // Tone's own solo is not used: it solos one channel at a time and silences the reverb return with the rest.
      // A silenced channel is a fader at −∞ rather than Tone's mute, for the reason given at glide.
      const fader = (level: Decibels, sounds: boolean) => (sounds ? level : -Infinity);
      const pan = isSending(settings) ? settings.pan : 0;
      const channel = new Tone.Channel({ volume: fader(settings.level, audible[id]), pan });
      channel.connect(DRUM_CHANNELS.includes(id) ? buses.drums : buses.mix);
      // Taken after the fader so that pulling a part down also pulls down its reverb.
      const send = isSending(settings) ? new Tone.Gain(settings.send) : null;
      if (send !== null) channel.chain(send, buses.reverb);
      const input = id === 'reverbReturn' ? channel : new Tone.Volume(trimDb[id as SourceId]).connect(channel);
      // Every mixer change reaches every strip, so each one only schedules what changed for it.
      let applied = { settings, sounds: audible[id] };
      const strip: Strip = {
        input,
        apply(next, sounds) {
          if (next.level !== applied.settings.level || sounds !== applied.sounds) {
            glide(channel.volume, fader(next.level, sounds));
          }
          if (isSending(next) && isSending(applied.settings)) {
            if (next.pan !== applied.settings.pan) glide(channel.pan, next.pan);
            if (next.send !== applied.settings.send && send !== null) glide(send.gain, next.send);
          }
          applied = { settings: next, sounds };
        },
      };
      return [id, strip];
    }),
  ) as Record<ChannelId, Strip>;
}
