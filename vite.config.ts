import { defineConfig } from 'vitest/config';
import { BASE_PATH } from './tools/base-path.ts';

export default defineConfig(({ command, isPreview }) => ({
  // The dev server stays at the root so that opening it needs no path; the end-to-end tests run on the build.
  base: command === 'build' || isPreview === true ? BASE_PATH : '/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
