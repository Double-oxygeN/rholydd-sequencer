import { Copy, Share2, X } from 'lucide';
import { shareUrl } from '../params/query.ts';
import type { Seed } from '../random/rng.ts';
import { icon, iconButton } from './icons.ts';

export interface ShareDialog {
  /** The button that opens the dialog, beside the menu's. */
  readonly toggle: HTMLButtonElement;
  readonly element: HTMLDialogElement;
}

/**
 * The page's address to copy, with or without the seed. Unlike the menu, a click outside closes it: nothing is being
 * adjusted in it, so closing it loses nothing.
 */
export function createShareDialog(page: string, seedToShare: () => Seed): ShareDialog {
  const element = document.createElement('dialog');
  element.className = 'share';
  element.setAttribute('aria-labelledby', 'share-title');

  const title = document.createElement('h2');
  title.id = 'share-title';
  title.textContent = '共有';
  const close = iconButton(X, '閉じる', 'share-close');
  const header = document.createElement('div');
  header.className = 'share-header';
  header.append(title, close);

  const url = document.createElement('input');
  Object.assign(url, { type: 'text', readOnly: true, spellcheck: false, autofocus: true });
  url.setAttribute('aria-label', '共有する URL');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'share-copy';
  copy.append(icon(Copy), 'コピー');
  const line = document.createElement('div');
  line.className = 'share-url';
  line.append(url, copy);

  const includeSeed = document.createElement('input');
  includeSeed.type = 'checkbox';
  includeSeed.checked = true;
  const includeLabel = document.createElement('label');
  includeLabel.className = 'share-include';
  includeLabel.append(includeSeed, 'シードを含める');

  const status = document.createElement('p');
  status.className = 'share-status';
  status.setAttribute('role', 'status');

  const body = document.createElement('div');
  body.className = 'share-body';
  body.append(header, line, includeLabel, status);
  element.append(body);

  let seed = seedToShare();
  const render = () => {
    url.value = shareUrl(page, includeSeed.checked ? seed : undefined);
    status.textContent = '';
  };
  includeSeed.addEventListener('change', render);
  url.addEventListener('focus', () => url.select());
  copy.addEventListener('click', async () => {
    try {
      // Missing outside secure contexts, such as the dev server opened from a phone by its LAN address.
      if (navigator.clipboard === undefined) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url.value);
      status.textContent = 'コピーしました';
    } catch {
      url.focus();
      url.select();
      status.textContent = '選択した URL をコピーしてください';
    }
  });
  close.addEventListener('click', () => element.close());

  // A modal dialog receives the clicks on its backdrop, while its padding is zero and the contents sit in the body.
  // The press is checked too, so that selecting the URL and letting go outside the dialog keeps it open.
  let pressedOutside = false;
  element.addEventListener('pointerdown', (e) => {
    pressedOutside = e.target === element;
  });
  element.addEventListener('click', (e) => {
    if (pressedOutside && e.target === element) element.close();
    pressedOutside = false;
  });

  const toggle = iconButton(Share2, '共有', 'share-toggle');
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.addEventListener('click', () => {
    // Read on each opening: the seed changes as sessions start and stop.
    seed = seedToShare();
    render();
    element.showModal();
  });
  // Some browsers leave the focus on the page itself once a dialog closes, losing the place on the page.
  element.addEventListener('close', () => toggle.focus());
  return { toggle, element };
}
