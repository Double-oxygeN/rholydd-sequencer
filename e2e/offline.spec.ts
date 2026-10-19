import { expect, test, type Page } from '@playwright/test';
import { APP_NAME } from '../src/app-name.ts';
import { openMenu, openPage, startPlayback } from './support.ts';

test.use({ serviceWorkers: 'allow' });

/** Opens the page and waits until its service worker has kept every file and taken charge of the page's scope. */
async function openAndKeep(page: Page): Promise<void> {
  await openPage(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test('opens and plays offline once opened before, with no word about the config file', async ({ page, context }) => {
  await openAndKeep(page);
  await context.setOffline(true);
  await page.reload();
  await openPage(page);
  await expect(page.locator('.status')).toHaveText('');
  await startPlayback(page);
});

test('opens a shared link offline, on the seed it carries', async ({ page, context }) => {
  await openAndKeep(page);
  await context.setOffline(true);
  await openPage(page, '?seed=4321');
  await openMenu(page);
  await expect(page.getByLabel('シード', { exact: true })).toHaveValue('4321');
});

test('starts offline from the config file last read online', async ({ page, context, browserName }) => {
  // Only Chromium lets context.route see the requests a service worker sends.
  test.skip(browserName !== 'chromium', 'the config file can only be served to the service worker in Chromium');
  await context.route('**/config.json', (route) => route.fulfill({ json: { params: { bpm: 160 } } }));
  // Opened once only: the first opening is not the service worker's yet, so the worker keeps the file as it installs.
  await openAndKeep(page);
  await context.setOffline(true);
  await page.reload();
  await openPage(page);
  await expect(page.locator('.status')).toHaveText('');
  await openMenu(page);
  await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('160');
});

test('can be added to a home screen, with the icons the manifest names', async ({ page, request }) => {
  await openPage(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).href;
  const response = await request.get(manifestUrl);
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as {
    name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  const base = new URL(page.url()).pathname;
  expect(manifest).toMatchObject({ name: APP_NAME, start_url: base, scope: base, display: 'standalone' });
  expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const { src } of manifest.icons) {
    const icon = await request.get(new URL(src, manifestUrl).href);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type']).toBe('image/png');
  }
});
