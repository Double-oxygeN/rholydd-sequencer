let nextId = 0;

export interface TabsOptions<T extends string> {
  readonly ids: readonly T[];
  /** Names the row of tabs for screen readers. */
  readonly label: string;
  readonly button: (id: T) => HTMLButtonElement;
  /** The pane each tab shows. A shared pane, as in the mixer, is given for every tab. */
  readonly panel: (id: T) => HTMLElement;
  readonly initial: T;
  readonly onSelect: (id: T) => void;
}

export interface Tabs<T extends string> {
  readonly element: HTMLElement;
  current(): T;
  /** Moves the keyboard focus to the selected tab. */
  focus(): void;
}

const NEXT: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * A row of tabs that Tab enters and leaves in one step, with the arrow keys moving between the tabs. Moving selects
 * too: a tab only swaps what is shown, so there is nothing to confirm before it takes effect.
 */
export function createTabs<T extends string>({ ids, label, button, panel, initial, onSelect }: TabsOptions<T>): Tabs<T> {
  const element = document.createElement('div');
  element.setAttribute('role', 'tablist');
  element.setAttribute('aria-label', label);
  const prefix = `tabs-${nextId++}`;
  const buttons = ids.map((id) => {
    const tab = button(id);
    tab.id = `${prefix}-${id}`;
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => select(id));
    return tab;
  });
  const panels = ids.map(panel);
  panels.forEach((pane, i) => {
    pane.setAttribute('role', 'tabpanel');
    pane.id ||= `${prefix}-${ids[i]}-panel`;
    buttons[i]!.setAttribute('aria-controls', pane.id);
  });
  let current = initial;
  const select = (id: T) => {
    current = id;
    ids.forEach((other, i) => {
      const on = other === id;
      buttons[i]!.setAttribute('aria-selected', String(on));
      buttons[i]!.tabIndex = on ? 0 : -1;
      if (on) panels[i]!.setAttribute('aria-labelledby', buttons[i]!.id);
    });
    onSelect(id);
  };
  element.addEventListener('keydown', (event) => {
    const next = NEXT[event.key];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (next === undefined || index < 0) return;
    event.preventDefault();
    const id = ids[next(index, ids.length)]!;
    select(id);
    buttons[ids.indexOf(id)]!.focus();
  });
  element.append(...buttons);
  select(initial);
  return {
    element,
    current: () => current,
    focus: () => buttons[ids.indexOf(current)]!.focus(),
  };
}
