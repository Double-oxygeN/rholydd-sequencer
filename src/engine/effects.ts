import * as Tone from 'tone';
import { AUTOMATION_TARGETS, type AutomationPoint, type AutomationTarget, type AutomationValues } from './automation.ts';

const RISER_Q = 2;

/** The scheduling methods shared by Tone's params and signals. */
export interface Automatable {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

/** Every parameter that each automation target moves. */
export type AutomatedParams = Readonly<Record<AutomationTarget, readonly Automatable[]>>;

export interface Automation {
  /** Cancels whatever is scheduled from the given time and returns every target to rest. */
  rest(time: number): void;
  /** Sets every target to the given values at once, as when playback resumes within an effect. */
  setAll(values: AutomationValues, time: number): void;
  apply(point: AutomationPoint): void;
}

export function automate(params: AutomatedParams, resting: AutomationValues): Automation {
  const setAll = (values: AutomationValues, time: number) => {
    for (const target of AUTOMATION_TARGETS) {
      for (const param of params[target]) param.setValueAtTime(values[target], time);
    }
  };
  return {
    rest(time) {
      for (const target of AUTOMATION_TARGETS) {
        for (const param of params[target]) param.cancelScheduledValues(time);
      }
      setAll(resting, time);
    },
    setAll,
    apply(point) {
      for (const param of params[point.target]) applyPoint(param, point);
    },
  };
}

function applyPoint(param: Automatable, { time, value, ramp }: AutomationPoint): void {
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

export interface SweptHighpass {
  readonly input: Tone.Gain;
  readonly frequency: Automatable;
  /** How much of the mix runs through the swept filter rather than the resting one. */
  readonly share: Automatable;
}

/**
 * The mix runs through one of two equal high-passes: the swept one, or one resting open that keeps the low end
 * shaped as it always is. Their shares come from one signal, so that they always add up to the whole mix.
 */
export function createSweptHighpass(to: Tone.InputNode, resting: AutomationValues, openHz: number): SweptHighpass {
  const sweepHighpass = new Tone.Filter({ type: 'highpass', frequency: resting.highpass, rolloff: -24 });
  const restingHighpass = new Tone.Filter({ type: 'highpass', frequency: openHz, rolloff: -24 });
  const sweptShare = new Tone.Gain(0).connect(to);
  const restingShare = new Tone.Gain(0).connect(to);
  const highpassShare = new Tone.Signal(resting.highpassShare);
  highpassShare.connect(sweptShare.gain);
  highpassShare.chain(new Tone.Negate(), new Tone.Add(1), restingShare.gain);
  const input = new Tone.Gain().fan(sweepHighpass, restingHighpass);
  sweepHighpass.connect(sweptShare);
  restingHighpass.connect(restingShare);
  return { input, frequency: sweepHighpass.frequency, share: highpassShare };
}

export interface Riser {
  readonly gain: Automatable;
  readonly frequency: Automatable;
}

/** Runs for the whole session at zero gain, so that stopping a riser only means cancelling its gain. */
export function createRiser(to: Tone.InputNode, resting: AutomationValues): Riser {
  const riserGain = new Tone.Gain(resting.riserGain).connect(to);
  const riserFilter = new Tone.Filter({ type: 'bandpass', frequency: resting.riserFrequency, Q: RISER_Q }).connect(
    riserGain,
  );
  new Tone.Noise('white').connect(riserFilter).start();
  return { gain: riserGain.gain, frequency: riserFilter.frequency };
}

export function lowpassForSweep(frequency: number): Tone.Filter {
  return new Tone.Filter({ type: 'lowpass', frequency, rolloff: -12 });
}
