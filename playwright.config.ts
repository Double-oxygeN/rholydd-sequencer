import { defineConfig, devices } from '@playwright/test';
import { BASE_PATH } from './tools/base-path.ts';

const PORT = 4173;
const CI = process.env.CI !== undefined;
// The tests find the controls by their Japanese names, which must not change with the language of the machine.
const LOCALE = 'ja-JP';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  // A retry would hide a test that passes only sometimes, which is a test to fix.
  retries: 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: LOCALE,
        // Keeps the AudioContext running on machines with no audio output, as on CI.
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], locale: LOCALE } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], locale: LOCALE } },
  ],
  // Serves the build in dist, which `npm run e2e` makes first and CI hands over from its build job.
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !CI,
  },
});
