export function field(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const title = document.createElement('span');
  title.className = 'field-label';
  title.textContent = label;
  wrapper.append(title, control);
  return wrapper;
}

export function row(...children: HTMLElement[]): HTMLElement {
  const div = document.createElement('div');
  div.className = 'row';
  div.append(...children);
  return div;
}

export function range(min: number, max: number, step: number): HTMLInputElement {
  const el = document.createElement('input');
  Object.assign(el, { type: 'range', min: String(min), max: String(max), step: String(step) });
  return el;
}

export function cell(className: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}
