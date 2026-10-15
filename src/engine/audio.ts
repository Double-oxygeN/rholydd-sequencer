import * as Tone from 'tone';
import type { FxEvent } from '../generators/fx/index.ts';
import { PARTS, type Part, type Pitch, type Step, type Velocity, type Voicing } from '../generators/types.ts';
import {
  CHANNEL_IDS,
  audibleChannels,
  isSending,
  type ChannelId,
  type DuckingSettings,
  type MixerSettings,
} from '../params/mixer.ts';
import { clampUnit, type UnitInterval } from '../units.ts';
import { CLIP_METER_NAME, type LevelReport } from './clip.ts';
import clipWorkletUrl from './clip-worklet.ts?worker&url';
import {
  AUTOMATION_TARGETS,
  fxAutomation,
  fxStateAt,
  restingValue,
  type AutomationPoint,
  type AutomationTarget,
} from './automation.ts';
import { duckPoints, type Dip, type Seconds } from './ducking.ts';
import {
  CHORD_POLYPHONY,
  PAD_PATCHES,
  REESE_PATCHES,
  STAB_PATCHES,
  type ChordPatch,
  type FatOscillator,
  type FmOscillator,
  type ReesePatch,
} from './patches.ts';
import type { CycleTimbre, PadTimbre, ReeseTimbre, StabTimbre } from '../structure/timbre.ts';
import type { DuckedPart, SoundTuning, SourceId } from './tuning.ts';

/** Every sample is mapped to one note and played back at its original pitch. */
const ROOT_NOTE = 'C3';

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
// Keeps the impact's boom above the kick and the sub it lands with, so the three never pile up into the limiter.
const IMPACT_HIGHPASS_HZ = 80;
const RISER_Q = 2;

const DUCKED_PARTS: readonly DuckedPart[] = ['sub', 'reese', 'pad'];

// Short enough to feel immediate, long enough not to click.
const MIXER_RAMP_SECONDS = 0.05;
// Stopping and starting cut the whole mix, so the gate fades rather than jumps, or a riser resumed halfway clicks.
const GATE_FADE_SECONDS = 0.01;

// A mono synth may click or drop the next note when a release and an attack land on the same instant.
const LEGATO_GAP_SECONDS = 0.005;

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls (N-02).
const LOOK_AHEAD_SECONDS = 0.25;

export interface Instruments {
  drum(part: Part, time: number, velocity: Velocity): void;
  sub(pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  reese(timbre: ReeseTimbre, pitch: Pitch, time: number, seconds: number, velocity: Velocity): void;
  chord<P extends ChordPart>(
    part: P,
    timbre: CycleTimbre[P],
    voicing: Voicing,
    time: number,
    seconds: number,
    velocity: Velocity,
  ): void;
  /**
   * Lets scheduled notes through from the given time on, with the effects where they stand at a step of 2 bars
   * when playback resumes there, or at rest.
   */
  open(time: number, resumed?: ResumedEffects): void;
  /** Cuts every note and the reverb tail from the given time, including notes already scheduled ahead of time. */
  silence(time: number): void;
  setVolume(volume: UnitInterval): void;
  setMixer(mixer: MixerSettings): void;
  /** Dips the sub, the reese and the pad on the given kicks, continuing the dips of the previous call. */
  duck(kicks: readonly Seconds[], ducking: DuckingSettings): void;
  /** Schedules the effects of the 2 bars starting at the given time, from a step on when playback resumes there. */
  fx(events: readonly FxEvent[], pairStart: Seconds, stepSeconds: number, from?: Step): void;
  /** Reports the peak and the clipped samples after the limiter about ten times a second. */
  onLevel(listener: (report: LevelReport) => void): void;
}

/** The effects of the 2 bars playback resumes within, and the step it resumes from. */
export interface ResumedEffects {
  readonly events: readonly FxEvent[];
  readonly step: Step;
  readonly stepSeconds: number;
}

export function configureAudioContext(): void {
  Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: LOOK_AHEAD_SECONDS }));
}

export async function loadInstruments(
  drumSamplesUrl: string,
  mixer: MixerSettings,
  sound: SoundTuning,
): Promise<Instruments> {
  const resting = restingValue(sound.fx);
  const listening = new Tone.Volume().toDestination();
  // Notes scheduled within the look-ahead window keep playing after Transport.stop, so stop needs a gate.
  // It sits last so that it also cuts the reverb tail.
  const gate = new Tone.Gain(0).connect(listening);
  // Tone.Limiter is a fast compressor rather than a brickwall, so whatever still overshoots is counted here.
  const context = Tone.getContext();
  await context.addAudioWorkletModule(clipWorkletUrl);
  const clipMeter = context.createAudioWorkletNode(CLIP_METER_NAME, { outputChannelCount: [2] });
  Tone.connect(clipMeter, gate);
  const limiter = new Tone.Limiter(sound.dynamics.limiterThresholdDb).connect(clipMeter);
  const masterBus = new Tone.Compressor(sound.dynamics.masterBus).connect(limiter);
  // The mix runs through one of two equal high-passes: the swept one, or one resting open that keeps the low end
  // shaped as it always is. Their shares come from one signal, so that they always add up to the whole mix.
  const sweepHighpass = new Tone.Filter({ type: 'highpass', frequency: resting.highpass, rolloff: -24 });
  const restingHighpass = new Tone.Filter({ type: 'highpass', frequency: sound.fx.highpass.openHz, rolloff: -24 });
  const sweptShare = new Tone.Gain(0).connect(masterBus);
  const restingShare = new Tone.Gain(0).connect(masterBus);
  const highpassShare = new Tone.Signal(resting.highpassShare);
  highpassShare.connect(sweptShare.gain);
  highpassShare.chain(new Tone.Negate(), new Tone.Add(1), restingShare.gain);
  const mixBus = new Tone.Gain().fan(sweepHighpass, restingHighpass);
  sweepHighpass.connect(sweptShare);
  restingHighpass.connect(restingShare);
  const drumBus = new Tone.Compressor(sound.dynamics.drumBus).connect(mixBus);
  const reverbIn = new Tone.Gain();

  const strips = createStrips(mixer, sound.trimDb, { drums: drumBus, mix: mixBus, reverb: reverbIn });
  const drumBuffers = Object.fromEntries(
    PARTS.map((part) => [part, new Tone.ToneAudioBuffer(`${drumSamplesUrl}${part}.wav`)]),
  ) as Record<Part, Tone.ToneAudioBuffer>;
  const createSamplers = () =>
    Object.fromEntries(
      PARTS.map((part) => [
        part,
        new Tone.Sampler({ urls: { [ROOT_NOTE]: drumBuffers[part] }, release: 0.02 }).connect(strips[part].input),
      ]),
    ) as Record<Part, Tone.Sampler>;
  let samplers = createSamplers();
  // Tone.Compressor has no sidechain input, so the kick's dips are scheduled on plain gains instead.
  const ducks: Record<DuckedPart, Tone.Gain> = {
    sub: new Tone.Gain(1).connect(strips.sub.input),
    reese: new Tone.Gain(1).connect(strips.reese.input),
    pad: new Tone.Gain(1).connect(strips.pad.input),
  };
  let carried: Record<DuckedPart, Dip | null> = { sub: null, reese: null, pad: null };
  // One per pitched part, before the channels, so that the intro's sweep also darkens what goes to the reverb.
  const introLowpass = {
    sub: lowpassForSweep(resting.lowpass),
    reese: lowpassForSweep(resting.lowpass),
    stab: lowpassForSweep(resting.lowpass),
    pad: lowpassForSweep(resting.lowpass),
  };
  // Kept apart from the ducking gain so that the gap and the kicks never schedule the same parameter.
  const padGate = new Tone.Gain(resting.padGate).connect(ducks.pad);
  const inputs: VoiceInputs = {
    sub: new Tone.Distortion(SUB_DRIVE).chain(new Tone.Filter(SUB_LOWPASS), introLowpass.sub, ducks.sub),
    reese: new Tone.Filter(REESE_HIGHPASS_HZ, 'highpass').chain(introLowpass.reese, ducks.reese),
    stab: new Tone.Filter(STAB_LOWPASS_HZ, 'lowpass').chain(introLowpass.stab, strips.stab.input),
    pad: new Tone.Filter(PAD_LOWPASS_HZ, 'lowpass').chain(introLowpass.pad, padGate),
    impact: new Tone.Filter(IMPACT_HIGHPASS_HZ, 'highpass').connect(strips.fx.input),
  };
  // Runs for the whole session at zero gain, so that stopping a riser only means cancelling its gain.
  const riserGain = new Tone.Gain(resting.riserGain).connect(strips.fx.input);
  const riserFilter = new Tone.Filter({ type: 'bandpass', frequency: resting.riserFrequency, Q: RISER_Q }).connect(
    riserGain,
  );
  new Tone.Noise('white').connect(riserFilter).start();
  // Taken after the snare's trim but before its fader, so a throw never depends on the snare's level. It still
  // follows the snare's mute and the solos: a throw from a silenced snare would sound like a fault.
  const throwSend = new Tone.Gain(resting.throwSend).connect(reverbIn);
  const throwGate = new Tone.Gain(audibleChannels(mixer).snare ? 1 : 0).connect(throwSend);
  strips.snare.input.connect(throwGate);
  const automated: Readonly<Record<AutomationTarget, readonly Automatable[]>> = {
    riserGain: [riserGain.gain],
    riserFrequency: [riserFilter.frequency],
    highpass: [sweepHighpass.frequency],
    highpassShare: [highpassShare],
    lowpass: Object.values(introLowpass).map((filter) => filter.frequency),
    throwSend: [throwSend.gain],
    padGate: [padGate.gain],
  };
  const rest = (time: number) => {
    for (const target of AUTOMATION_TARGETS) {
      for (const param of automated[target]) {
        param.cancelScheduledValues(time);
        param.setValueAtTime(resting[target], time);
      }
    }
  };
  let voices = createVoices(inputs, sound.fx.impactVolumeDb);
  let reverb = createReverb(reverbIn, strips.reverbReturn.input, sound.reverb);
  await Tone.loaded();

  return {
    drum(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    sub(pitch, time, seconds, velocity) {
      voices.sub.triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    // A change of sound only changes which synth gets the next note, so the previous cycle's tails ring out on the
    // synth they started on and nothing needs scheduling at the cycle boundary.
    reese(timbre, pitch, time, seconds, velocity) {
      voices.reese[timbre].triggerAttackRelease(frequencyOf(pitch), legatoSeconds(seconds), time, velocity);
    },
    chord(part, timbre, voicing, time, seconds, velocity) {
      chordSynth(voices, part, timbre).triggerAttackRelease(voicing.map(frequencyOf), legatoSeconds(seconds), time, velocity);
    },
    open(time, resumed) {
      // Notes of the previous session stay scheduled on the synths' timelines, and the gate would let them
      // collide with the new ones on the mono voices or hold on to poly voices. Fresh synths drop them all at once.
      disposeVoices(voices);
      voices = createVoices(inputs, sound.fx.impactVolumeDb);
      // A resume follows a pause within the same 2 bars, where hits scheduled before the pause would still be due.
      // releaseAll only stops those from a timer that may run late, so fresh samplers drop them for certain.
      for (const sampler of Object.values(samplers)) sampler.dispose();
      samplers = createSamplers();
      // The reverb still rings with the previous session; a fresh one starts silent. It renders its impulse
      // response asynchronously, which only leaves the first few tens of milliseconds dry.
      reverb.dispose();
      reverb = createReverb(reverbIn, strips.reverbReturn.input, sound.reverb);
      // Scheduled before the transport starts, so that the first 2 bars, which the transport times at this very
      // instant, set the values their effects start from after these.
      rest(time);
      if (resumed !== undefined) {
        const state = fxStateAt(resumed.events, resumed.step, resumed.stepSeconds, sound.fx);
        for (const target of AUTOMATION_TARGETS) {
          // Nothing sounds before the gate opens, so the high-pass can take the mix in one step here.
          for (const param of automated[target]) param.setValueAtTime(state[target], time);
        }
      }
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(0, time);
      gate.gain.linearRampToValueAtTime(1, time + GATE_FADE_SECONDS);
    },
    silence(now) {
      gate.gain.cancelScheduledValues(now);
      gate.gain.rampTo(0, GATE_FADE_SECONDS, now);
      for (const sampler of Object.values(samplers)) sampler.releaseAll(now);
      // Dips scheduled ahead for the stopped session must not reach the next one.
      for (const part of DUCKED_PARTS) {
        ducks[part].gain.cancelScheduledValues(now);
        ducks[part].gain.setValueAtTime(1, now);
      }
      carried = { sub: null, reese: null, pad: null };
      // A build stopped halfway would otherwise leave the next session high-passed and with the riser up.
      rest(now);
      voices.sub.triggerRelease(now);
      for (const reese of Object.values(voices.reese)) reese.triggerRelease(now);
      for (const chord of [...Object.values(voices.stab), ...Object.values(voices.pad)]) chord.releaseAll(now);
    },
    setVolume(volume) {
      listening.volume.rampTo(Tone.gainToDb(volume), MIXER_RAMP_SECONDS);
    },
    setMixer(next) {
      const audible = audibleChannels(next);
      for (const id of CHANNEL_IDS) strips[id].apply(next[id], audible[id]);
      // Kept apart from the throw's own send, so that the mixer and the automation never move the same parameter.
      throwGate.gain.rampTo(audible.snare ? 1 : 0, MIXER_RAMP_SECONDS);
    },
    fx(events, pairStart, stepSeconds, from = 0 as Step) {
      for (const point of fxAutomation(events, pairStart, stepSeconds, sound.fx, from)) {
        for (const param of automated[point.target]) apply(param, point);
      }
      for (const event of events) {
        if (event.fx !== 'impact' || event.step < from) continue;
        const time = pairStart + event.step * stepSeconds;
        voices.impactBoom.triggerAttackRelease(IMPACT_BOOM_NOTE, IMPACT_SECONDS, time);
        voices.impactNoise.triggerAttackRelease(IMPACT_SECONDS, time);
      }
    },
    onLevel(listener) {
      clipMeter.port.onmessage = (message: MessageEvent<LevelReport>) => listener(message.data);
    },
    duck(kicks, { depth, release }) {
      for (const part of DUCKED_PARTS) {
        const shape = { floor: clampUnit(1 - depth * sound.duckRatio[part]), release: (release / 1000) as Seconds };
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

/** The scheduling methods shared by Tone's params and signals. */
interface Automatable {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

function apply(param: Automatable, { time, value, ramp }: AutomationPoint): void {
  switch (ramp) {
    case 'set':
      param.setValueAtTime(value, time);
      break;
    case 'linear':
      param.linearRampToValueAtTime(value, time);
      break;
    case 'exponential':
      param.exponentialRampToValueAtTime(value, time);
      break;
  }
}

function lowpassForSweep(frequency: number): Tone.Filter {
  return new Tone.Filter({ type: 'lowpass', frequency, rolloff: -12 });
}

interface Strip {
  /** Where the source connects, after its trim. */
  readonly input: Tone.ToneAudioNode;
  apply(settings: MixerSettings[ChannelId], audible: boolean): void;
}

interface Buses {
  readonly drums: Tone.InputNode;
  readonly mix: Tone.InputNode;
  readonly reverb: Tone.InputNode;
}

const DRUM_CHANNELS: readonly ChannelId[] = PARTS;

function createStrips(mixer: MixerSettings, trimDb: SoundTuning['trimDb'], buses: Buses): Record<ChannelId, Strip> {
  const audible = audibleChannels(mixer);
  return Object.fromEntries(
    CHANNEL_IDS.map((id) => {
      const settings = mixer[id];
      // Tone's own solo is not used: it solos one channel at a time and silences the reverb return with the rest.
      const channel = new Tone.Channel({ volume: settings.level, mute: !audible[id], pan: 0 });
      channel.connect(DRUM_CHANNELS.includes(id) ? buses.drums : buses.mix);
      // Taken after the fader so that pulling a part down also pulls down its reverb.
      const send = isSending(settings) ? new Tone.Gain(settings.send) : null;
      if (send !== null) channel.chain(send, buses.reverb);
      const input = id === 'reverbReturn' ? channel : new Tone.Volume(trimDb[id as SourceId]).connect(channel);
      const strip: Strip = {
        input,
        apply(next, sounds) {
          channel.volume.rampTo(next.level, MIXER_RAMP_SECONDS);
          channel.mute = !sounds;
          if (isSending(next)) {
            channel.pan.rampTo(next.pan, MIXER_RAMP_SECONDS);
            send?.gain.rampTo(next.send, MIXER_RAMP_SECONDS);
          }
        },
      };
      strip.apply(settings, audible[id]);
      return [id, strip];
    }),
  ) as Record<ChannelId, Strip>;
}

function createReverb(from: Tone.ToneAudioNode, to: Tone.InputNode, settings: SoundTuning['reverb']): Tone.Reverb {
  const reverb = new Tone.Reverb({ ...settings, wet: 1 });
  from.connect(reverb);
  reverb.connect(to);
  return reverb;
}

type ChordPart = 'stab' | 'pad';

/** Parts with a table of sounds hold one synth per sound, all feeding the part's input. */
interface Voices {
  readonly sub: Tone.Synth;
  readonly reese: Readonly<Record<ReeseTimbre, Tone.MonoSynth>>;
  readonly stab: Readonly<Record<StabTimbre, Tone.PolySynth>>;
  readonly pad: Readonly<Record<PadTimbre, Tone.PolySynth>>;
  readonly impactBoom: Tone.MembraneSynth;
  readonly impactNoise: Tone.NoiseSynth;
}

function chordSynth<P extends ChordPart>(voices: Voices, part: P, timbre: CycleTimbre[P]): Tone.PolySynth {
  // The generic index loses the link between part and timbre, so the two tables are looked up apart.
  return part === 'stab' ? voices.stab[timbre as StabTimbre] : voices.pad[timbre as PadTimbre];
}

type VoiceInputs = {
  readonly [P in Exclude<keyof Voices, 'impactBoom' | 'impactNoise'>]: Tone.InputNode;
} & { readonly impact: Tone.InputNode };

// Falls from about 98 Hz, and the high-pass keeps it clear of the kick's and the sub's fundamentals.
const IMPACT_BOOM_NOTE = 'G2';
const IMPACT_SECONDS = 1.2;
function createVoices(to: VoiceInputs, impactVolumeDb: number): Voices {
  return {
    sub: new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 1, release: 0.03 },
    }).connect(to.sub),
    reese: mapValues(REESE_PATCHES, (patch) => buildReeseSynth(patch).connect(to.reese)),
    stab: mapValues(STAB_PATCHES, (patch) => buildChordSynth(patch).connect(to.stab)),
    pad: mapValues(PAD_PATCHES, (patch) => buildChordSynth(patch).connect(to.pad)),
    impactBoom: new Tone.MembraneSynth({
      pitchDecay: 0.4,
      octaves: 3,
      envelope: { attack: 0.002, decay: 1, sustain: 0, release: 0.4 },
      volume: impactVolumeDb,
    }).connect(to.impact),
    impactNoise: new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.002, decay: IMPACT_SECONDS, sustain: 0, release: 0.2 },
      volume: impactVolumeDb,
    }).connect(to.impact),
  };
}

function buildReeseSynth(patch: ReesePatch): Tone.MonoSynth {
  return new Tone.MonoSynth({
    oscillator: oscillatorOptions(patch.oscillator),
    envelope: patch.envelope,
    filter: { type: 'lowpass', Q: patch.filterQ, rolloff: -24 },
    filterEnvelope: patch.filterEnvelope,
    volume: patch.gainDb,
  });
}

function buildChordSynth(patch: ChordPatch): Tone.PolySynth {
  return new Tone.PolySynth({
    maxPolyphony: CHORD_POLYPHONY,
    voice: Tone.Synth,
    options: { oscillator: oscillatorOptions(patch.oscillator), envelope: patch.envelope },
    volume: patch.gainDb,
  });
}

function oscillatorOptions(oscillator: FatOscillator<number> | FmOscillator) {
  return 'count' in oscillator
    ? { type: oscillator.type, count: oscillator.count, spread: oscillator.spread }
    : // Tone modulates with a square unless told otherwise, which would make every FM sound harsh.
      { type: oscillator.type, harmonicity: oscillator.harmonicity, modulationIndex: oscillator.modulationIndex, modulationType: 'sine' as const };
}

function mapValues<K extends string, A, B>(record: Readonly<Record<K, A>>, f: (value: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries<A>(record).map(([key, value]) => [key, f(value)])) as Record<K, B>;
}

function disposeVoices(voices: Voices): void {
  voices.sub.dispose();
  for (const synth of [...Object.values(voices.reese), ...Object.values(voices.stab), ...Object.values(voices.pad)]) {
    synth.dispose();
  }
  voices.impactBoom.dispose();
  voices.impactNoise.dispose();
}

function frequencyOf(pitch: Pitch): number {
  return Tone.Frequency(pitch, 'midi').toFrequency();
}

function legatoSeconds(seconds: number): number {
  return Math.max(LEGATO_GAP_SECONDS, seconds - LEGATO_GAP_SECONDS);
}
