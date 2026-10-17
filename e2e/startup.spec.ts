import { expect, test } from '@playwright/test';
import { openMenu, openPage } from './support.ts';

test('starts from the seed in the query string', async ({ page }) => {
  await openPage(page, '?seed=12345');
  await openMenu(page);
  await expect(page.getByLabel('シード', { exact: true })).toHaveValue('12345');
});

test('falls back on a random seed when the query string holds no valid one', async ({ page }) => {
  await openPage(page, '?seed=4294967296');
  await openMenu(page);
  const seed = page.getByLabel('シード', { exact: true });
  await expect(seed).toHaveValue(/^\d+$/);
  await expect(seed).not.toHaveValue('4294967296');
});

test('starts from the values a config file gives', async ({ page }) => {
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { params: { bpm: 160, m2: 0.9 }, mixer: { kick: { muted: true } } } }),
  );
  await openPage(page);
  await expect(page.locator('.status')).toHaveText('');
  await openMenu(page);
  await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('160');
  await expect(page.getByRole('slider', { name: '2bar 変化率', exact: true })).toHaveValue('0.9');
  await page.getByRole('tab', { name: 'ミキサー' }).click();
  await expect(page.getByRole('button', { name: 'キック ミュート' })).toHaveAttribute('aria-pressed', 'true');
});

test('starts from the defaults with a word in the status line when the config file is broken', async ({ page }) => {
  await page.route('**/config.json', (route) => route.fulfill({ contentType: 'application/json', body: '{"params": ' }));
  await openPage(page);
  await expect(page.getByRole('status').filter({ hasText: '設定ファイル' })).toBeVisible();
  await expect(page.getByRole('button', { name: '再生', exact: true })).toBeEnabled();
});
