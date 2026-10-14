import { STEPS_PER_BAR, type Step } from '../generators/types.ts';
import { BARS_PER_PAIR, PAIRS_PER_SECTION, SECTIONS_PER_PHRASE, type SectionIn32 } from '../structure/form.ts';
import type { Context } from '../structure/conductor.ts';

const BARS_PER_SECTION = BARS_PER_PAIR * PAIRS_PER_SECTION;
const BARS_PER_PHRASE = BARS_PER_SECTION * SECTIONS_PER_PHRASE;

const SECTION_LABEL: Readonly<Record<SectionIn32, string>> = { 0: 'A', 1: "A'", 2: 'B', 3: "A''" };

export interface PositionView {
  readonly element: HTMLElement;
  show(ctx: Context, step: Step): void;
  clear(): void;
}

export function createPositionView(): PositionView {
  const element = document.createElement('div');
  element.className = 'position';
  const meters = [meter('8bar', BARS_PER_SECTION), meter('32bar', BARS_PER_PHRASE)];
  const total = document.createElement('div');
  total.className = 'position-total';
  element.append(...meters.map((m) => m.element), total);

  const clear = () => {
    for (const m of meters) m.set(null);
    total.textContent = '停止中';
  };
  clear();

  return {
    element,
    show(ctx, step) {
      const bar = ctx.bar + Math.floor(step / STEPS_PER_BAR);
      const inSection = bar % BARS_PER_SECTION;
      const { sectionIn32 } = ctx.sectionRole;
      const inPhrase = sectionIn32 * BARS_PER_SECTION + inSection;
      meters[0]!.set(inSection);
      meters[1]!.set(inPhrase);
      total.textContent = `通算 ${bar + 1} 小節目 / 32bar 中 ${inPhrase + 1} 小節目（${SECTION_LABEL[sectionIn32]}） / 8bar 中 ${inSection + 1} 小節目${ctx.isSectionEnd ? '（フィル区間）' : ''}`;
    },
    clear,
  };
}

function meter(label: string, bars: number) {
  const element = document.createElement('div');
  element.className = 'meter';
  element.style.gridTemplateColumns = `4em repeat(${bars}, 1fr)`;
  const title = document.createElement('span');
  title.className = 'meter-label';
  title.textContent = label;
  const cells = Array.from({ length: bars }, () => document.createElement('span'));
  element.append(title, ...cells);
  return {
    element,
    set(current: number | null) {
      cells.forEach((cell, i) => cell.classList.toggle('on', current !== null && i <= current));
    },
  };
}
