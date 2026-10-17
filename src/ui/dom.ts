let nextId = 0;

export function field(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const title = document.createElement('span');
  title.className = 'field-label';
  title.id = `field-${nextId++}`;
  title.textContent = label;
  // The label would otherwise name each control after all of its text, the value shown beside a slider included.
  for (const input of control.querySelectorAll('input, select')) {
    if (!input.hasAttribute('aria-label')) input.setAttribute('aria-labelledby', title.id);
  }
  if (control.matches('input, select')) control.setAttribute('aria-labelledby', title.id);
  wrapper.append(title, control);
  return wrapper;
}

/** Shows a slider's value beside it and gives screen readers the same words rather than the bare number. */
export function showValue(input: HTMLInputElement, output: HTMLOutputElement, text: string): void {
  output.textContent = text;
  input.setAttribute('aria-valuetext', text);
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
