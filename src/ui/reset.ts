import { isReset, resetValues, type ResetScope } from '../params/reset.ts';
import type { ParamStore } from '../params/store.ts';
import type { Messages } from './messages.ts';

/**
 * Puts one tab's values back at once, from any playback state, taking effect as the controls themselves would. It
 * asks for no confirmation and offers no undo: a dialog would be modal, unlike the menu, and a mistaken press is heard
 * straight away. Unavailable is told with aria-disabled rather than disabled, which would drop the focus from the
 * button just pressed and send the keyboard back to the top of the page.
 */
export function createResetButton(store: ParamStore, scope: ResetScope, messages: Messages): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = messages.reset[scope];
  const status = document.createElement('p');
  status.className = 'reset-status';
  // In the page from the start, so that screen readers read out what is written into it later.
  status.setAttribute('role', 'status');
  const atDefaults = () => isReset(scope, store.get(), store.initial);
  button.addEventListener('click', () => {
    if (atDefaults()) return;
    store.update(resetValues(scope, store.initial));
    status.textContent = messages.resetDone;
  });
  const render = () => {
    const unavailable = atDefaults();
    button.setAttribute('aria-disabled', String(unavailable));
    // Only a move of this tab's values takes the word away, not the volume or the other tab.
    if (!unavailable) status.textContent = '';
  };
  store.subscribe(render);
  render();
  const element = document.createElement('div');
  element.className = 'reset';
  element.append(button, status);
  return element;
}
