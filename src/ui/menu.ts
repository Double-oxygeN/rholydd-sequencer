import { Menu, X } from 'lucide';
import { iconButton, setIcon } from './icons.ts';
import type { Messages } from './messages.ts';
import { createTabs } from './tabs.ts';

export const MENU_TABS = ['parameters', 'mixer'] as const;
export type MenuTab = (typeof MENU_TABS)[number];

export interface OffCanvasMenu {
  /** The button that opens the menu and, in the same place above it, closes it. */
  readonly toggle: HTMLButtonElement;
  readonly element: HTMLElement;
}

/**
 * The parameters and the mixer, in a panel that slides in from the right over the page, which keeps its width so
 * that the grid and the spectrum do not change shape as the menu opens and closes. Nothing dims the rest of the
 * page, so whatever the menu leaves in sight stays at hand while values change, and only the close button closes
 * it: a stray click on the page must not take the menu away mid-adjustment.
 */
export function createOffCanvasMenu(panes: Readonly<Record<MenuTab, HTMLElement>>, messages: Messages): OffCanvasMenu {
  const element = document.createElement('aside');
  element.className = 'offcanvas';
  element.id = 'menu';
  element.setAttribute('aria-label', messages.menu);
  const tabs = createTabs({
    ids: MENU_TABS,
    label: messages.menuTabs,
    button(tab) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = messages.menuTab[tab];
      return button;
    },
    panel: (tab) => panes[tab],
    initial: 'parameters',
    onSelect: (tab) => MENU_TABS.forEach((t) => (panes[t].hidden = t !== tab)),
  });
  tabs.element.className = 'menu-tabs';
  const body = document.createElement('div');
  body.className = 'menu-body';
  body.append(...MENU_TABS.map((tab) => panes[tab]));
  element.append(tabs.element, body);

  const toggle = iconButton(Menu, messages.openMenu, 'menu-toggle');
  toggle.setAttribute('aria-controls', element.id);
  let covered: readonly HTMLElement[] = [];
  const uncover = () => {
    for (const control of covered) control.inert = false;
    covered = [];
  };
  // A control hidden under the menu would take the focus out of sight, so the keyboard skips whatever it covers.
  const cover = () => {
    uncover();
    covered = coveredControls(element, toggle);
    for (const control of covered) control.inert = true;
  };
  const isOpen = () => element.classList.contains('open');
  const show = (open: boolean) => {
    element.classList.toggle('open', open);
    // Out of reach of the keyboard and screen readers while it is off screen.
    element.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    setIcon(toggle, open ? X : Menu, open ? messages.closeMenu : messages.openMenu);
    if (open) {
      cover();
      tabs.focus();
    } else {
      uncover();
    }
  };
  toggle.addEventListener('click', () => show(!isOpen()));
  window.addEventListener('resize', () => {
    if (isOpen()) cover();
  });
  show(false);
  return { toggle, element };
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/**
 * Controls outside the menu that lie wholly within its width. The menu runs the full height of the window, so the
 * width alone decides; it is taken from where the menu ends up rather than from where it is while sliding in.
 */
function coveredControls(menu: HTMLElement, keep: HTMLElement): HTMLElement[] {
  const right = document.documentElement.clientWidth;
  const left = right - menu.offsetWidth;
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((control) => {
    if (control === keep || menu.contains(control)) return false;
    const rect = control.getBoundingClientRect();
    return rect.width > 0 && rect.left >= left && rect.right <= right;
  });
}
