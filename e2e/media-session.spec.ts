import { expect, test, type Page } from '@playwright/test';
import { APP_NAME } from '../src/app-name.ts';
import { openPage, playButton, startPlayback } from './support.ts';

type MediaAction = 'play' | 'pause' | 'stop';

/**
 * Keeps the handlers the page registers, as the OS would call them. Browsers without the Media Session API get a
 * stand-in of the same shape, so that the page's side can be checked everywhere.
 */
function recordHandlers(): void {
  const handlers: Record<string, () => void> = {};
  (window as unknown as { mediaHandlers: typeof handlers }).mediaHandlers = handlers;
  const keep = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    if (handler !== null) handlers[action] = () => handler({ action });
  };
  if (!('mediaSession' in navigator)) {
    const session = { metadata: null, playbackState: 'none', setActionHandler: keep };
    Object.defineProperty(navigator, 'mediaSession', { value: session });
    (window as unknown as { MediaMetadata: unknown }).MediaMetadata = class {
      constructor(init: object) {
        Object.assign(this, init);
      }
    };
    return;
  }
  // Wrapped on the prototype: WebKit never called a wrapper set on the session object itself.
  const register = MediaSession.prototype.setActionHandler;
  MediaSession.prototype.setActionHandler = function (this: MediaSession, action, handler) {
    keep(action, handler);
    try {
      register.call(this, action, handler);
    } catch {
      // The page itself copes with actions a browser does not know.
    }
  };
}

const press = (page: Page, action: MediaAction) =>
  page.evaluate((a) => (window as unknown as { mediaHandlers: Record<string, () => void> }).mediaHandlers[a]!(), action);

test('changes playback as the buttons would when the OS sends play, pause and stop', async ({ page }) => {
  await page.addInitScript(recordHandlers);
  await openPage(page);
  // A click first, since browsers only let audio start from a user gesture.
  await startPlayback(page);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(APP_NAME);

  await press(page, 'pause');
  await expect(playButton(page)).toHaveAccessibleName('再開');
  await press(page, 'play');
  await expect(playButton(page)).toHaveAccessibleName('一時停止');
  await press(page, 'stop');
  await expect(playButton(page)).toHaveAccessibleName('再生');
  await press(page, 'play');
  await expect(playButton(page)).toHaveAccessibleName('一時停止');
});

test('shows the app icon in two sizes beside the title while playing', async ({ page }) => {
  await page.addInitScript(recordHandlers);
  await openPage(page);
  await startPlayback(page);
  const artwork = await page.evaluate(() =>
    (navigator.mediaSession.metadata?.artwork ?? []).map(({ src, sizes, type }) => ({ src, sizes, type })),
  );
  expect(artwork.map(({ sizes, type }) => ({ sizes, type }))).toEqual([
    { sizes: '192x192', type: 'image/png' },
    { sizes: '512x512', type: 'image/png' },
  ]);
  for (const { src } of artwork) {
    const response = await page.request.get(new URL(src, page.url()).href);
    expect(response.status(), src).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
});
