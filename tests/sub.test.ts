import { describe, expect, it } from 'vitest';
import { stylePlan } from '../src/generators/line.ts';
import { HIGHEST_PITCH, LOWEST_PITCH, subPitch } from '../src/generators/sub/pitch.ts';
import { SUB_STYLES, attackChance } from '../src/generators/sub/styles.ts';
import { ALL_STEPS, type Step } from '../src/generators/types.ts';
import { TAG, hash } from '../src/random/rng.ts';
import { ALL_KEYS, KEY_NAMES, TONIC, degreeOf, parseKey, shiftDegree } from '../src/structure/key.ts';

describe('key', () => {
  it('parses note names with sharps, flats and enharmonic spellings', () => {
    expect(parseKey('F')).toBe(5);
    expect(parseKey('F#')).toBe(6);
    expect(parseKey('G♭')).toBe(6);
    expect(parseKey('Bb')).toBe(10);
    expect(parseKey('D#')).toBe(3);
    expect(parseKey('H')).toBeUndefined();
    for (const [key, name] of KEY_NAMES.entries()) expect(parseKey(name)).toBe(key);
  });

  it('wraps scale degrees within the octave', () => {
    expect(shiftDegree(TONIC, 7)).toBe(0);
    expect(shiftDegree(shiftDegree(TONIC, 5), 4)).toBe(2);
    expect(shiftDegree(TONIC, -1)).toBe(6);
  });
});

describe('subPitch', () => {
  it('folds the tonic of every key into F1 to E2 and jumps an octave up on request', () => {
    for (const key of ALL_KEYS) {
      const low = subPitch(key, TONIC, false);
      expect(low).toBeGreaterThanOrEqual(LOWEST_PITCH);
      expect(low).toBeLessThan(LOWEST_PITCH + 12);
      expect(subPitch(key, TONIC, true)).toBe(low + 12);
      expect(subPitch(key, TONIC, true)).toBeLessThanOrEqual(HIGHEST_PITCH);
      expect(degreeOf(key, low)).toBe(TONIC);
    }
    expect(subPitch(parseKey('F')!, TONIC, false)).toBe(29);
  });
});

describe('sub styles', () => {
  it('always strikes step 0 and never re-strikes a tied step', () => {
    for (const style of SUB_STYLES) {
      expect(attackChance(style, 0 as Step, false)).toBe(1);
    }
    expect(attackChance('push', 16 as Step, true)).toBe(0);
  });

  it('lets long and tresillo ignore the kick while kick-follow plays only on kicks', () => {
    for (const step of ALL_STEPS.slice(1)) {
      expect(attackChance('long', step, true)).toBe(attackChance('long', step, false));
      expect(attackChance('tresillo', step, true)).toBe(attackChance('tresillo', step, false));
      expect(attackChance('kickFollow', step, true)).toBe(1);
      expect(attackChance('kickFollow', step, false)).toBe(0);
    }
  });

  it('picks every style for A and a different one for B', () => {
    const mains = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const plan = stylePlan({ cycle: hash(i), phrase: hash(i, 1) }, TAG.subStyle, SUB_STYLES);
      mains.add(plan.main);
      expect(plan.transition).not.toBe(plan.main);
    }
    expect([...mains].sort()).toEqual([...SUB_STYLES].sort());
  });
});
