import { expect, test, type Page } from '@playwright/test';
import { counters, openMenu, openPage, playButton, startPlayback, stopButton } from './support.ts';

/** The session fixes its tempo and key until it stops, pausing included. */
async function expectSessionFields(page: Page, editable: boolean): Promise<void> {
  await openMenu(page);
  for (const label of ['BPM', '初期キー']) {
    if (editable) await expect(page.getByLabel(label, { exact: true })).toBeEnabled();
    else await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  }
  await page.getByRole('button', { name: 'メニューを閉じる' }).click();
}

test('plays, pauses, resumes and stops, with the buttons, the fields and the counters following', async ({ page }) => {
  await openPage(page);
  await expectSessionFields(page, true);

  await startPlayback(page);
  await expect(stopButton(page)).toBeEnabled();
  await expect(counters(page)).toContainText('小節');
  await expect(counters(page)).toContainText('サイクル');
  await expectSessionFields(page, false);

  await playButton(page).click();
  await expect(playButton(page)).toHaveAccessibleName('再開');
  await expect(stopButton(page)).toBeEnabled();
  await expect(counters(page)).toBeVisible();
  await expectSessionFields(page, false);

  await playButton(page).click();
  await expect(playButton(page)).toHaveAccessibleName('一時停止');

  await stopButton(page).click();
  await expect(playButton(page)).toHaveAccessibleName('再生');
  await expect(stopButton(page)).toBeDisabled();
  await expect(counters(page)).toBeHidden();
  await expectSessionFields(page, true);
});

test('shows either the sequencer or the spectrum analyser, never both', async ({ page }) => {
  await openPage(page);
  const sequencer = page.getByRole('img', { name: 'シーケンサー' });
  const spectrum = page.getByRole('img', { name: 'スペクトラムアナライザー' });
  await expect(sequencer).toBeVisible();
  await expect(spectrum).toBeHidden();
  await page.getByRole('tab', { name: 'スペクトラム' }).click();
  await expect(spectrum).toBeVisible();
  await expect(sequencer).toBeHidden();
  await page.getByRole('tab', { name: 'シーケンサー' }).click();
  await expect(sequencer).toBeVisible();
  await expect(spectrum).toBeHidden();
});
