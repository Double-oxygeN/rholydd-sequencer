import { expect, test } from '@playwright/test';
import { APP_NAME } from '../src/app-name.ts';
import { counters, menuToggle, openPage, shareToggle, stopButton } from './support.ts';

test('names the page and shows the controls, the meters and the sequencer, with stop unavailable', async ({ page }) => {
  await openPage(page);
  await expect(page).toHaveTitle(APP_NAME);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_NAME);
  await expect(page.getByRole('button', { name: '再生', exact: true })).toBeEnabled();
  await expect(stopButton(page)).toBeDisabled();
  await expect(page.getByRole('slider', { name: '音量' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'サイクルの位置' })).toBeVisible();
  await expect(page.getByRole('img', { name: '8小節の位置' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'シーケンサー' })).toBeVisible();
  await expect(shareToggle(page)).toBeVisible();
  await expect(menuToggle(page)).toHaveAccessibleName('メニューを開く');
  await expect(counters(page)).toBeHidden();
});
