import * as Tone from 'tone';

/** The part of Tone's OneShotSource, the base of every note's oscillator and buffer source, that its typings hide. */
interface OneShotSourceInternals {
  _onended(): void;
}

let installed = false;

/**
 * Disposes every ended note's source on a timer rather than in idle time. Tone disposes them through
 * requestIdleCallback, which a hidden Chrome tab never runs: each ended source, with its gain and params, stayed
 * queued for as long as the tab was hidden, tens of thousands within the hour. Hiding requestIdleCallback for the
 * length of the call sends Tone down its own fallback, a setTimeout, which hidden tabs still run.
 */
export function disposeEndedSourcesOnTimers(): void {
  if (installed) return;
  installed = true;
  const prototype = Object.getPrototypeOf(Tone.ToneBufferSource.prototype) as OneShotSourceInternals;
  // Both kinds of source must take this path, or one would still pile up unnoticed.
  if (Object.getPrototypeOf(Tone.ToneOscillatorNode.prototype) !== prototype || typeof prototype._onended !== 'function') {
    throw new Error('Tone no longer ends its sources the way the pinned version did');
  }
  const ended = prototype._onended;
  prototype._onended = function (this: OneShotSourceInternals) {
    const idle = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback');
    Object.defineProperty(window, 'requestIdleCallback', { value: undefined, configurable: true, writable: true });
    try {
      ended.call(this);
    } finally {
      if (idle === undefined) Reflect.deleteProperty(window, 'requestIdleCallback');
      else Object.defineProperty(window, 'requestIdleCallback', idle);
    }
  };
}
