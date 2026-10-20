import { expect, test } from '@playwright/test';
import { menu, menuToggle, openMenu, openPage, resetMixer, resetParameters, resetStatus } from './support.ts';

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

for (const channel of ['シンバル']) {
  test(`has a row for the ${channel} channel, telling its mute and solo`, async ({ page }) => {
    await openPage(page);
    await openMenu(page);
    await page.getByRole('tab', { name: 'ミキサー' }).click();
    await expect(page.getByRole('slider', { name: `${channel} 音量` })).toBeVisible();
    for (const control of ['ミュート', 'ソロ']) {
      const button = page.getByRole('button', { name: `${channel} ${control}` });
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  });
}

test('puts the parameters back to the values the page opened with, unavailable while they are there', async ({ page }) => {
  await openPage(page);
  await openMenu(page);
  const reset = resetParameters(page);
  const m2 = page.getByRole('slider', { name: '2bar 変化率', exact: true });
  const fill = page.getByRole('slider', { name: 'フィル強度', exact: true });
  const bpm = page.getByLabel('BPM', { exact: true });
  const [m2Before, fillBefore] = [await m2.inputValue(), await fill.inputValue()];
  await expect(reset).toHaveAttribute('aria-disabled', 'true');

  await m2.fill('0.9');
  await fill.fill('0.05');
  await bpm.fill('170');
  await bpm.dispatchEvent('change');
  await expect(reset).toHaveAttribute('aria-disabled', 'false');
  await reset.click();
  await expect(m2).toHaveValue(m2Before);
  await expect(fill).toHaveValue(fillBefore);
  await expect(bpm).toHaveValue('170');
  await expect(reset).toHaveAttribute('aria-disabled', 'true');
  await expect(resetStatus(reset)).toHaveText('既定値に戻しました');

  // Pressed while unavailable, it does nothing; moved again, the word goes.
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(m2).toHaveValue(m2Before);
  await m2.fill('0.5');
  await expect(resetStatus(reset)).toHaveText('');
});

test('puts the mixer and the ducking back, leaving the volume as it is', async ({ page }) => {
  await openPage(page);
  const volume = page.getByRole('slider', { name: '音量', exact: true });
  await volume.fill('0.2');
  await openMenu(page);
  await page.getByRole('tab', { name: 'ミキサー' }).click();
  const reset = resetMixer(page);
  await expect(reset).toHaveAttribute('aria-disabled', 'true');

  const kick = page.getByRole('slider', { name: 'キック 音量' });
  const mute = page.getByRole('button', { name: 'スネア ミュート' });
  const solo = page.getByRole('button', { name: 'キック ソロ' });
  const depth = page.getByRole('slider', { name: 'ダッキング量' });
  const depthBefore = await depth.inputValue();
  await kick.fill('-10');
  await mute.click();
  await solo.click();
  await depth.fill('0.1');
  await reset.click();
  await expect(kick).toHaveValue('0');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(solo).toHaveAttribute('aria-pressed', 'false');
  await expect(depth).toHaveValue(depthBefore);
  await expect(volume).toHaveValue('0.2');
  await expect(reset).toHaveAttribute('aria-disabled', 'true');
  await expect(resetStatus(reset)).toHaveText('既定値に戻しました');

  // The volume is no value of the mixer's, so moving it leaves the word.
  await volume.fill('0.3');
  await expect(resetStatus(reset)).toHaveText('既定値に戻しました');
  await mute.click();
  await expect(resetStatus(reset)).toHaveText('');
});
