import { AudioLines, LayoutGrid, type IconNode } from 'lucide';
import { iconButton } from './icons.ts';
import { createTabs } from './tabs.ts';

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
  const handlers: ((view: View) => void)[] = [];
  // Wrapped, since each pane is itself a picture for screen readers and cannot also be the tab's panel.
  const wrap = (pane: HTMLElement) => {
    const panel = document.createElement('div');
    panel.append(pane);
    return panel;
  };
  const panels: Readonly<Record<View, HTMLElement>> = { sequencer: wrap(panes.sequencer), spectrum: wrap(panes.spectrum) };
  const tabs = createTabs({
    ids: VIEWS,
    label: '表示',
    button: (view) => iconButton(...VIEW_BUTTON[view]),
    panel: (view) => panels[view],
    initial: 'sequencer',
    onSelect(view) {
      VIEWS.forEach((v) => (panels[v].hidden = v !== view));
      for (const handler of handlers) handler(view);
    },
  });
  tabs.element.className = 'view-tabs';
  element.append(tabs.element, ...VIEWS.map((view) => panels[view]));
  return {
    element,
    current: tabs.current,
    onChange(handler) {
      handlers.push(handler);
    },
  };
}
