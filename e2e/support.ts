import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the page and waits until the drum samples are in, which is when the play button starts anything. */
export async function openPage(page: Page, query = ''): Promise<void> {
  await page.goto(query);
  const status = page.locator('.status');
  await expect(status).toBeAttached();
  await expect(status).not.toHaveText('サンプルを読み込み中…');
}

export const playButton = (page: Page) => page.locator('button.play');
export const stopButton = (page: Page) => page.getByRole('button', { name: '停止', exact: true });
export const counters = (page: Page) => page.locator('.counters');
export const menuToggle = (page: Page) => page.locator('button.menu-toggle');
export const menu = (page: Page) => page.locator('#menu');
export const shareToggle = (page: Page) => page.getByRole('button', { name: '共有', exact: true });
export const shareDialog = (page: Page) => page.getByRole('dialog', { name: '共有' });
export const resetParameters = (page: Page) => page.getByRole('button', { name: 'パラメーターを既定値に戻す' });
export const resetMixer = (page: Page) => page.getByRole('button', { name: 'ミキサーを既定値に戻す' });
/** The word beside a reset button once it has put the values back. */
export const resetStatus = (button: Locator) => button.locator('xpath=..').getByRole('status');

export async function startPlayback(page: Page): Promise<void> {
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(playButton(page)).toHaveAccessibleName('一時停止');
  // Shown once the first step has sounded, so playback has really begun rather than only been asked for.
  await expect(counters(page)).toBeVisible();
}

/** Opens the menu and waits for it to finish sliding in, since anything measured meanwhile is still moving. */
export async function openMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await expect(menu(page)).toHaveClass(/open/);
  const width = page.viewportSize()!.width;
  await expect.poll(async () => {
    const box = await menu(page).boundingBox();
    return box === null ? null : Math.round(box.x + box.width);
  }).toBe(width);
}
