import * as Tone from 'tone';
import { PARTS, type Part, type Pitch, type Velocity, type Voicing } from '../generators/types.ts';
import { CHANNEL_IDS, isSending, type ChannelId, type DuckingSettings, type MixerSettings } from '../params/mixer.ts';
import { clampUnit, type UnitInterval } from '../units.ts';
import { CLIP_METER_NAME, type LevelReport } from './clip.ts';
import clipWorkletUrl from './clip-worklet.ts?worker&url';
import { duckPoints, type Dip, type Seconds } from './ducking.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
const ROOT_NOTE = 'C3';

// Evens out the sources so that every fader starts at 0 dB; velocities still come from the generators.
// Measured alone, the drums otherwise peaked right at full scale and left the limiter no headroom.
const SOURCE_TRIM_DB: Readonly<Record<Exclude<ChannelId, 'reverbReturn'>, number>> = {
  kick: -8,
  snare: -10,
  hat: -14,
  ghost: -8,
  sub: 0,
  reese: -10,
  stab: -13,
  pad: -16,
};

// A pure sine has no harmonics, so small speakers would lose the bass pitch entirely.
const SUB_DRIVE = 0.15;
// Keeps the base octave (up to E2, 82 Hz) and tames the octave jumps and the drive's harmonics, which stood
// out once the sub was raised to match the kick. The reese now carries the pitch into the mid range.
// A Q of 0.7 keeps each of the two stages flat below the cutoff, so the top of the base octave is not boosted.
const SUB_LOWPASS = { frequency: 100, type: 'lowpass', rolloff: -24, Q: 0.7 } as const;
// Cut below the sub so that the two basses never stack up in the lowest octave.
const REESE_HIGHPASS_HZ = 120;
const STAB_LOWPASS_HZ = 3000;
const PAD_LOWPASS_HZ = 1500;

/** How deep each ducked part dips relative to the ducking depth. The sub clears the most room for the kick. */
const DUCK_RATIO: Readonly<Record<DuckedPart, number>> = { sub: 1, reese: 0.7, pad: 0.5 };
type DuckedPart = 'sub' | 'reese' | 'pad';
const DUCKED_PARTS: readonly DuckedPart[] = ['sub', 'reese', 'pad'];

const REVERB = { decay: 2.5, preDelay: 0.02 } as const;
const DRUM_BUS = { threshold: -12, ratio: 3, attack: 0.01, release: 0.1 } as const;
const MASTER_BUS = { threshold: -10, ratio: 2, attack: 0.02, release: 0.2 } as const;
const LIMITER_THRESHOLD_DB = -1;

// Short enough to feel immediate, long enough not to click.
const MIXER_RAMP_SECONDS = 0.05;

// A mono synth may click or drop the next note when a release and an attack land on the same instant.
const LEGATO_GAP_SECONDS = 0.005;

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls (N-02).
const LOOK_AHEAD_SECONDS = 0.25;

export interface Instruments {
  drum(part: Part, time: number, velocity: Velocity): void;
  sub(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  reese(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  chord(part: 'stab' | 'pad', voicing: Voicing, time: number, seconds: number, velocity: Velocity): void;
  /** Lets scheduled notes through from the given time on. */
  open(time: number): void;
  /** Cuts every note and the reverb tail, including notes already scheduled ahead of time. */
  silence(): void;
  setVolume(volume: UnitInterval): void;
  setMixer(mixer: MixerSettings): void;
  /** Dips the sub, the reese and the pad on the given kicks, continuing the dips of the previous call. */
  duck(kicks: readonly Seconds[], ducking: DuckingSettings): void;
  /** Reports the peak and the clipped samples after the limiter about ten times a second. */
  onLevel(listener: (report: LevelReport) => void): void;
}

export function configureAudioContext(): void {
  Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: LOOK_AHEAD_SECONDS }));
}

export async function loadInstruments(drumSamplesUrl: string, mixer: MixerSettings): Promise<Instruments> {
  const listening = new Tone.Volume().toDestination();
  // Notes scheduled within the look-ahead window keep playing after Transport.stop, so stop needs a gate.
  // It sits last so that it also cuts the reverb tail.
  const gate = new Tone.Gain(0).connect(listening);
  // Tone.Limiter is a fast compressor rather than a brickwall, so whatever still overshoots is counted here.
  const context = Tone.getContext();
  await context.addAudioWorkletModule(clipWorkletUrl);
  const clipMeter = context.createAudioWorkletNode(CLIP_METER_NAME, { outputChannelCount: [2] });
  Tone.connect(clipMeter, gate);
  const limiter = new Tone.Limiter(LIMITER_THRESHOLD_DB).connect(clipMeter);
  const mixBus = new Tone.Gain().chain(new Tone.Compressor(MASTER_BUS), limiter);
  const drumBus = new Tone.Compressor(DRUM_BUS).connect(mixBus);
  const reverbIn = new Tone.Gain();

  const strips = createStrips(mixer, { drums: drumBus, mix: mixBus, reverb: reverbIn });
  const samplers = Object.fromEntries(
    PARTS.map((part) => [
      part,
      new Tone.Sampler({ urls: { [ROOT_NOTE]: `${part}.wav` }, baseUrl: drumSamplesUrl, release: 0.02 }).connect(
        strips[part].input,
      ),
    ]),
  ) as Record<Part, Tone.Sampler>;
  // Tone.Compressor has no sidechain input, so the kick's dips are scheduled on plain gains instead.
  const ducks: Record<DuckedPart, Tone.Gain> = {
    sub: new Tone.Gain(1).connect(strips.sub.input),
    reese: new Tone.Gain(1).connect(strips.reese.input),
    pad: new Tone.Gain(1).connect(strips.pad.input),
  };
  let carried: Record<DuckedPart, Dip | null> = { sub: null, reese: null, pad: null };
  const inputs: VoiceInputs = {
    sub: new Tone.Distortion(SUB_DRIVE).chain(new Tone.Filter(SUB_LOWPASS), ducks.sub),
    reese: new Tone.Filter(REESE_HIGHPASS_HZ, 'highpass').connect(ducks.reese),
    stab: new Tone.Filter(STAB_LOWPASS_HZ, 'lowpass').connect(strips.stab.input),
    pad: new Tone.Filter(PAD_LOWPASS_HZ, 'lowpass').connect(ducks.pad),
  };
  let voices = createVoices(inputs);
  let reverb = createReverb(reverbIn, strips.reverbReturn.input);
  await Tone.loaded();

  return {
    drum(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    sub(pitch, time, seconds, velocity) {
      voices.sub.triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    reese(pitch, time, seconds, velocity) {
      voices.reese.triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    chord(part, voicing, time, seconds, velocity) {
      voices[part].triggerAttackRelease(voicing.map(frequencyOf), legatoSeconds(seconds), time, velocity);
    },
    open(time) {
      // Notes of the previous session stay scheduled on the synths' timelines, and the gate would let them
      // collide with the new ones on the mono voices or hold on to poly voices. Fresh synths drop them all at once.
      disposeVoices(voices);
      voices = createVoices(inputs);
      // The reverb still rings with the previous session; a fresh one starts silent. It renders its impulse
      // response asynchronously, which only leaves the first few tens of milliseconds dry.
      reverb.dispose();
      reverb = createReverb(reverbIn, strips.reverbReturn.input);
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(1, time);
    },
    silence() {
      const now = Tone.now();
      gate.gain.cancelScheduledValues(now);
      gate.gain.rampTo(0, 0.01, now);
      for (const sampler of Object.values(samplers)) sampler.releaseAll(now);
      // Dips scheduled ahead for the stopped session must not reach the next one.
      for (const part of DUCKED_PARTS) {
        ducks[part].gain.cancelScheduledValues(now);
        ducks[part].gain.setValueAtTime(1, now);
      }
      carried = { sub: null, reese: null, pad: null };
      voices.sub.triggerRelease(now);
      voices.reese.triggerRelease(now);
      voices.stab.releaseAll(now);
      voices.pad.releaseAll(now);
    },
    setVolume(volume) {
      listening.volume.rampTo(Tone.gainToDb(volume), MIXER_RAMP_SECONDS);
    },
    setMixer(next) {
      for (const id of CHANNEL_IDS) strips[id].apply(next[id]);
    },
    onLevel(listener) {
      clipMeter.port.onmessage = (message: MessageEvent<LevelReport>) => listener(message.data);
    },
    duck(kicks, { depth, release }) {
      for (const part of DUCKED_PARTS) {
        const shape = { floor: clampUnit(1 - depth * DUCK_RATIO[part]), release: (release / 1000) as Seconds };
        const plan = duckPoints(kicks, carried[part], shape);
        const gain = ducks[part].gain;
        const first = plan.points[0];
        // Replaces only what the previous call scheduled after this one's first dip starts.
        if (first !== undefined) gain.cancelScheduledValues(first.time);
        for (const point of plan.points) gain.linearRampToValueAtTime(point.gain, point.time);
        carried[part] = plan.last;
      }
    },
  };
}

interface Strip {
  /** Where the source connects, after its trim. */
  readonly input: Tone.InputNode;
  apply(settings: MixerSettings[ChannelId]): void;
}

interface Buses {
  readonly drums: Tone.InputNode;
  readonly mix: Tone.InputNode;
  readonly reverb: Tone.InputNode;
}

const DRUM_CHANNELS: readonly ChannelId[] = PARTS;

function createStrips(mixer: MixerSettings, buses: Buses): Record<ChannelId, Strip> {
  return Object.fromEntries(
    CHANNEL_IDS.map((id) => {
      const settings = mixer[id];
      const channel = new Tone.Channel({ volume: settings.level, mute: settings.muted, pan: 0 });
      channel.connect(DRUM_CHANNELS.includes(id) ? buses.drums : buses.mix);
      // Taken after the fader so that pulling a part down also pulls down its reverb.
      const send = isSending(settings) ? new Tone.Gain(settings.send) : null;
      if (send !== null) channel.chain(send, buses.reverb);
      const input = id === 'reverbReturn' ? channel : new Tone.Volume(SOURCE_TRIM_DB[id]).connect(channel);
      const strip: Strip = {
        input,
        apply(next) {
          channel.volume.rampTo(next.level, MIXER_RAMP_SECONDS);
          channel.mute = next.muted;
          if (isSending(next)) {
            channel.pan.rampTo(next.pan, MIXER_RAMP_SECONDS);
            send?.gain.rampTo(next.send, MIXER_RAMP_SECONDS);
          }
        },
      };
      strip.apply(settings);
      return [id, strip];
    }),
  ) as Record<ChannelId, Strip>;
}

function createReverb(from: Tone.ToneAudioNode, to: Tone.InputNode): Tone.Reverb {
  const reverb = new Tone.Reverb({ ...REVERB, wet: 1 });
  from.connect(reverb);
  reverb.connect(to);
  return reverb;
}

interface Voices {
  readonly sub: Tone.Synth;
  readonly reese: Tone.MonoSynth;
  readonly stab: Tone.PolySynth;
  readonly pad: Tone.PolySynth;
}

type VoiceInputs = { readonly [P in keyof Voices]: Tone.InputNode };

function createVoices(to: VoiceInputs): Voices {
  return {
    sub: new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 1, release: 0.03 },
    }).connect(to.sub),
    // Detuned saws beating against each other are what make a reese.
    reese: new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.05 },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.1, baseFrequency: 200, octaves: 3 },
    }).connect(to.reese),
    stab: new Tone.PolySynth({
      maxPolyphony: 8,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'fatsquare', count: 2, spread: 15 },
        envelope: { attack: 0.003, decay: 0.12, sustain: 0.15, release: 0.15 },
      },
    }).connect(to.stab),
    // Re-struck every 2 bars while the previous chord still releases, hence more voices than 4 notes need.
    pad: new Tone.PolySynth({
      maxPolyphony: 12,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
        envelope: { attack: 0.4, decay: 0.6, sustain: 0.7, release: 1.2 },
      },
    }).connect(to.pad),
  };
}

function disposeVoices(voices: Voices): void {
  for (const voice of Object.values(voices)) voice.dispose();
}

function frequencyOf(pitch: Pitch): number {
  return Tone.Frequency(pitch, 'midi').toFrequency();
}

function legatoSeconds(seconds: number): number {
  return Math.max(LEGATO_GAP_SECONDS, seconds - LEGATO_GAP_SECONDS);
}
