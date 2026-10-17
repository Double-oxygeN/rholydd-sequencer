import { expect, test } from '@playwright/test';
import { menu, menuToggle, openMenu, openPage } from './support.ts';

test('slides in from the right, switches tabs and closes from its button only', async ({ page }) => {
  await openPage(page);
  const viewport = page.viewportSize()!;
  await expect(menu(page)).toBeHidden();

  // Waits until the menu's right edge meets the screen's.
  await openMenu(page);
  await expect(menu(page)).toBeVisible();

  await expect(page.getByRole('tab', { name: 'パラメーター' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('BPM', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'ミキサー' }).click();
  await expect(page.getByRole('tab', { name: 'ミキサー' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('slider', { name: 'キック 音量' })).toBeVisible();
  await expect(page.getByLabel('BPM', { exact: true })).toBeHidden();

  // A click on the page beside the menu leaves it open.
  await page.mouse.click(10, viewport.height - 10);
  await expect(menu(page)).toHaveClass(/open/);

  await menuToggle(page).click();
  await expect(menu(page)).not.toHaveClass(/open/);
  await expect(menu(page)).toBeHidden();
});

test('shows mutes and solos as pressed on their buttons', async ({ page }) => {
  await openPage(page);
  await openMenu(page);
  await page.getByRole('tab', { name: 'ミキサー' }).click();
  const mute = page.getByRole('button', { name: 'スネア ミュート' });
  const solo = page.getByRole('button', { name: 'キック ソロ' });
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await solo.click();
  await expect(solo).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
});
