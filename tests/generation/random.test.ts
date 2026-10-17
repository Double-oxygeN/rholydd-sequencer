import { describe, expect, it } from 'vitest';
import { REL, TAG, createRng, hash, parseSeed, pickWeighted, toSeed } from '../../src/random/rng.ts';

describe('random: hash', () => {
  // Recorded from the first implementation. A change here silently changes every generated beat.
  it('matches the recorded test vectors', () => {
    expect(hash(0)).toBe(1684164658);
    expect(hash(42, TAG.section, 0)).toBe(4172635988);
    expect(hash(42, TAG.section, 1)).toBe(1239985016);
    expect(hash(123, REL.repeat)).toBe(2756766762);
  });
});

describe('random: createRng', () => {
  it('matches the recorded test vectors', () => {
    const vectors: [number, number[]][] = [
      [0, [1664216021, 3479288465, 3033988455, 3613202701]],
      [1, [960850752, 2734082507, 3058966613, 1454546984]],
      [42, [890322987, 2796912455, 4258306155, 1242540590]],
      [0xffffffff, [3823104220, 1358629326, 3404600419, 385091411]],
    ];
    for (const [seed, expected] of vectors) {
      const rng = createRng(toSeed(seed));
      expect(expected.map(() => rng.u32())).toEqual(expected);
    }
  });

  it('produces floats in [0, 1) without an obvious bias', () => {
    const rng = createRng(toSeed(7));
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const x = rng.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]!++;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });
});

describe('random: pickWeighted', () => {
  it('never picks a zero weight and returns undefined when all weights are zero', () => {
    const rng = createRng(toSeed(1));
    for (let i = 0; i < 1000; i++) expect(pickWeighted(rng, [0, 1, 0, 2])).not.toBe(0);
    expect(pickWeighted(rng, [0, 0])).toBeUndefined();
  });
});

describe('random: parseSeed', () => {
  it('accepts only 32-bit unsigned decimal integers', () => {
    expect(parseSeed(' 42 ')).toBe(42);
    expect(parseSeed('4294967295')).toBe(4294967295);
    expect(parseSeed('4294967296')).toBeUndefined();
    expect(parseSeed('-1')).toBeUndefined();
    expect(parseSeed('1.5')).toBeUndefined();
    expect(parseSeed('')).toBeUndefined();
  });
});
