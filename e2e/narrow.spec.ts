import { expect, test, type Page } from '@playwright/test';
import { menu, menuToggle, openMenu, openPage, resetMixer, resetParameters, shareToggle, startPlayback } from './support.ts';

const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const width of [320, 375]) {
  test(`fits ${width}px wide, with one bar in the sequencer and the menu across the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openPage(page);
    expect(await overflows(page)).toBe(false);
    // Seven rows of 16 steps: the bar playing alone.
    const cells = page.locator('.grid-cell:visible');
    await expect(cells).toHaveCount(7 * 16);
    // Wide enough to tell one cell from the next.
    for (const box of await cells.evaluateAll((all) => all.map((cell) => cell.getBoundingClientRect().width))) {
      expect(box).toBeGreaterThanOrEqual(8);
    }

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

for (const width of [320, 360, 375, 1280]) {
  test(`shows the logo, the whole heading and the share and menu buttons apart at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openPage(page);
    const logo = page.locator('h1 img');
    const parts = { logo, name: page.locator('h1 span'), share: shareToggle(page), menu: menuToggle(page) };
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    for (const part of Object.values(parts)) await expect(part).toBeInViewport({ ratio: 1 });
    // The heading wraps between its words when it must, but never cuts any of them short.
    expect(await page.locator('h1').evaluate((h1) => h1.scrollWidth <= h1.clientWidth)).toBe(true);
    const boxes = Object.entries(parts).map(async ([name, part]) => [name, (await part.boundingBox())!] as const);
    const placed = await Promise.all(boxes);
    for (const [i, [a, boxA]] of placed.entries()) {
      for (const [b, boxB] of placed.slice(i + 1)) {
        const apart =
          boxA.x + boxA.width <= boxB.x ||
          boxB.x + boxB.width <= boxA.x ||
          boxA.y + boxA.height <= boxB.y ||
          boxB.y + boxB.height <= boxA.y;
        expect(apart, `${a} and ${b}`).toBe(true);
      }
    }
  });
}
