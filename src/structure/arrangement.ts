import { TAG, createRng, hash, weightedIndex, type Seed } from '../random/rng.ts';
import { clampUnit, type Brand, type UnitInterval } from '../units.ts';
import { sectionEnergy } from './energy.ts';
import { SECTIONS_PER_PHRASE, type PairIn8, type SectionIn32 } from './form.ts';

/** Cycle count from the start of playback (0-based). */
export type CycleIndex = Brand<number, 'CycleIndex'>;
/** 8-bar section count from the start of the cycle (0-based), below the cycle's length in sections. */
export type SectionInCycle = Brand<number, 'SectionInCycle'>;

/** 8-bar sections of the intro or the breakdown. The build takes the rest of the same 32 bars. */
export type LeadSections = 2 | 3;
/** 32-bar phrases of a drop. */
export type DropPhrases = 1 | 2;

/** The cycle's length follows from the drops, so it is never stored apart from them. */
export interface CycleLayout {
  readonly intro: LeadSections;
  readonly breakdown: LeadSections;
  readonly firstDrop: DropPhrases;
  readonly secondDrop: DropPhrases;
}

export type LeadPosition = { readonly sections: 2; readonly index: 0 | 1 } | { readonly sections: 3; readonly index: 0 | 1 | 2 };
export type BuildPosition = { readonly sections: 1; readonly index: 0 } | { readonly sections: 2; readonly index: 0 | 1 };
export type DropPosition = { readonly phrases: 1; readonly phrase: 0 } | { readonly phrases: 2; readonly phrase: 0 | 1 };

/** The intro after a drop keeps the drums and the sub going, unlike the one that starts playback. */
export type IntroEntry = 'start' | 'return';

/** Positions pair with lengths so that no position can lie past the end of its scene. */
export type SceneRole =
  | ({ readonly scene: 'intro'; readonly entry: IntroEntry } & LeadPosition)
  /** Always followed by a drop. */
  | ({ readonly scene: 'build' } & BuildPosition)
  | ({ readonly scene: 'drop'; readonly drop: 'first' | 'second' } & DropPosition)
  | ({ readonly scene: 'breakdown' } & LeadPosition);

export type Scene = SceneRole['scene'];

export const BARS_PER_SECTION = 8;

export function cycleSections(layout: CycleLayout): number {
  return SECTIONS_PER_PHRASE * (2 + layout.firstDrop + layout.secondDrop);
}

// Equal chances of 128, 160 and 192 bars: no extension, either drop alone, or both.
const DROP_EXTENSIONS: readonly (readonly [DropPhrases, DropPhrases, number])[] = [
  [1, 1, 1 / 3],
  [2, 1, 1 / 6],
  [1, 2, 1 / 6],
  [2, 2, 1 / 3],
];

/** Draws the intro length, the breakdown length and the drop extension, in that order. */
export function drawLayout(cycleSeed: Seed): CycleLayout {
  const rng = createRng(hash(cycleSeed, TAG.layout));
  const intro: LeadSections = rng.float() < 0.5 ? 3 : 2;
  const breakdown: LeadSections = rng.float() < 0.5 ? 3 : 2;
  const [firstDrop, secondDrop] = DROP_EXTENSIONS[weightedIndex(rng.float(), DROP_EXTENSIONS.map(([, , w]) => w)) ?? 0]!;
  return { intro, breakdown, firstDrop, secondDrop };
}

/** One role per 8-bar section of the cycle. */
export function cycleScenes(layout: CycleLayout, entry: IntroEntry): readonly SceneRole[] {
  return [
    ...lead(layout.intro).map((position): SceneRole => ({ scene: 'intro', entry, ...position })),
    ...build(layout.intro),
    ...drop('first', layout.firstDrop),
    ...lead(layout.breakdown).map((position): SceneRole => ({ scene: 'breakdown', ...position })),
    ...build(layout.breakdown),
    ...drop('second', layout.secondDrop),
  ];
}

function lead(sections: LeadSections): readonly LeadPosition[] {
  return sections === 2
    ? [
        { sections, index: 0 },
        { sections, index: 1 },
      ]
    : [
        { sections, index: 0 },
        { sections, index: 1 },
        { sections, index: 2 },
      ];
}

function build(leadSections: LeadSections): readonly SceneRole[] {
  return leadSections === 3
    ? [{ scene: 'build', sections: 1, index: 0 }]
    : [
        { scene: 'build', sections: 2, index: 0 },
        { scene: 'build', sections: 2, index: 1 },
      ];
}

function drop(which: 'first' | 'second', phrases: DropPhrases): readonly SceneRole[] {
  const positions: readonly DropPosition[] =
    phrases === 1
      ? [{ phrases, phrase: 0 }]
      : [
          { phrases, phrase: 0 },
          { phrases, phrase: 1 },
        ];
  return positions.flatMap((position) =>
    Array.from({ length: SECTIONS_PER_PHRASE }, (): SceneRole => ({ scene: 'drop', drop: which, ...position })),
  );
}

const INTRO_RETURN_CURVE = [0.75, 0.6, 0.5] as const;

/**
 * Energy of an 8-bar section. Builds only rise, topping out at the drop's A so that the drop never starts thinner
 * than the build before it; the tension of a build comes from the riser and the high-pass instead. Drops keep the
 * phase 1 curve so that their 32 bars still rise and fall as A A' B A''.
 */
export function sceneEnergy(role: SceneRole, sectionIn32: SectionIn32, depth: UnitInterval): UnitInterval {
  const curve = sceneCurve(role, sectionIn32);
  return clampUnit(1 - depth * (1 - curve));
}

function sceneCurve(role: SceneRole, sectionIn32: SectionIn32): number {
  switch (role.scene) {
    case 'intro':
      // Steps down from the drop's A, so that leaving a drop for the next cycle never falls off a cliff.
      return role.entry === 'start' ? 0.5 : INTRO_RETURN_CURVE[role.index];
    case 'build':
      return role.index === role.sections - 1 ? 0.75 : 0.6;
    case 'drop':
      return sectionEnergy(sectionIn32, clampUnit(1));
    case 'breakdown':
      return 0.4;
  }
}

export type Voice = 'kick' | 'snare' | 'hat' | 'ghost' | 'sub' | 'reese' | 'stab' | 'pad';

const PLAYS: Readonly<Record<Scene, ReadonlySet<Voice>>> = {
  intro: new Set(['kick', 'snare', 'hat', 'ghost', 'sub', 'pad']),
  // The basses leave so that the drop's first sub lands on empty low end.
  build: new Set(['kick', 'snare', 'hat', 'ghost', 'stab', 'pad']),
  drop: new Set(['kick', 'snare', 'hat', 'ghost', 'sub', 'reese', 'stab', 'pad']),
  breakdown: new Set(['hat', 'stab', 'pad']),
};

/** Whether a part sounds in the scene. Every part is still generated; this only decides what is heard. */
export function plays(role: SceneRole, voice: Voice): boolean {
  if (role.scene === 'intro' && role.entry === 'start' && role.index === 0 && voice === 'sub') return false;
  return PLAYS[role.scene].has(voice);
}

/** Where the silent beat before a drop starts: the last beat of the build. */
export const GAP_START = 28;

/** The parts of a context that the scene boundaries depend on. */
export interface ScenePlace {
  readonly sceneRole: SceneRole;
  readonly nextScene: Scene;
  readonly isSectionEnd: boolean;
}

export function changesScene(ctx: ScenePlace): boolean {
  return ctx.isSectionEnd && ctx.nextScene !== ctx.sceneRole.scene;
}

/** The last 2 bars of a build, which end in the silent beat. */
export function leadsIntoDrop(ctx: ScenePlace): boolean {
  return changesScene(ctx) && ctx.nextScene === 'drop';
}

/** The last 2 bars of the first drop. */
export function leadsIntoBreakdown(ctx: ScenePlace): boolean {
  return changesScene(ctx) && ctx.nextScene === 'breakdown';
}

/** The first 2 bars of a drop that follows a build, where the impact lands. */
export function opensDrop(ctx: { readonly sceneRole: SceneRole; readonly sectionRole: { readonly isPhraseStart: boolean }; readonly pairIn8: PairIn8 }): boolean {
  return ctx.sceneRole.scene === 'drop' && ctx.sceneRole.phrase === 0 && ctx.sectionRole.isPhraseStart && ctx.pairIn8 === 0;
}

/**
 * Whether the drums get a new groove at the start of the 32 bars in this role. The first drop keeps the groove
 * the intro introduced; every later drop phrase switches it up while the theme returns.
 */
export function refreshesReference(role: SceneRole): boolean {
  return role.scene === 'intro' || (role.scene === 'drop' && !(role.drop === 'first' && role.phrase === 0));
}

export const SCENE_LABEL: Readonly<Record<Scene, string>> = {
  intro: 'イントロ',
  build: 'ビルド',
  drop: 'ドロップ',
  breakdown: 'ブレイクダウン',
};

export function sceneName(role: SceneRole): string {
  return role.scene === 'drop' ? `${SCENE_LABEL.drop}${role.drop === 'first' ? 1 : 2}` : SCENE_LABEL[role.scene];
}

/** Bars from the given bar of the cycle to the start of the next scene, which may be the next cycle's intro. */
export function barsToNextScene(scenes: readonly SceneRole[], section: SectionInCycle, barInSection: number): number {
  const current = scenes[section]!.scene;
  let next = section + 1;
  while (next < scenes.length && scenes[next]!.scene === current) next++;
  return (next - section) * BARS_PER_SECTION - barInSection;
}
