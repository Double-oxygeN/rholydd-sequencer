import * as Tone from 'tone';

/** The parts of Tone.Oscillator that its typings keep private, as the pinned version of Tone names them. */
interface OscillatorInternals {
  readonly disposed: boolean;
  readonly frequency: Tone.Signal<'frequency'>;
  readonly detune: Tone.Signal<'cents'>;
  readonly _oscillator: Tone.ToneOscillatorNode;
  _start(time?: Tone.Unit.Time): void;
}

let installed = false;

/**
 * Lets the native oscillator of every note be collected once it has ended. Tone.Oscillator starts a new one for each
 * note that begins after the previous one ended and connects its own frequency and detune signals to it, but never
 * disconnects them. Those signals live as long as the synth does, and the connection record that
 * standardized-audio-context keeps for them held on to every ended oscillator, as many per note as the sound stacks.
 */
export function releaseEndedOscillators(): void {
  // Wrapping twice would disconnect twice, and the second disconnection throws.
  if (installed) return;
  installed = true;
  const prototype = Tone.Oscillator.prototype as unknown as OscillatorInternals;
  const start = prototype._start;
  prototype._start = function (this: OscillatorInternals, time) {
    start.call(this, time);
    const node = this._oscillator;
    const ended = node.onended;
    node.onended = (source) => {
      ended(source);
      // Disposing the synth already dropped every connection of its signals; disconnecting again would throw inside
      // Tone's timeout loop, which then retries the same callback on every tick and runs no later timeout.
      if (this.disposed) return;
      // The node's own params, not their wrappers: handed a Param, Tone disconnects the signal from everything.
      this.frequency.disconnect(node.frequency.input);
      this.detune.disconnect(node.detune.input);
    };
  };
}
