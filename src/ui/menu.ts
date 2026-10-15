/** A section kept out of the way until asked for: closed when the page opens, so the screen leaves the music be. */
export function createMenu(title: string, content: HTMLElement): HTMLElement {
  const details = document.createElement('details');
  details.className = 'menu';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary, content);
  return details;
}
