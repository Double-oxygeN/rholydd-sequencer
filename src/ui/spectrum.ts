import type { Spectrum } from '../engine/audio.ts';

/** Half-octave bands from 31.5 Hz to 16 kHz: the kick and the sub land in bands of their own, the hats at the top. */
export const BAND_CENTERS: readonly number[] = Array.from({ length: 19 }, (_, k) => 31.5 * Math.SQRT2 ** k);
export const SEGMENTS = 48;
export const SEGMENT_DB = 1;
// Segments at and above these levels warn that the mix is nearing full scale.
const WARN_DB = -6;
const NEAR_DB = -12;
/** Matches the floor of the master peak meter. */
export const FLOOR_DB = -SEGMENTS * SEGMENT_DB;
/**
 * The analyser's Blackman window leaves a full-scale sine at about −13.6 dB in its loudest bin (measured −13.6 to
 * −14.1 dB), and its main lobe adds about 2.4 dB over the neighbouring bins, so this much is added for a
 * full-scale sine to light the top segment.
 */
const WINDOW_LOSS_DB = 11.2;
const HOLD_SECONDS = 1;
const FALL_DB_PER_SECOND = 24;

/**
 * Level of each band in dBFS: the power of the bins between the band's edges, a quarter octave either side of its
 * centre, added up. Taking only the loudest bin hid the hats: their noise spreads thinly over hundreds of bins, none
 * of which reached the floor.
 */
export function bandLevels({ bins, sampleRate }: Spectrum): readonly number[] {
  const binHz = sampleRate / (2 * bins.length);
  return BAND_CENTERS.map((center) => {
    // Each bin belongs to the one band whose edges it lies between, or the nearest centre if a band holds none.
    const from = Math.ceil((center * 2 ** -0.25) / binHz);
    const below = Math.ceil((center * 2 ** 0.25) / binHz) - 1;
    const to = below >= from ? below : Math.round(center / binHz);
    let power = 0;
    for (let i = Math.min(from, to); i <= to && i < bins.length; i++) power += 10 ** ((bins[i] ?? -Infinity) / 10);
    return 10 * Math.log10(power) + WINDOW_LOSS_DB;
  });
}

/** How many segments a level lights, from none at the floor to all at 0 dBFS and above. */
export function litSegments(levelDb: number): number {
  if (!(levelDb > FLOOR_DB)) return 0;
  return Math.min(SEGMENTS, Math.ceil((levelDb - FLOOR_DB) / SEGMENT_DB));
}

/** Holds each band's highest segment for a moment, then lets it fall, so that a short peak can be followed by eye. */
export function holdPeaks(previous: readonly HeldPeak[], lit: readonly number[], seconds: number): readonly HeldPeak[] {
  return lit.map((now, i) => {
    const held = previous[i] ?? { segment: 0, age: 0 };
    if (now >= held.segment) return { segment: now, age: 0 };
    const age = held.age + seconds;
    if (age <= HOLD_SECONDS) return { segment: held.segment, age };
    return { segment: Math.max(now, held.segment - (seconds * FALL_DB_PER_SECOND) / SEGMENT_DB), age };
  });
}

export interface HeldPeak {
  /** Segment count, fractional while falling. */
  readonly segment: number;
  /** Seconds since it was last reached. */
  readonly age: number;
}

export interface SpectrumView {
  readonly element: HTMLElement;
  /** Draws for as long as it runs; only while shown and playing (N-16). */
  run(read: () => Spectrum): void;
  /** Stops drawing and leaves every segment dark. */
  halt(): void;
}

export function createSpectrumView(): SpectrumView {
  const element = document.createElement('div');
  element.className = 'spectrum';
  const canvas = document.createElement('canvas');
  element.append(canvas);
  let frame: number | null = null;
  let peaks: readonly HeldPeak[] = [];
  let last = 0;

  const draw = (lit: readonly number[]) => {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const g = canvas.getContext('2d');
    if (g === null) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);
    const style = getComputedStyle(element);
    const color = (name: string) => style.getPropertyValue(name).trim();
    const [off, low, mid, high] = [color('--cell'), color('--base'), color('--fill'), color('--accent')];
    const gap = 3;
    const rowGap = 1;
    const columnWidth = (width - gap * (BAND_CENTERS.length - 1)) / BAND_CENTERS.length;
    const segmentHeight = (height - rowGap * (SEGMENTS - 1)) / SEGMENTS;
    BAND_CENTERS.forEach((_, band) => {
      const x = band * (columnWidth + gap);
      const peak = Math.round(peaks[band]?.segment ?? 0);
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const y = height - (segment + 1) * segmentHeight - segment * rowGap;
        const on = segment < (lit[band] ?? 0) || segment === peak - 1;
        const top = FLOOR_DB + (segment + 1) * SEGMENT_DB;
        g.fillStyle = !on ? off : top > WARN_DB ? high : top > NEAR_DB ? mid : low;
        g.fillRect(x, y, columnWidth, segmentHeight);
      }
    });
  };

  const halt = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    peaks = [];
    draw([]);
  };

  return {
    element,
    run(read) {
      if (frame !== null) return;
      last = performance.now();
      const tick = (now: number) => {
        const lit = bandLevels(read()).map(litSegments);
        peaks = holdPeaks(peaks, lit, (now - last) / 1000);
        last = now;
        draw(lit);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    },
    halt,
  };
}
