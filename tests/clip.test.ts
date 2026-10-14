import { describe, expect, it } from 'vitest';
import { createTally, peakDbfs, scanBlock } from '../src/engine/clip.ts';

describe('phase 2 acceptance: clip detection', () => {
  it('counts a single sample just beyond 0 dBFS and nothing below it', () => {
    const block = new Float32Array(128).map((_, i) => 0.9 * Math.sin(i / 5));
    const quiet = createTally();
    scanBlock(block, quiet);
    expect(quiet.clips).toBe(0);
    expect(quiet.peak).toBeLessThan(1);

    const loud = createTally();
    block[77] = -1.0001;
    scanBlock(block, loud);
    expect(loud.clips).toBe(1);
    expect(loud.peak).toBeCloseTo(1.0001);
    expect(peakDbfs(loud.peak)).toBeGreaterThan(0);
  });

  it('accumulates over blocks until the tally is reset', () => {
    const tally = createTally();
    scanBlock([0.2, 1, -0.5], tally);
    scanBlock([1.5, 0.1], tally);
    expect(tally).toEqual({ peak: 1.5, clips: 2 });
  });
});
