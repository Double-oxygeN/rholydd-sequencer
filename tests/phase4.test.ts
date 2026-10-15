import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FINGERPRINT_RUNS, unpitchedFingerprint } from './fingerprint.ts';

// Automated acceptance criteria from docs/specs/phase4/requirements.md.

const PHASE3_UNPITCHED: readonly string[] = JSON.parse(
  readFileSync(new URL('./fixtures/phase3-unpitched.json', import.meta.url), 'utf8'),
);

describe('phase 4 acceptance', () => {
  it('keeps the drums, layouts, keys, sounds and effects of phase 3 for the same seed', () => {
    FINGERPRINT_RUNS.forEach(({ seed, live }, i) => {
      expect(unpitchedFingerprint(seed, live)).toBe(PHASE3_UNPITCHED[i]);
    });
  });
});
