import { describe, expect, it } from 'vitest';

// Fails on purpose, to see CI turn red on a pull request. Never merged.
describe('ci failure check', () => {
  it('fails', () => {
    expect(1).toBe(2);
  });
});
