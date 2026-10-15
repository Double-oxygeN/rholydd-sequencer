import { AudioLines, LayoutGrid, type IconNode } from 'lucide';
import { iconButton } from './icons.ts';

/** What fills the main area: the step grid or the spectrum, never both, to keep the screen to one picture. */
export const VIEWS = ['sequencer', 'spectrum'] as const;
export type View = (typeof VIEWS)[number];

const VIEW_BUTTON: Readonly<Record<View, readonly [IconNode, string]>> = {
  sequencer: [LayoutGrid, 'シーケンサー'],
  spectrum: [AudioLines, 'スペクトラム'],
};

export interface Views {
  readonly element: HTMLElement;
  current(): View;
  onChange(handler: (view: View) => void): void;
}

export function createViews(panes: Readonly<Record<View, HTMLElement>>): Views {
  const element = document.createElement('section');
  element.className = 'views';
  const tabs = document.createElement('div');
  tabs.className = 'view-tabs';
  tabs.setAttribute('role', 'tablist');
  let current: View = 'sequencer';
  const handlers: ((view: View) => void)[] = [];
  const buttons = VIEWS.map((view) => {
    const button = iconButton(...VIEW_BUTTON[view]);
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(view));
    return button;
  });
  const select = (view: View) => {
    current = view;
    VIEWS.forEach((v, i) => {
      buttons[i]!.setAttribute('aria-selected', String(v === view));
      panes[v].hidden = v !== view;
    });
    for (const handler of handlers) handler(view);
  };
  tabs.append(...buttons);
  element.append(tabs, ...VIEWS.map((view) => panes[view]));
  select(current);
  return {
    element,
    current: () => current,
    onChange(handler) {
      handlers.push(handler);
    },
  };
}
