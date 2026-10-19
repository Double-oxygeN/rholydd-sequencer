import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openMenu, openPage, resetMixer, shareDialog, shareToggle, startPlayback } from './support.ts';

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

test('finds nothing to report on the page as it opens', async ({ page }) => {
  await openPage(page);
  expect(await violations(page)).toEqual([]);
});

test('finds nothing to report while playing', async ({ page }) => {
  await openPage(page);
  await startPlayback(page);
  expect(await violations(page)).toEqual([]);
});

test('finds nothing to report with the menu open', async ({ page }) => {
  await openPage(page);
  await openMenu(page);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('tab', { name: 'ミキサー' }).click();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'キック ミュート' }).click();
  await resetMixer(page).click();
  expect(await violations(page)).toEqual([]);
});

test('finds nothing to report with the share dialog open', async ({ page }) => {
  await openPage(page);
  await shareToggle(page).click();
  await expect(shareDialog(page)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
