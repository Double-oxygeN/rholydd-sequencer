import { STEPS_PER_BAR, type Step } from '../generators/types.ts';
import { BARS_PER_PAIR, PAIRS_PER_SECTION, SECTIONS_PER_PHRASE, type SectionIn32 } from '../structure/form.ts';
import { chordOf, type Context } from '../structure/conductor.ts';
import { chordName } from '../structure/harmony.ts';
import { barsToNextScene, cycleScenes, sceneName } from '../structure/arrangement.ts';

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
  const cycle = sceneMeter();
  const total = document.createElement('div');
  total.className = 'position-total';
  const chord = document.createElement('span');
  chord.className = 'position-chord';
  const scene = document.createElement('span');
  scene.className = 'position-scene';
  const text = document.createElement('span');
  total.append(chord, scene, text);
  element.append(...meters.map((m) => m.element), cycle.element, total);

  const clear = () => {
    for (const m of meters) m.set(null);
    cycle.clear();
    chord.textContent = '';
    scene.textContent = '';
    text.textContent = '停止中';
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
      // Only the order of the scenes matters here, which the intro's entry never changes.
      const scenes = cycleScenes(ctx.layout, 'return');
      cycle.show(scenes.map((role) => role.scene), ctx.sectionInCycle);
      chord.textContent = chordName(ctx.key, chordOf(ctx));
      scene.textContent = `${sceneName(ctx.sceneRole)}（次のシーンまで ${barsToNextScene(scenes, ctx.sectionInCycle, inSection)} 小節）`;
      text.textContent = `通算 ${bar + 1} 小節目 / 32bar 中 ${inPhrase + 1} 小節目（${SECTION_LABEL[sectionIn32]}） / 8bar 中 ${inSection + 1} 小節目${ctx.isSectionEnd ? '（フィル区間）' : ''}`;
    },
    clear,
  };
}

/** One cell per 8 bars of the cycle, coloured by scene, so that the next drop can be seen coming. */
function sceneMeter() {
  const element = document.createElement('div');
  element.className = 'meter scene-meter';
  const title = document.createElement('span');
  title.className = 'meter-label';
  title.textContent = 'cycle';
  let cells: HTMLElement[] = [];
  let shape = '';
  return {
    element,
    show(scenes: readonly string[], current: number) {
      // Rebuilt only when a new cycle brings a different layout.
      if (scenes.join() !== shape) {
        shape = scenes.join();
        cells = scenes.map((scene) => {
          const cell = document.createElement('span');
          cell.dataset.scene = scene;
          cell.title = `${BARS_PER_SECTION} 小節`;
          return cell;
        });
        element.style.gridTemplateColumns = `4em repeat(${cells.length}, 1fr)`;
        element.replaceChildren(title, ...cells);
      }
      cells.forEach((cell, i) => cell.classList.toggle('on', i <= current));
    },
    clear() {
      shape = '';
      cells = [];
      element.replaceChildren(title);
    },
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
