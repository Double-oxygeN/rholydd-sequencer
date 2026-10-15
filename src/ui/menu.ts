import { Menu, X } from 'lucide';
import { iconButton, setIcon } from './icons.ts';

export const MENU_TABS = ['parameters', 'mixer'] as const;
export type MenuTab = (typeof MENU_TABS)[number];

const TAB_LABEL: Readonly<Record<MenuTab, string>> = { parameters: 'パラメーター', mixer: 'ミキサー' };

export interface OffCanvasMenu {
  /** The button that opens the menu and, in the same place above it, closes it. */
  readonly toggle: HTMLButtonElement;
  readonly element: HTMLElement;
}

/**
 * The parameters and the mixer, in a panel that slides in from the right. Nothing covers the page while it is open,
 * so playback stays at hand while values change, and only the close button closes it: a stray click on the page
 * must not take the menu away mid-adjustment.
 */
export function createOffCanvasMenu(panes: Readonly<Record<MenuTab, HTMLElement>>): OffCanvasMenu {
  const element = document.createElement('aside');
  element.className = 'offcanvas';
  element.id = 'menu';
  element.setAttribute('aria-label', 'メニュー');
  const tabs = document.createElement('div');
  tabs.className = 'menu-tabs';
  tabs.setAttribute('role', 'tablist');
  const buttons = MENU_TABS.map((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = TAB_LABEL[tab];
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(tab));
    return button;
  });
  const select = (tab: MenuTab) => {
    MENU_TABS.forEach((t, i) => {
      buttons[i]!.setAttribute('aria-selected', String(t === tab));
      panes[t].hidden = t !== tab;
    });
  };
  tabs.append(...buttons);
  const body = document.createElement('div');
  body.className = 'menu-body';
  body.append(...MENU_TABS.map((tab) => panes[tab]));
  element.append(tabs, body);
  select('parameters');

  const toggle = iconButton(Menu, 'メニューを開く', 'menu-toggle');
  toggle.setAttribute('aria-controls', element.id);
  const show = (open: boolean) => {
    element.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    // Out of reach of the keyboard and screen readers while it is off screen.
    element.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    setIcon(toggle, open ? X : Menu, open ? 'メニューを閉じる' : 'メニューを開く');
  };
  toggle.addEventListener('click', () => show(!element.classList.contains('open')));
  show(false);
  return { toggle, element };
}
