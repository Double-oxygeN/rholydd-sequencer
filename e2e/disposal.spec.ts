import { expect, test } from '@playwright/test';
import { counters, openPage, startPlayback, stopButton } from './support.ts';

interface StarvedWindow {
  readonly starvedIdleCallbacks: number;
}

test('disposes the notes that ended even where idle callbacks never run, as in a hidden tab', async ({ page }) => {
  await page.addInitScript(() => {
    // Queues idle callbacks and never runs them, as Chrome does while the tab is hidden.
    const starved: IdleRequestCallback[] = [];
    Object.defineProperty(window, 'starvedIdleCallbacks', { get: () => starved.length });
    window.requestIdleCallback = (callback) => starved.push(callback);
  });
  await openPage(page);
  await startPlayback(page);
  // A few bars in, many drum hits and notes have ended.
  await expect.poll(async () => Number((await counters(page).textContent())?.match(/(\d+)小節/)?.[1]), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(4);
  await stopButton(page).click();
  expect(await page.evaluate(() => (window as unknown as StarvedWindow).starvedIdleCallbacks)).toBe(0);
});
