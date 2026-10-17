import { defineConfig } from 'vitest/config';
import { BASE_PATH } from './tools/base-path.ts';
import { devCertificate } from './tools/dev-certificate.ts';

export default defineConfig(({ command, isPreview, mode }) => ({
  // The dev server stays at the root so that opening it needs no path; the end-to-end tests run on the build.
  base: command === 'build' || isPreview === true ? BASE_PATH : '/',
  // `--mode https` serves to the LAN over https, for trying the page on phones (see tools/dev-certificate.ts).
  ...(mode === 'https' && command === 'serve' ? { server: { host: true, https: devCertificate() } } : {}),
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The property tests generate up to 8192 bars per seed; CI runners with fewer cores took over the 5 s default.
    testTimeout: 30_000,
  },
}));
