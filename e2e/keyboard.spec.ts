import { expect, test, type Page } from '@playwright/test';
import { menu, menuToggle, openMenu, openPage, playButton, shareDialog, shareToggle } from './support.ts';

test('plays and opens and closes the menu and the share dialog with the keyboard alone', async ({ page }) => {
  await openPage(page);
  await page.keyboard.press('Tab');
  await expect(shareToggle(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menuToggle(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(playButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(playButton(page)).toHaveAccessibleName('一時停止');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveClass(/open/);
  await expect(page.getByRole('tab', { name: 'パラメーター' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(menuToggle(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu(page)).not.toHaveClass(/open/);
  await expect(menuToggle(page)).toBeFocused();
  await expect(menuToggle(page)).toHaveAccessibleName('メニューを開く');

  await page.keyboard.press('Shift+Tab');
  await expect(shareToggle(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(shareDialog(page)).toBeVisible();
  await expect(page.getByRole('textbox', { name: '共有する URL' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(shareDialog(page)).toBeHidden();
  await expect(shareToggle(page)).toBeFocused();
});

test('moves between tabs with the arrow keys, and enters and leaves them with one Tab', async ({ page }) => {
  await openPage(page);
  const sequencer = page.getByRole('tab', { name: 'シーケンサー' });
  const spectrum = page.getByRole('tab', { name: 'スペクトラム' });
  await sequencer.focus();
  await page.keyboard.press('ArrowRight');
  await expect(spectrum).toBeFocused();
  await expect(spectrum).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(sequencer).toBeFocused();
  await page.keyboard.press('End');
  await expect(spectrum).toBeFocused();
  // The tabs are the last controls on the page, so they are left backwards and entered again from the volume.
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('slider', { name: '音量' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(spectrum).toBeFocused();
});

/** Whether any of the centre and four inner corners of the focused element shows the element itself. */
const focusInSight = (page: Page) =>
  page.evaluate(() => {
    const focused = document.activeElement;
    if (focused === null || focused === document.body) return true;
    const rect = focused.getBoundingClientRect();
    const inset = Math.min(3, rect.width / 4, rect.height / 4);
    const points: [number, number][] = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + inset, rect.top + inset],
      [rect.right - inset, rect.top + inset],
      [rect.left + inset, rect.bottom - inset],
      [rect.right - inset, rect.bottom - inset],
    ];
    return points.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === focused || focused.contains(hit));
    });
  });

for (const width of [320, 1024, 1280]) {
  test(`never moves the focus under the open menu at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openPage(page);
    await openMenu(page);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
      expect(await focusInSight(page), where).toBe(true);
    }
  });
}
