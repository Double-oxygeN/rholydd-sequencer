import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  menu,
  menuToggle,
  openMenu,
  openPage,
  playButton,
  resetMixer,
  resetParameters,
  shareDialog,
  shareToggle,
} from './support.ts';

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

/** Presses Tab until the control has the focus, as many times as there are controls on the way at most. */
async function tabTo(page: Page, target: Locator, most: number): Promise<void> {
  for (let i = 0; i < most; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('reaches both resets with Tab and keeps the focus on them once pressed', async ({ page }) => {
  await openPage(page);
  await openMenu(page);
  const m2 = page.getByRole('slider', { name: '2bar 変化率', exact: true });
  const m2Before = await m2.inputValue();
  await m2.focus();
  await page.keyboard.press('ArrowRight');
  await tabTo(page, resetParameters(page), 10);
  await page.keyboard.press('Enter');
  await expect(m2).toHaveValue(m2Before);
  await expect(resetParameters(page)).toBeFocused();
  await expect(resetParameters(page)).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('tab', { name: 'パラメーター' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'ミキサー' })).toHaveAttribute('aria-selected', 'true');
  const mute = page.getByRole('button', { name: 'リバーブ ミュート' });
  await mute.focus();
  await page.keyboard.press('Enter');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await tabTo(page, resetMixer(page), 5);
  await page.keyboard.press('Space');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(resetMixer(page)).toBeFocused();
});

for (const [channel, before] of [['シンバル', 'ゴースト']]) {
  test(`reaches the slider and the buttons of the ${channel} row with Tab alone`, async ({ page }) => {
    await openPage(page);
    await openMenu(page);
    await page.getByRole('tab', { name: 'パラメーター' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: `${before} ソロ` }).focus();
    for (const target of [
      page.getByRole('slider', { name: `${channel} 音量` }),
      page.getByRole('button', { name: `${channel} ミュート` }),
      page.getByRole('button', { name: `${channel} ソロ` }),
    ]) {
      await tabTo(page, target, 3);
    }
  });
}

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
