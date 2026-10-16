import { TAG, createRng, hash, weightedIndex, type Seed } from '../random/rng.ts';
import { clampUnit, type Brand, type UnitInterval } from '../units.ts';
import { sectionEnergy } from './energy.ts';
import { SECTIONS_PER_PHRASE, type PairIn8, type SectionIn32 } from './form.ts';
import { DROP_EXTENSIONS, type DropExtension, type EnergyTuning, type LayoutTuning } from './tuning.ts';

/** Cycle count from the start of playback (0-based). */
export type CycleIndex = Brand<number, 'CycleIndex'>;
/** 8-bar section count from the start of the cycle (0-based), below the cycle's length in sections. */
export type SectionInCycle = Brand<number, 'SectionInCycle'>;

/** 8-bar sections of the intro or the breakdown. The build takes the rest of the same 32 bars. */
export type LeadSections = 2 | 3;
/** 32-bar phrases of a drop. */
export type DropPhrases = 1 | 2;
export type DropOrdinal = 'first' | 'second';

/**
 * How a build hands over to its drop, in its last beat: in silence, in silence but for one snare on the last 8th,
 * with the pad and the riser held over stopped drums, or straight through without a gap.
 */
export const DROP_LEAD_INS = ['silence', 'pickup', 'padHold', 'straight'] as const;
export type DropLeadIn = (typeof DROP_LEAD_INS)[number];
/** Lead-ins that stop the drums for the last beat. */
export type GapLeadIn = Exclude<DropLeadIn, 'straight'>;

/** The cycle's length follows from the drops, so it is never stored apart from them. */
export interface CycleLayout {
  readonly intro: LeadSections;
  readonly breakdown: LeadSections;
  readonly firstDrop: DropPhrases;
  readonly secondDrop: DropPhrases;
  /** Always differ, so that the second drop of a track never comes in the way the first did. */
  readonly leadIns: Readonly<Record<DropOrdinal, DropLeadIn>>;
}

export type LeadPosition = { readonly sections: 2; readonly index: 0 | 1 } | { readonly sections: 3; readonly index: 0 | 1 | 2 };
export type BuildPosition = { readonly sections: 1; readonly index: 0 } | { readonly sections: 2; readonly index: 0 | 1 };
export type DropPosition = { readonly phrases: 1; readonly phrase: 0 } | { readonly phrases: 2; readonly phrase: 0 | 1 };

/** Positions pair with lengths so that no position can lie past the end of its scene. */
export type SceneRole =
  | ({ readonly scene: 'intro' } & LeadPosition)
  /** Always followed by a drop, whose lead-in every 2 bars of the build need to pace the riser. */
  | ({ readonly scene: 'build'; readonly leadIn: DropLeadIn } & BuildPosition)
  | ({ readonly scene: 'drop'; readonly drop: DropOrdinal } & DropPosition)
  | ({ readonly scene: 'breakdown' } & LeadPosition);

export type Scene = SceneRole['scene'];

export const BARS_PER_SECTION = 8;

export function cycleSections(layout: CycleLayout): number {
  return SECTIONS_PER_PHRASE * (2 + layout.firstDrop + layout.secondDrop);
}

const EXTENDED_DROPS: Readonly<Record<DropExtension, readonly [DropPhrases, DropPhrases]>> = {
  none: [1, 1],
  first: [2, 1],
  second: [1, 2],
  both: [2, 2],
};

/** Draws the intro length, the breakdown length and the drop extension, in that order, then the lead-ins. */
export function drawLayout(cycleSeed: Seed, tuning: LayoutTuning): CycleLayout {
  const rng = createRng(hash(cycleSeed, TAG.layout));
  const intro: LeadSections = rng.float() < tuning.longIntroChance ? 3 : 2;
  const breakdown: LeadSections = rng.float() < tuning.longBreakdownChance ? 3 : 2;
  const extension = DROP_EXTENSIONS[weightedIndex(rng.float(), DROP_EXTENSIONS.map((e) => tuning.dropExtension[e])) ?? 0]!;
  const [firstDrop, secondDrop] = EXTENDED_DROPS[extension];
  return { intro, breakdown, firstDrop, secondDrop, leadIns: drawLeadIns(cycleSeed) };
}

// A seed of their own keeps the draws of the layout above as they were.
function drawLeadIns(cycleSeed: Seed): CycleLayout['leadIns'] {
  const rng = createRng(hash(cycleSeed, TAG.dropLeadIn));
  const first = DROP_LEAD_INS[rng.int(DROP_LEAD_INS.length)]!;
  const rest = DROP_LEAD_INS.filter((leadIn) => leadIn !== first);
  return { first, second: rest[rng.int(rest.length)]! };
}

/** One role per 8-bar section of the cycle. */
export function cycleScenes(layout: CycleLayout): readonly SceneRole[] {
  return [
    ...lead(layout.intro).map((position): SceneRole => ({ scene: 'intro', ...position })),
    ...build(layout.intro, layout.leadIns.first),
    ...drop('first', layout.firstDrop),
    ...lead(layout.breakdown).map((position): SceneRole => ({ scene: 'breakdown', ...position })),
    ...build(layout.breakdown, layout.leadIns.second),
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

function build(leadSections: LeadSections, leadIn: DropLeadIn): readonly SceneRole[] {
  return leadSections === 3
    ? [{ scene: 'build', leadIn, sections: 1, index: 0 }]
    : [
        { scene: 'build', leadIn, sections: 2, index: 0 },
        { scene: 'build', leadIn, sections: 2, index: 1 },
      ];
}

function drop(which: DropOrdinal, phrases: DropPhrases): readonly SceneRole[] {
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

/**
 * Energy of an 8-bar section. Builds only rise, topping out at the drop's A so that the drop never starts thinner
 * than the build before it; the tension of a build comes from the riser and the high-pass instead. Drops keep the
 * phase 1 curve so that their 32 bars still rise and fall as A A' B A''.
 */
export function sceneEnergy(
  role: SceneRole,
  sectionIn32: SectionIn32,
  depth: UnitInterval,
  tuning: EnergyTuning,
): UnitInterval {
  const curve = sceneCurve(role, sectionIn32, tuning);
  return clampUnit(1 - depth * (1 - curve));
}

function sceneCurve(role: SceneRole, sectionIn32: SectionIn32, { phrase, scene }: EnergyTuning): number {
  switch (role.scene) {
    case 'intro':
      return scene.intro;
    case 'build':
      return role.index === role.sections - 1 ? scene.buildLast : scene.buildFirst;
    case 'drop':
      return sectionEnergy(sectionIn32, clampUnit(1), phrase);
    case 'breakdown':
      return scene.breakdown;
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

/**
 * The first 8 bars of every intro, after a drop as much as at the start of playback, so that each cycle starts
 * over like a new track. Thinning by energy barely changed the hit count, so parts and positions are left out.
 */
function opensIntro(role: SceneRole): boolean {
  return role.scene === 'intro' && role.index === 0;
}

const LEFT_OUT_OF_INTRO_OPENING: ReadonlySet<Voice> = new Set(['ghost', 'sub']);

/** Whether a part sounds in the scene. Every part is still generated; this only decides what is heard. */
export function plays(role: SceneRole, voice: Voice): boolean {
  if (opensIntro(role) && LEFT_OUT_OF_INTRO_OPENING.has(voice)) return false;
  return PLAYS[role.scene].has(voice);
}

/** Whether a drum hit sounds: the opening of the intro also keeps the hat to the 8ths. */
export function playsHit(role: SceneRole, hit: { readonly part: Voice; readonly step: number }): boolean {
  if (opensIntro(role) && hit.part === 'hat' && hit.step % 2 === 1) return false;
  return plays(role, hit.part);
}

/** Where the gap before a drop starts: the last beat of the build. */
export const GAP_START = 28;

export function hasGap(leadIn: DropLeadIn): leadIn is GapLeadIn {
  return leadIn !== 'straight';
}

/** Whether the gap also stops the pad and the riser, leaving nothing but reverb tails (and the pickup). */
export function silencesGap(leadIn: GapLeadIn): boolean {
  return leadIn !== 'padHold';
}

/** The parts of a context that the scene boundaries depend on. */
export interface ScenePlace {
  readonly sceneRole: SceneRole;
  readonly nextScene: Scene;
  readonly isSectionEnd: boolean;
}

export function changesScene(ctx: ScenePlace): boolean {
  return ctx.isSectionEnd && ctx.nextScene !== ctx.sceneRole.scene;
}

/** The last 2 bars of a build, which end in the drop's lead-in. */
export function leadsIntoDrop(ctx: ScenePlace): boolean {
  return changesScene(ctx) && ctx.nextScene === 'drop';
}

/** The lead-in that the 2 bars end in, if they are the last of a build. */
export function dropLeadIn(ctx: ScenePlace): DropLeadIn | null {
  return leadsIntoDrop(ctx) && ctx.sceneRole.scene === 'build' ? ctx.sceneRole.leadIn : null;
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
