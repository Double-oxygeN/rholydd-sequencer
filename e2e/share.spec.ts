import { expect, test, type Page } from '@playwright/test';
import { openMenu, openPage, shareDialog, shareToggle, startPlayback } from './support.ts';

const urlField = (page: Page) => page.getByRole('textbox', { name: '共有する URL' });

async function seedField(page: Page): Promise<string> {
  await openMenu(page);
  const seed = await page.getByLabel('シード', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'メニューを閉じる' }).click();
  return seed;
}

test('shares the page with or without the seed', async ({ page, baseURL }) => {
  await openPage(page);
  const seed = await seedField(page);
  await shareToggle(page).click();
  await expect(shareDialog(page)).toBeVisible();
  await expect(urlField(page)).toHaveValue(`${baseURL}?seed=${seed}`);
  await page.getByRole('checkbox', { name: 'シードを含める' }).uncheck();
  await expect(urlField(page)).toHaveValue(baseURL!);
});

test('shares the seed playing rather than one typed in since', async ({ page, baseURL }) => {
  await openPage(page, '?seed=777');
  await startPlayback(page);
  await openMenu(page);
  await page.getByLabel('シード', { exact: true }).fill('888');
  await page.getByRole('button', { name: 'メニューを閉じる' }).click();
  await shareToggle(page).click();
  await expect(urlField(page)).toHaveValue(`${baseURL}?seed=777`);
});

test('closes on a click outside, on its close button and on Escape', async ({ page }) => {
  await openPage(page);
  const dialog = shareDialog(page);

  await shareToggle(page).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  await shareToggle(page).click();
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toBeHidden();

  await shareToggle(page).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('copies the address, or selects it where the clipboard is out of reach', async ({ page, context, browserName }) => {
  // Only Chromium lets a test grant reading the clipboard back.
  const readable = browserName === 'chromium';
  if (readable) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openPage(page);
  await shareToggle(page).click();
  const url = await urlField(page).inputValue();
  await shareDialog(page).getByRole('button', { name: 'コピー' }).click();
  const status = shareDialog(page).getByRole('status');
  if (readable) {
    await expect(status).toHaveText('コピーしました');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  } else {
    await expect(status).toHaveText(/^(コピーしました|選択した URL をコピーしてください)$/);
  }
});
