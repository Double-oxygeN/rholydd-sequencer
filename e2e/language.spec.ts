import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { counters, menu, openPage, playButton } from './support.ts';

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

async function openMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(menu(page)).toHaveClass(/open/);
  const width = page.viewportSize()!.width;
  await expect.poll(async () => {
    const box = await menu(page).boundingBox();
    return box === null ? null : Math.round(box.x + box.width);
  }).toBe(width);
}

test.describe('in a browser asking for English', () => {
  test.use({ locale: 'en-US' });

  test('names the controls in English and marks the page as English', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(playButton(page)).toHaveAccessibleName('Play');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Position in the cycle' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sequencer' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Spectrum' })).toBeVisible();

    await playButton(page).click();
    await expect(playButton(page)).toHaveAccessibleName('Pause');
    await expect(counters(page)).toContainText(/Bar \d+/);
    await expect(counters(page)).toContainText(/Cycle \d+/);

    await openMenu(page);
    await expect(page.getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Starting key', { exact: true })).toContainText('F minor');
    await expect(page.getByRole('slider', { name: '2-bar variation', exact: true })).toHaveAttribute('aria-valuetext', /^\d+%$/);
    await expect(page.getByRole('button', { name: 'Reset parameters' })).toBeVisible();
    await page.getByRole('tab', { name: 'Mixer' }).click();
    await expect(page.getByRole('slider', { name: 'Kick level' })).toHaveAttribute('aria-valuetext', /dB$/);
    await page.getByRole('button', { name: 'Snare mute' }).click();
    await page.getByRole('button', { name: 'Reset mixer' }).click();
    await expect(page.getByRole('button', { name: 'Reset mixer' }).locator('xpath=..').getByRole('status')).toHaveText(
      'Back to the defaults',
    );
    await page.getByRole('button', { name: 'Close menu' }).click();

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Share' });
    await expect(dialog.getByRole('textbox', { name: 'URL to share' })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Include the seed' })).toBeChecked();
  });

  test('finds nothing to report in English', async ({ page }) => {
    await openPage(page);
    expect(await violations(page)).toEqual([]);
    await playButton(page).click();
    await expect(counters(page)).toBeVisible();
    await openMenu(page);
    expect(await violations(page)).toEqual([]);
    await page.getByRole('tab', { name: 'Mixer' }).click();
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Close menu' }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    expect(await violations(page)).toEqual([]);
  });

  for (const width of [320, 375]) {
    test(`fits ${width}px wide in English`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await openPage(page);
      await playButton(page).click();
      await expect(counters(page)).toBeVisible();
      expect(await overflows(page)).toBe(false);
      await openMenu(page);
      expect(await overflows(page)).toBe(false);
      await page.getByRole('tab', { name: 'Mixer' }).click();
      expect(await overflows(page)).toBe(false);
      await page.getByRole('button', { name: 'Close menu' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Share' })).toBeInViewport({ ratio: 1 });
      expect(await overflows(page)).toBe(false);
    });
  }
});

test.describe('in a browser asking for neither Japanese nor English', () => {
  test.use({ locale: 'fr-FR' });

  test('speaks English', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(playButton(page)).toHaveAccessibleName('Play');
  });
});

test.describe('in a browser asking for Japanese', () => {
  test.use({ locale: 'ja-JP' });

  test('speaks Japanese and marks the page as Japanese', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(playButton(page)).toHaveAccessibleName('再生');
  });
});
