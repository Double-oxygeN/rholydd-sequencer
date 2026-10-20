import * as Tone from 'tone';
import type { FxEvent } from '../generators/fx/index.ts';
import type { Cymbal, Part, Pitch, Step, Velocity, Voicing } from '../generators/types.ts';
import { CHANNEL_IDS, audibleChannels, type DuckingSettings, type MixerSettings } from '../params/mixer.ts';
import type { CycleTimbre, ReeseTimbre } from '../structure/timbre.ts';
import { clampUnit, type UnitInterval } from '../units.ts';
import { fxAutomation, fxStateAt, restingValue } from './automation.ts';
import { CLIP_METER_NAME, type LevelReport } from './clip.ts';
import clipWorkletUrl from './clip-worklet.ts?worker&url';
import { duckPoints, type Dip, type Seconds } from './ducking.ts';
import { automate, createRiser, createSweptHighpass, lowpassForSweep, type AutomatedParams } from './effects.ts';
import { createStrips, glide } from './strips.ts';
import type { DuckedPart, SoundTuning } from './tuning.ts';
import {
  IMPACT_BOOM_NOTE,
  IMPACT_SECONDS,
  ROOT_NOTE,
  chordSynth,
  createSamplers,
  createVoices,
  disposeVoices,
  frequencyOf,
  legatoSeconds,
  loadDrumBuffers,
  type ChordPart,
  type VoiceInputs,
} from './voices.ts';

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

const DUCKED_PARTS: readonly DuckedPart[] = ['sub', 'reese', 'pad'];

// Stopping and starting cut the whole mix, so the gate fades rather than jumps, or a riser resumed halfway clicks.
const GATE_FADE_SECONDS = 0.01;

// A longer look-ahead than Tone's default 0.1 s keeps playback steady when the main thread stalls, as it does when
// the tab is switched.
const LOOK_AHEAD_SECONDS = 0.25;

export interface Instruments {
  drum(part: Part, time: number, velocity: Velocity): void;
  cymbal(part: Cymbal, time: number, velocity: Velocity): void;
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
  /** The spectrum of what is heard right now, before the volume: silent while stopped or paused. */
  spectrum(): Spectrum;
}

export interface Spectrum {
  /** Level of each FFT bin in decibels, bin i lying at i × sampleRate / (2 × bins.length) Hz. */
  readonly bins: Float32Array;
  readonly sampleRate: number;
}

// Fine enough to tell the kick's fundamental from the sub's in the lowest band, at a cost only paid when read.
const SPECTRUM_FFT_SIZE = 4096;
const SPECTRUM_SMOOTHING = 0.6;

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
  let volume: UnitInterval | null = null;
  // Notes scheduled within the look-ahead window keep playing after Transport.stop, so stop needs a gate.
  // It sits last so that it also cuts the reverb tail.
  const gate = new Tone.Gain(0).connect(listening);
  // Taken where the clip meter listens, after the gate so that stopping clears it, before the volume so that the
  // listener's volume never changes what it shows.
  const analyser = new Tone.Analyser({ type: 'fft', size: SPECTRUM_FFT_SIZE, smoothing: SPECTRUM_SMOOTHING });
  gate.connect(analyser);
  // Tone.Limiter is a fast compressor rather than a brickwall, so whatever still overshoots is counted here.
  const context = Tone.getContext();
  await context.addAudioWorkletModule(clipWorkletUrl);
  const clipMeter = context.createAudioWorkletNode(CLIP_METER_NAME, { outputChannelCount: [2] });
  Tone.connect(clipMeter, gate);
  const limiter = new Tone.Limiter(sound.dynamics.limiterThresholdDb).connect(clipMeter);
  const masterBus = new Tone.Compressor(sound.dynamics.masterBus).connect(limiter);
  const highpass = createSweptHighpass(masterBus, resting, sound.fx.highpass.openHz);
  const mixBus = highpass.input;
  const drumBus = new Tone.Compressor(sound.dynamics.drumBus).connect(mixBus);
  const reverbIn = new Tone.Gain();

  const strips = createStrips(mixer, sound.trimDb, { drums: drumBus, mix: mixBus, reverb: reverbIn });
  const drumBuffers = loadDrumBuffers(drumSamplesUrl);
  const drumInputs = {
    kick: strips.kick.input,
    snare: strips.snare.input,
    hat: strips.hat.input,
    ghost: strips.ghost.input,
    // One channel for both: they share a band and only ever sound together where a crash lands in the second drop.
    crash: strips.cymbal.input,
    ride: strips.cymbal.input,
  };
  let samplers = createSamplers(drumBuffers, drumInputs);
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
  const riser = createRiser(strips.fx.input, resting);
  // Taken after the snare's trim but before its fader, so a throw never depends on the snare's level. It still
  // follows the snare's mute and the solos: a throw from a silenced snare would sound like a fault.
  const throwSend = new Tone.Gain(resting.throwSend).connect(reverbIn);
  let throwing = audibleChannels(mixer).snare;
  const throwGate = new Tone.Gain(throwing ? 1 : 0).connect(throwSend);
  strips.snare.input.connect(throwGate);
  const automated: AutomatedParams = {
    riserGain: [riser.gain],
    riserFrequency: [riser.frequency],
    highpass: [highpass.frequency],
    highpassShare: [highpass.share],
    lowpass: Object.values(introLowpass).map((filter) => filter.frequency),
    throwSend: [throwSend.gain],
    padGate: [padGate.gain],
  };
  const automation = automate(automated, resting);
  let voices = createVoices(inputs, sound.fx.impactVolumeDb);
  let reverb = createReverb(reverbIn, strips.reverbReturn.input, sound.reverb);
  await Tone.loaded();

  return {
    drum(part, time, velocity) {
      samplers[part].triggerAttack(ROOT_NOTE, time, velocity);
    },
    cymbal(part, time, velocity) {
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
      samplers = createSamplers(drumBuffers, drumInputs);
      // The reverb still rings with the previous session; a fresh one starts silent. It renders its impulse
      // response asynchronously, which only leaves the first few tens of milliseconds dry.
      reverb.dispose();
      reverb = createReverb(reverbIn, strips.reverbReturn.input, sound.reverb);
      // Scheduled before the transport starts, so that the first 2 bars, which the transport times at this very
      // instant, set the values their effects start from after these.
      automation.rest(time);
      // Nothing sounds before the gate opens, so the high-pass can take the mix in one step here.
      if (resumed !== undefined) {
        automation.setAll(fxStateAt(resumed.events, resumed.step, resumed.stepSeconds, sound.fx), time);
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
      automation.rest(now);
      voices.sub.triggerRelease(now);
      for (const reese of Object.values(voices.reese)) reese.triggerRelease(now);
      for (const chord of [...Object.values(voices.stab), ...Object.values(voices.pad)]) chord.releaseAll(now);
    },
    setVolume(next) {
      if (next === volume) return;
      glide(listening.volume, Tone.gainToDb(next));
      volume = next;
    },
    setMixer(next) {
      const audible = audibleChannels(next);
      for (const id of CHANNEL_IDS) strips[id].apply(next[id], audible[id]);
      // Kept apart from the throw's own send, so that the mixer and the automation never move the same parameter.
      if (audible.snare !== throwing) glide(throwGate.gain, audible.snare ? 1 : 0);
      throwing = audible.snare;
    },
    fx(events, pairStart, stepSeconds, from = 0 as Step) {
      for (const point of fxAutomation(events, pairStart, stepSeconds, sound.fx, from)) automation.apply(point);
      for (const event of events) {
        if (event.fx !== 'impact' || event.step < from) continue;
        const time = pairStart + event.step * stepSeconds;
        voices.impactBoom.triggerAttackRelease(IMPACT_BOOM_NOTE, IMPACT_SECONDS, time);
        voices.impactNoise.triggerAttackRelease(IMPACT_SECONDS, time);
      }
    },
    spectrum() {
      return { bins: analyser.getValue() as Float32Array, sampleRate: context.sampleRate };
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

function createReverb(from: Tone.ToneAudioNode, to: Tone.InputNode, settings: SoundTuning['reverb']): Tone.Reverb {
  const reverb = new Tone.Reverb({ ...settings, wet: 1 });
  from.connect(reverb);
  reverb.connect(to);
  return reverb;
}
