import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const DIRECTORIES = ['src', 'tools', 'tests', 'e2e'];
const FILES = ['index.html', 'vite.config.ts', 'playwright.config.ts'];

function filesUnder(directory: string): string[] {
  try {
    return readdirSync(new URL(directory, ROOT), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `${entry.parentPath.slice(new URL(ROOT).pathname.length)}/${entry.name}`);
  } catch {
    return [];
  }
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(new URL(path, ROOT), 'utf8');
  } catch {
    return null;
  }
}

const sources = [...DIRECTORIES.flatMap(filesUnder).filter((path) => !path.includes('/fixtures/')), ...FILES];

// Built from character classes, so that this file never matches its own patterns.
const PHASE_WORDS = [/\b[FN]-[0-9]+\b/, /\b[P]hase ?[0-9]/i, /\bM[V]P\b/, new RegExp('\u30d5\u30a7\u30fc\u30ba')];

describe('conventions', () => {
  // The phase documents and their numbers are gone once the specs are rewritten by area, so a comment or a name
  // that leans on them would explain nothing.
  it('never names a phase or a requirement number in the code, the tools or the tests', () => {
    const found = sources.flatMap((path) => {
      const text = readIfPresent(path) ?? '';
      return text
        .split('\n')
        .flatMap((line, i) => (PHASE_WORDS.some((word) => word.test(line)) ? [`${path}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(found).toEqual([]);
  });

  it('names no test file after a phase', () => {
    const named = [...filesUnder('tests'), ...filesUnder('e2e')].filter((path) => /[p]hase|m[v]p/i.test(path));
    expect(named).toEqual([]);
  });
});
