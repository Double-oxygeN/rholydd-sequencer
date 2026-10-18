import { expect, test, type Page } from '@playwright/test';
import { openPage } from './support.ts';

const spectrum = (page: Page) => page.getByRole('img', { name: 'スペクトラムアナライザー' });

async function showSpectrum(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openPage(page);
  await page.getByRole('tab', { name: 'スペクトラム' }).click();
  await expect(spectrum(page)).toBeVisible();
}

/** Whether the canvas holds as many pixels as it takes on screen, so that nothing drawn is stretched. */
const fitsItsBox = (page: Page) =>
  spectrum(page).evaluate((canvas: HTMLCanvasElement) => {
    const ratio = window.devicePixelRatio || 1;
    return (
      canvas.width === Math.round(canvas.clientWidth * ratio) && canvas.height === Math.round(canvas.clientHeight * ratio)
    );
  });

/** The colour at the middle of the lowest segment of the lowest band, and the scheme's colour for a dark segment. */
const darkSegment = (page: Page) =>
  spectrum(page).evaluate((canvas: HTMLCanvasElement) => {
    const rgb = (data: Uint8ClampedArray) => `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
    const ratio = window.devicePixelRatio || 1;
    // The same layout as the view draws: 19 bands 3px apart, 48 segments 1px apart.
    const columnWidth = (canvas.clientWidth - 3 * 18) / 19;
    const segmentHeight = (canvas.clientHeight - 47) / 48;
    const x = Math.floor((columnWidth / 2) * ratio);
    const y = Math.floor((canvas.clientHeight - segmentHeight / 2) * ratio);
    const drawn = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
    const swatch = document.createElement('canvas').getContext('2d')!;
    swatch.fillStyle = getComputedStyle(canvas).getPropertyValue('--cell').trim();
    swatch.fillRect(0, 0, 1, 1);
    return { drawn: rgb(drawn), cell: rgb(swatch.getImageData(0, 0, 1, 1).data) };
  });

test('draws the stopped spectrum analyser again at the size it takes once the screen narrows', async ({ page }) => {
  await showSpectrum(page);
  expect(await fitsItsBox(page)).toBe(true);
  await page.setViewportSize({ width: 375, height: 768 });
  await expect(spectrum(page)).toHaveCSS('height', '180px');
  await expect.poll(() => fitsItsBox(page)).toBe(true);
});

test('draws the stopped spectrum analyser again in the colours of a scheme switched to', async ({ page }) => {
  await showSpectrum(page);
  const light = await darkSegment(page);
  expect(light.drawn).toBe(light.cell);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(async () => (await darkSegment(page)).cell).not.toBe(light.cell);
  await expect.poll(async () => {
    const dark = await darkSegment(page);
    return dark.drawn === dark.cell;
  }).toBe(true);
});
