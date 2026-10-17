import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Part } from '../src/generators/types.ts';
import { createRng, toSeed, type Rng } from '../src/random/rng.ts';

// The kit is synthesized here rather than taken from a sample pack, so that it ships under the repository's own
// Apache License 2.0 with no other licence to follow.

const SAMPLE_RATE = 44100;
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'samples', 'drums');

type Signal = Float32Array;

function render(seconds: number, sample: (t: number, i: number) => number): Signal {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / SAMPLE_RATE, i);
  return out;
}

const decay = (t: number, tau: number) => Math.exp(-t / tau);

/** RBJ cookbook biquad. */
function biquad(input: Signal, type: 'highpass' | 'bandpass', freq: number, q: number): Signal {
  const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const [b0, b1, b2] = type === 'highpass' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [alpha, 0, -alpha];
  const [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  const out = new Float32Array(input.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i]!;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    [x2, x1, y2, y1] = [x1, x0, y1, y0];
    out[i] = y0;
  }
  return out;
}

function noise(rng: Rng, seconds: number): Signal {
  return render(seconds, () => rng.float() * 2 - 1);
}

function mix(...layers: readonly [Signal, number][]): Signal {
  const length = Math.max(...layers.map(([s]) => s.length));
  const out = new Float32Array(length);
  for (const [signal, gain] of layers) for (let i = 0; i < signal.length; i++) out[i]! += signal[i]! * gain;
  return out;
}

function envelope(signal: Signal, env: (t: number) => number): Signal {
  return signal.map((x, i) => x * env(i / SAMPLE_RATE));
}

/** Normalizes to -1 dBFS with a short fade-out so that every sample ends without a click. */
function finish(signal: Signal): Signal {
  const peak = signal.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
  const gain = 10 ** (-1 / 20) / peak;
  const fade = Math.round(0.005 * SAMPLE_RATE);
  return signal.map((x, i) => x * gain * Math.min(1, (signal.length - 1 - i) / fade));
}

function kick(rng: Rng): Signal {
  let phase = 0;
  const body = render(0.45, (t) => {
    phase += (2 * Math.PI * (45 + 120 * decay(t, 0.03))) / SAMPLE_RATE;
    return Math.tanh(1.6 * Math.sin(phase) * decay(t, 0.16));
  });
  const click = envelope(biquad(noise(rng, 0.01), 'highpass', 2000, 0.7), (t) => decay(t, 0.002));
  return mix([body, 1], [click, 0.4]);
}

function snareLike(rng: Rng, seconds: number, toneTau: number, noiseTau: number): Signal {
  const tone = render(seconds, (t) => (Math.sin(2 * Math.PI * 185 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t)) * decay(t, toneTau));
  const rattle = envelope(biquad(noise(rng, seconds), 'bandpass', 3500, 0.6), (t) => decay(t, noiseTau));
  return mix([tone, 0.5], [rattle, 1.4]);
}

function hat(rng: Rng): Signal {
  return envelope(biquad(biquad(noise(rng, 0.09), 'highpass', 7000, 0.7), 'highpass', 7000, 0.7), (t) => decay(t, 0.018));
}

const KIT: Readonly<Record<Part, (rng: Rng) => Signal>> = {
  kick,
  snare: (rng) => snareLike(rng, 0.3, 0.05, 0.08),
  hat,
  // Shorter and duller than the main snare; its quietness comes from the velocity, not the sample.
  ghost: (rng) => snareLike(rng, 0.14, 0.025, 0.035),
};

function wav(signal: Signal): Buffer {
  const data = Buffer.alloc(signal.length * 2);
  signal.forEach((x, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(OUT_DIR, { recursive: true });
Object.entries(KIT).forEach(([part, synth], i) => {
  const file = join(OUT_DIR, `${part}.wav`);
  writeFileSync(file, wav(finish(synth(createRng(toSeed(i + 1))))));
  console.log(`wrote ${file}`);
});
