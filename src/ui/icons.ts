import { createElement, type IconNode } from 'lucide';

/** An icon that only decorates: the control around it carries the name that screen readers read. */
export function icon(node: IconNode): SVGElement {
  return createElement(node, { 'aria-hidden': 'true', class: 'icon', width: 20, height: 20 });
}

/** A button showing only an icon, named for tooltips and screen readers. */
export function iconButton(node: IconNode, label: string, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button ${className}`.trim();
  setIcon(button, node, label);
  return button;
}

/** Swaps a button's icon and name together, so that what it shows and what it says never disagree. */
export function setIcon(button: HTMLButtonElement, node: IconNode, label: string): void {
  button.replaceChildren(icon(node));
  button.title = label;
  button.setAttribute('aria-label', label);
}
