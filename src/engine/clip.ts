/** Name the AudioWorklet registers its processor under. Kept here so that the page never loads the worklet code. */
export const CLIP_METER_NAME = 'clip-meter';

/** What the AudioWorklet posts about the last stretch of audio. */
export interface LevelReport {
  readonly peak: number;
  readonly clips: number;
}

/** Full scale. A sample at or beyond it clips once it leaves the browser as fixed-point audio. */
export const FULL_SCALE = 1;

/** What the clip detector has seen since it last reported. Mutated in place: the audio thread must not allocate. */
export interface Tally {
  /** Largest absolute sample value. */
  peak: number;
  /** Number of samples at or beyond full scale. */
  clips: number;
}

export function createTally(): Tally {
  return { peak: 0, clips: 0 };
}

/** Looks at every sample, so that no peak between two meter readings can slip past. */
export function scanBlock(samples: ArrayLike<number>, tally: Tally): void {
  for (let i = 0; i < samples.length; i++) {
    const level = Math.abs(samples[i] ?? 0);
    if (level > tally.peak) tally.peak = level;
    if (level >= FULL_SCALE) tally.clips++;
  }
}

/** Peak in dBFS, or −Infinity for silence. */
export function peakDbfs(peak: number): number {
  return 20 * Math.log10(peak);
}
