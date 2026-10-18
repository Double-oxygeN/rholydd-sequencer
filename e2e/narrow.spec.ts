import { expect, test, type Page } from '@playwright/test';
import { menu, openMenu, openPage, resetMixer, resetParameters, startPlayback } from './support.ts';

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const width of [320, 375]) {
  test(`fits ${width}px wide, with one bar in the sequencer and the menu across the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openPage(page);
    expect(await overflows(page)).toBe(false);
    // Six rows of 16 steps: the bar playing alone.
    await expect(page.locator('.grid-cell:visible')).toHaveCount(6 * 16);

    await startPlayback(page);
    expect(await overflows(page)).toBe(false);

    await openMenu(page);
    await expect.poll(async () => (await menu(page).boundingBox())?.width).toBe(width);
    expect(await overflows(page)).toBe(false);
    for (const button of [resetParameters(page), resetMixer(page)]) {
      if (await button.isHidden()) await page.getByRole('tab', { name: 'ミキサー' }).click();
      // The menu scrolls downwards, so only its width is in question.
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await overflows(page)).toBe(false);
    }
  });
}
