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
  if (!('mediaSession' in navigator)) {
    const session = { metadata: null, playbackState: 'none', setActionHandler: () => {} };
    Object.defineProperty(navigator, 'mediaSession', { value: session });
    (window as unknown as { MediaMetadata: unknown }).MediaMetadata = class {
      constructor(init: object) {
        Object.assign(this, init);
      }
    };
  }
  const session = navigator.mediaSession;
  const register = session.setActionHandler.bind(session);
  session.setActionHandler = (action, handler) => {
    if (handler !== null) handlers[action] = () => handler({ action });
    try {
      register(action, handler);
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
