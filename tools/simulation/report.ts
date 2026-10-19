import { ALL_FILL_KINDS, FILL_LENGTHS, type FillKind, type FillLength } from '../../src/generators/drums/fill.ts';
import { motifCell, patternsEqual, type Pattern } from '../../src/generators/drums/pattern.ts';
import { slotsOf } from '../../src/generators/drums/weights.ts';
import { createEnsemble } from '../../src/generators/ensemble.ts';
import type { FxEvent } from '../../src/generators/fx/index.ts';
import { DEFAULT_GENERATION_TUNING, type GenerationTuning } from '../../src/generators/tuning.ts';
import { PAD_HIGHEST, PAD_LOWEST } from '../../src/generators/pad/index.ts';
import { REESE_HIGHEST, REESE_LOWEST } from '../../src/generators/reese/index.ts';
import { REESE_STYLES, type ReeseStyle } from '../../src/generators/reese/styles.ts';
import { STAB_HIGHEST, STAB_LOWEST } from '../../src/generators/stab/index.ts';
import { STAB_STYLES, type StabStyle } from '../../src/generators/stab/styles.ts';
import { HIGHEST_PITCH, LOWEST_PITCH } from '../../src/generators/sub/pitch.ts';
import { SUB_STYLES, type SubStyle } from '../../src/generators/sub/styles.ts';
import { PARTS, type Layer, type NoteEvent, type Part, type PitchedEvent } from '../../src/generators/types.ts';
import type { Seed } from '../../src/random/rng.ts';
import {
  BARS_PER_SECTION,
  DROP_LEAD_INS,
  INTRO_ORDERS,
  cycleSections,
  dropLeadIn,
  refreshesReference,
  type CycleLayout,
  type DropLeadIn,
  type DropOrdinal,
  type IntroOrder,
  type Scene,
} from '../../src/structure/arrangement.ts';
import { announcesSnare, plays, playsHit } from '../../src/structure/scene-parts.ts';
import { chordOf, type Context, type LiveParams } from '../../src/structure/conductor.ts';
import { SECTIONS_PER_PHRASE, type SectionIn32 } from '../../src/structure/form.ts';
import {
  BORROWED_SYMBOLS,
  CHORD_TONES,
  chordClasses,
  chordToneClass,
  isBorrowed,
  romanName,
  type BorrowedSymbol,
  type Tension,
} from '../../src/structure/chords.ts';
import { MAIN_SKELETONS, TRANSITION_SKELETONS, skeletonName, type MainProgression } from '../../src/structure/harmony.ts';
import { DEFAULT_KEY, degreeOf, type Key } from '../../src/structure/key.ts';
import { PAD_TIMBRES, REESE_TIMBRES, STAB_TIMBRES, type CycleTimbre } from '../../src/structure/timbre.ts';

export interface SimulationOptions {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
  readonly initialKey?: Key;
  readonly tuning?: GenerationTuning;
}

export const DEGREE_NAMES = ['1', '2', '♭3', '4', '5', '♭6', '♭7'] as const;
/** Sub notes outside the key's natural minor: tones of borrowed chords. */
export const OUTSIDE = 'outside';
type DegreeName = (typeof DEGREE_NAMES)[number] | typeof OUTSIDE;
export const TENSIONS: readonly Tension[] = ['ninth', 'flatNinth', 'eleventh', 'sharpEleventh', 'thirteenth'];

type PerPart<T> = Record<Part, T>;
type PerSection<T> = Record<SectionIn32, T>;

export const SECTION_LABEL: PerSection<string> = { 0: 'A', 1: "A'", 2: 'B', 3: "A''" };
export const SECTIONS_IN_32: readonly SectionIn32[] = [0, 1, 2, 3];

export interface SimulationReport {
  readonly bars: number;
  readonly seed: Seed;
  readonly initialKey: Key;
  readonly live: LiveParams;
  /** Average hits per bar for each part, split by layer. */
  readonly density: PerPart<Record<Layer | 'total', number>>;
  /** Average hits per bar for each part within each section of the 32-bar phrase. */
  readonly densityBySection: PerSection<PerPart<number>>;
  readonly phrase: {
    /** Number of 32-bar boundaries after the first phrase. */
    readonly boundaries: number;
    /** Number of those boundaries where the scene lets the strong mutation give the drums a new groove. */
    readonly refreshable: number;
    /** Number of those boundaries where the strong mutation changed the reference pattern. */
    readonly referenceChanges: number;
  };
  readonly mutation: {
    /** Number of 8-bar boundaries where the part's base pattern changed. */
    readonly changedSections: PerPart<number>;
    /** Total number of motif cells rewritten across all boundaries. */
    readonly changedCells: PerPart<number>;
    readonly boundaries: number;
  };
  readonly repetition: {
    /** Share of 2-bar units that sound like the previous 2 bars, counting pitches from the chord root. */
    readonly pair: number;
    /** Share of 8-bar sections whose base pattern equals that of the previous section. */
    readonly section: number;
    readonly distinctBasePatterns: number;
  };
  readonly harmony: {
    /** Number of phrases playing each main progression in A, A' and A''. */
    readonly main: Record<string, number>;
    /** Number of phrases playing each transition progression in B. */
    readonly transition: Record<string, number>;
    /** Number of 32-bar boundaries where the main progression changed. */
    readonly mainChanges: number;
    /** Number of cycle starts where the key moved, by the way it moved. */
    readonly modulations: Record<'dominant' | 'subdominant', number>;
    /** Bars played in each key, keyed by signed steps round the circle of fifths from the initial key, -5 to +6. */
    readonly barsByFifths: Record<string, number>;
    /** 2-bar units playing each chord, named by degree with its tension, such as VI(♯11). */
    readonly chords: Record<string, number>;
    /** 2-bar units playing each borrowed chord. */
    readonly borrowed: Record<BorrowedSymbol, number>;
    /** 2-bar units whose chord carries each tension. */
    readonly tensions: Record<Tension, number>;
    /**
     * Notes outside the chord of their 2 bars: outside its four tones for the basses, outside its tones and tension
     * for the upper parts. The generators should never produce one.
     */
    readonly outOfChord: number;
    /** Notes outside the key's natural minor on 2 bars without a borrowed chord. The generators should never produce one. */
    readonly outOfScale: number;
    /** Notes of any pitched part outside the part's range. The generators should never produce one. */
    readonly outOfRange: number;
  };
  /** Average notes per 2 bars of each pitched part. A chord counts as one. */
  readonly notesPerPair: Record<PitchedPart, number>;
  readonly reese: { readonly styles: StyleCounts<ReeseStyle> };
  readonly stab: { readonly styles: StyleCounts<StabStyle> };
  readonly sub: {
    /** Number of phrases using each style for A, A' and A'', and for B. */
    readonly styles: StyleCounts<SubStyle>;
    /** Share of notes on each scale degree counted from the tonic of the cycle's key, and outside the scale. */
    readonly degrees: Record<DegreeName, number>;
    readonly octaveJumps: number;
    readonly notesPerPair: number;
    /** Mean note length in 16th notes. */
    readonly meanLength: number;
  };
  readonly arrangement: {
    /** Number of cycles that started, the last one possibly cut short by the end of the simulation. */
    readonly cycles: number;
    readonly lengths: Record<CycleBars, number>;
    /** Number of cycles per pair of intro and breakdown lengths in bars, such as "24/16". */
    readonly leads: Record<string, number>;
    readonly extensions: Record<DropExtension, number>;
    /** Number of cycles opening with each intro order. */
    readonly introOrders: Record<IntroOrder, number>;
    /** Heard drum hits per bar in the first 8 bars of the intros of each order. */
    readonly introOpeningHitsPerBar: Record<IntroOrder, number>;
    /** Number of builds that led into each drop of a cycle in each way. */
    readonly leadIns: Record<DropOrdinal, Record<DropLeadIn, number>>;
    readonly scenes: Record<Scene, SceneStats>;
    /** Heard events of parts that their scene leaves out, apart from the snare rolls announcing the drums. Always 0. */
    readonly misplaced: number;
  };
  /** For each part with a table of sounds, the cycles that played each sound and the cycle starts that changed it. */
  readonly timbre: Record<keyof CycleTimbre, { readonly cycles: Record<string, number>; readonly changes: number }>;
  /** Number of effects of each kind. Risers and sweeps count one segment per 2 bars. */
  readonly fx: Record<FxEvent['fx'], number>;
  readonly fills: Record<FillKind | 'none', number>;
  readonly fillLengths: Record<FillLength, number>;
  readonly generationMs: { readonly mean: number; readonly max: number };
}

type PitchedPart = PitchedEvent['instrument'];

const SIGNED_FIFTHS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;

/** Steps round the circle of fifths from one key to another, negative towards the subdominant. */
function fifthsBetween(from: Key, to: Key): (typeof SIGNED_FIFTHS)[number] {
  // A fifth is 7 semitones, and 7 × 7 ≡ 1 (mod 12), so multiplying the semitones by 7 counts the fifths.
  const fifths = (((to - from) * 7) % 12 + 12) % 12;
  return (fifths > 6 ? fifths - 12 : fifths) as (typeof SIGNED_FIFTHS)[number];
}

// Zero is written ±0 so that it is not an integer-like key, which objects would list before every other key.
const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '±0' : String(n));
type CycleBars = 128 | 160 | 192;
type DropExtension = 'none' | 'first' | 'second' | 'both';

interface SceneStats {
  readonly bars: number;
  /** Heard drum hits per bar. */
  readonly drumHitsPerBar: number;
  /** Heard notes per 2 bars of each pitched part. A chord counts as one. */
  readonly notesPerPair: Record<PitchedPart, number>;
}

export const SCENES: readonly Scene[] = ['intro', 'build', 'drop', 'breakdown'];
const TIMBRE_TABLES: Readonly<Record<keyof CycleTimbre, readonly string[]>> = {
  reese: REESE_TIMBRES,
  stab: STAB_TIMBRES,
  pad: PAD_TIMBRES,
};
export const TIMBRE_PARTS = Object.keys(TIMBRE_TABLES) as (keyof CycleTimbre)[];
export const FX_KINDS: readonly FxEvent['fx'][] = ['riser', 'sweep', 'impact', 'throw', 'filterReset', 'gap'];
const LEAD_BARS = [16, 24] as const;

function extensionOf(layout: CycleLayout): DropExtension {
  if (layout.firstDrop === 2) return layout.secondDrop === 2 ? 'both' : 'first';
  return layout.secondDrop === 2 ? 'second' : 'none';
}
export const PITCHED_PARTS: readonly PitchedPart[] = ['sub', 'reese', 'stab', 'pad'];
const RANGES: Readonly<Record<PitchedPart, readonly [number, number]>> = {
  sub: [LOWEST_PITCH, HIGHEST_PITCH],
  reese: [REESE_LOWEST, REESE_HIGHEST],
  stab: [STAB_LOWEST, STAB_HIGHEST],
  pad: [PAD_LOWEST, PAD_HIGHEST],
};

/** Number of phrases using each style for A, A' and A'', and for B. */
export type StyleCounts<S extends string> = Record<S, { main: number; transition: number }>;

function styleCounts<S extends string>(styles: readonly S[]): StyleCounts<S> {
  return Object.fromEntries(styles.map((s) => [s, { main: 0, transition: 0 }])) as StyleCounts<S>;
}

const perPart = <T>(make: () => T): PerPart<T> =>
  Object.fromEntries(PARTS.map((part) => [part, make()])) as PerPart<T>;

export function simulate({
  bars,
  seed,
  live,
  initialKey = DEFAULT_KEY,
  tuning = DEFAULT_GENERATION_TUNING,
}: SimulationOptions): SimulationReport {
  const ensemble = createEnsemble({ seed, initialKey, tuning });
  const pairs = Math.ceil(bars / 2);

  const styles = styleCounts(SUB_STYLES);
  const reeseStyles = styleCounts(REESE_STYLES);
  const stabStyles = styleCounts(STAB_STYLES);
  const pitchedNotes: Record<PitchedPart, number> = { sub: 0, reese: 0, stab: 0, pad: 0 };
  let outOfRange = 0;
  const mainProgressions = Object.fromEntries(MAIN_SKELETONS.map((p) => [skeletonName(p), 0]));
  const transitionProgressions = Object.fromEntries(TRANSITION_SKELETONS.map((p) => [skeletonName(p), 0]));
  const chords: Record<string, number> = {};
  const borrowed = Object.fromEntries(BORROWED_SYMBOLS.map((s) => [s, 0])) as Record<BorrowedSymbol, number>;
  const tensions = Object.fromEntries(TENSIONS.map((t) => [t, 0])) as Record<Tension, number>;
  let outOfScale = 0;
  let previousMain: MainProgression | undefined;
  let mainChanges = 0;
  let previousKey: Key | undefined;
  const modulations = { dominant: 0, subdominant: 0 };
  const barsByFifths = Object.fromEntries(SIGNED_FIFTHS.map((f) => [signed(f), 0])) as Record<string, number>;
  let outOfChord = 0;
  const degrees = Object.fromEntries([...DEGREE_NAMES, OUTSIDE].map((d) => [d, 0])) as Record<DegreeName, number>;
  let subNotes = 0;
  let octaveJumps = 0;
  let subSteps = 0;

  const hits = perPart(() => ({ base: 0, ornament: 0, fill: 0, total: 0 }));
  const sectionHits = Object.fromEntries(SECTIONS_IN_32.map((s) => [s, perPart(() => 0)])) as PerSection<PerPart<number>>;
  const sectionBars = Object.fromEntries(SECTIONS_IN_32.map((s) => [s, 0])) as PerSection<number>;
  let phraseBoundaries = 0;
  let refreshable = 0;
  let referenceChanges = 0;
  let cycles = 0;
  const cycleLengths: Record<CycleBars, number> = { 128: 0, 160: 0, 192: 0 };
  const leads = Object.fromEntries(
    LEAD_BARS.flatMap((intro) => LEAD_BARS.map((breakdown) => [`${intro}/${breakdown}`, 0])),
  ) as Record<string, number>;
  const extensions: Record<DropExtension, number> = { none: 0, first: 0, second: 0, both: 0 };
  const introOrders = Object.fromEntries(INTRO_ORDERS.map((order) => [order, 0])) as Record<IntroOrder, number>;
  const openingBars = Object.fromEntries(INTRO_ORDERS.map((order) => [order, 0])) as Record<IntroOrder, number>;
  const openingHits = Object.fromEntries(INTRO_ORDERS.map((order) => [order, 0])) as Record<IntroOrder, number>;
  const leadInCounts = () => Object.fromEntries(DROP_LEAD_INS.map((leadIn) => [leadIn, 0])) as Record<DropLeadIn, number>;
  const leadIns: Record<DropOrdinal, Record<DropLeadIn, number>> = { first: leadInCounts(), second: leadInCounts() };
  const sceneBars = Object.fromEntries(SCENES.map((scene) => [scene, 0])) as Record<Scene, number>;
  const sceneDrums = Object.fromEntries(SCENES.map((scene) => [scene, 0])) as Record<Scene, number>;
  const sceneNotes = Object.fromEntries(
    SCENES.map((scene) => [scene, { sub: 0, reese: 0, stab: 0, pad: 0 }]),
  ) as Record<Scene, Record<PitchedPart, number>>;
  let misplaced = 0;
  const timbre = Object.fromEntries(
    TIMBRE_PARTS.map((part) => [part, { cycles: Object.fromEntries(TIMBRE_TABLES[part].map((name) => [name, 0])), changes: 0 }]),
  ) as Record<keyof CycleTimbre, { cycles: Record<string, number>; changes: number }>;
  let previousTimbre: CycleTimbre | undefined;
  const fxCounts = Object.fromEntries(FX_KINDS.map((kind) => [kind, 0])) as Record<FxEvent['fx'], number>;
  let previousReference: Pattern | undefined;
  const changedSections = perPart(() => 0);
  const changedCells = perPart(() => 0);
  const fills = Object.fromEntries([...ALL_FILL_KINDS, 'none'].map((kind) => [kind, 0])) as Record<FillKind | 'none', number>;
  const fillLengths = Object.fromEntries(FILL_LENGTHS.map((length) => [length, 0])) as Record<FillLength, number>;
  const distinctBases = new Set<string>();
  let repeatedPairs = 0;
  let repeatedSections = 0;
  let boundaries = 0;
  let totalMs = 0;
  let maxMs = 0;
  let previousShape: string | undefined;
  let previousBase: Pattern | undefined;

  for (let i = 0; i < pairs; i++) {
    const start = performance.now();
    const { ctx, drumLayers: layers, sub, reese, stab, pad, events, fx } = ensemble.next(live);
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);

    const { sectionIn32 } = ctx.sectionRole;
    sectionBars[sectionIn32] += 2;
    if (ctx.sectionInCycle === 0 && ctx.isSectionStart) {
      cycles++;
      cycleLengths[(cycleSections(ctx.layout) * BARS_PER_SECTION) as CycleBars]++;
      leads[`${ctx.layout.intro * BARS_PER_SECTION}/${ctx.layout.breakdown * BARS_PER_SECTION}`]! += 1;
      extensions[extensionOf(ctx.layout)]++;
      introOrders[ctx.layout.introOrder]++;
      for (const part of TIMBRE_PARTS) {
        timbre[part].cycles[ctx.timbre[part]]! += 1;
        if (previousTimbre !== undefined && previousTimbre[part] !== ctx.timbre[part]) timbre[part].changes++;
      }
      previousTimbre = ctx.timbre;
    }
    barsByFifths[signed(fifthsBetween(initialKey, ctx.key))]! += 2;
    if (previousKey !== undefined && previousKey !== ctx.key) {
      const step = fifthsBetween(previousKey, ctx.key);
      if (step === 1) modulations.dominant++;
      else if (step === -1) modulations.subdominant++;
      else throw new Error(`the key moved ${step} steps round the circle of fifths at bar ${ctx.bar}`);
    }
    previousKey = ctx.key;
    const { scene } = ctx.sceneRole;
    sceneBars[scene] += 2;
    if (ctx.sceneRole.scene === 'intro' && ctx.sceneRole.index === 0) {
      openingBars[ctx.sceneRole.introOrder] += 2;
      openingHits[ctx.sceneRole.introOrder] += events.filter((event) => event.instrument === 'drums').length;
    }
    for (const event of events) {
      if (event.instrument === 'drums') sceneDrums[scene]++;
      else sceneNotes[scene][event.instrument]++;
      const allowed = event.instrument === 'drums' ? playsHit(ctx.sceneRole, event) : plays(ctx.sceneRole, event.instrument);
      const announcement = event.instrument === 'drums' && event.part === 'snare' && event.layer === 'fill';
      if (!allowed && !(announcesSnare(ctx) && announcement)) misplaced++;
    }
    for (const event of fx) fxCounts[event.fx]++;
    const leadIn = dropLeadIn(ctx);
    // The first drop always starts the cycle's second 32 bars, so only the build before it lies in the first.
    if (leadIn !== null) leadIns[ctx.sectionInCycle < SECTIONS_PER_PHRASE ? 'first' : 'second'][leadIn]++;
    if (ctx.isSectionStart && (ctx.sectionRole.isPhraseStart || ctx.sectionRole.relation === 'transition')) {
      const plan = ctx.sectionRole.relation === 'transition' ? 'transition' : 'main';
      styles[sub.style][plan]++;
      reeseStyles[reese.style][plan]++;
      stabStyles[stab.style][plan]++;
    }
    if (ctx.isSectionStart && ctx.sectionRole.isPhraseStart) {
      const main = ctx.progression as MainProgression;
      mainProgressions[skeletonName(main.skeleton)]! += 1;
      if (previousMain !== undefined && previousMain !== main) mainChanges++;
      previousMain = main;
    }
    if (ctx.isSectionStart && ctx.sectionRole.relation === 'transition') {
      transitionProgressions[skeletonName(ctx.progression.skeleton)]! += 1;
    }
    const chord = chordOf(ctx);
    const name = romanName(chord);
    chords[name] = (chords[name] ?? 0) + 1;
    if (isBorrowed(chord)) borrowed[chord.symbol as BorrowedSymbol]++;
    if (chord.tension !== null) tensions[chord.tension]++;
    const bassTones: readonly number[] = CHORD_TONES.map((tone) => chordToneClass(ctx.key, chord, tone));
    const upperTones: readonly number[] = chordClasses(ctx.key, chord);
    for (const event of [...sub.notes, ...reese.notes, ...stab.hits, pad]) {
      pitchedNotes[event.instrument]++;
      const [lowest, highest] = RANGES[event.instrument];
      const allowed = 'pitch' in event ? bassTones : upperTones;
      for (const pitch of 'pitch' in event ? [event.pitch] : event.voicing) {
        if (!allowed.includes(pitch % 12)) outOfChord++;
        if (!isBorrowed(chord) && degreeOf(ctx.key, pitch) === undefined) outOfScale++;
        if (pitch < lowest || pitch > highest) outOfRange++;
      }
    }
    for (const note of sub.notes) {
      const degree = degreeOf(ctx.key, note.pitch);
      degrees[degree === undefined ? OUTSIDE : DEGREE_NAMES[degree]!]++;
      subNotes++;
      subSteps += note.length;
      if (note.pitch >= LOWEST_PITCH + 12) octaveJumps++;
    }
    for (const event of ctx.drums.hits) {
      hits[event.part][event.layer]++;
      hits[event.part].total++;
      sectionHits[sectionIn32][event.part]++;
    }
    if (ctx.isSectionStart && ctx.sectionRole.isPhraseStart) {
      if (previousReference !== undefined) {
        phraseBoundaries++;
        if (refreshesReference(ctx.sceneRole)) refreshable++;
        if (!patternsEqual(previousReference, layers.reference)) referenceChanges++;
      }
      previousReference = layers.reference;
    }
    const shape = heardShape(ctx, events);
    if (shape === previousShape) repeatedPairs++;
    previousShape = shape;

    if (ctx.isSectionStart) {
      distinctBases.add(JSON.stringify(layers.base));
      const before = previousBase;
      if (before !== undefined) {
        boundaries++;
        if (patternsEqual(before, layers.base)) repeatedSections++;
        for (const part of PARTS) {
          const cells = slotsOf(part).filter(
            (slot) => motifCell(before, part, slot) !== motifCell(layers.base, part, slot),
          ).length;
          changedCells[part] += cells;
          if (cells > 0) changedSections[part]++;
        }
      }
      previousBase = layers.base;
    }
    if (ctx.isSectionEnd) fills[layers.fill?.kind ?? 'none']++;
    if (layers.fill !== null) fillLengths[layers.fill.length]++;
  }

  const barCount = pairs * 2;
  const perBar = (n: number) => n / barCount;
  return {
    bars: barCount,
    seed,
    initialKey,
    live,
    density: Object.fromEntries(
      PARTS.map((part) => {
        const { base, ornament, fill, total } = hits[part];
        return [part, { base: perBar(base), ornament: perBar(ornament), fill: perBar(fill), total: perBar(total) }];
      }),
    ) as SimulationReport['density'],
    densityBySection: Object.fromEntries(
      SECTIONS_IN_32.map((s) => [
        s,
        Object.fromEntries(PARTS.map((part) => [part, sectionHits[s][part] / Math.max(1, sectionBars[s])])),
      ]),
    ) as PerSection<PerPart<number>>,
    phrase: { boundaries: phraseBoundaries, refreshable, referenceChanges },
    mutation: { changedSections, changedCells, boundaries },
    repetition: {
      pair: pairs > 1 ? repeatedPairs / (pairs - 1) : 0,
      section: boundaries > 0 ? repeatedSections / boundaries : 0,
      distinctBasePatterns: distinctBases.size,
    },
    harmony: {
      main: mainProgressions,
      transition: transitionProgressions,
      mainChanges,
      modulations,
      barsByFifths,
      chords,
      borrowed,
      tensions,
      outOfChord,
      outOfScale,
      outOfRange,
    },
    notesPerPair: Object.fromEntries(PITCHED_PARTS.map((part) => [part, pitchedNotes[part] / pairs])) as Record<
      PitchedPart,
      number
    >,
    reese: { styles: reeseStyles },
    stab: { styles: stabStyles },
    sub: {
      styles,
      degrees: Object.fromEntries(
        ([...DEGREE_NAMES, OUTSIDE] as const).map((d) => [d, degrees[d] / Math.max(1, subNotes)]),
      ) as Record<DegreeName, number>,
      octaveJumps: octaveJumps / Math.max(1, subNotes),
      notesPerPair: subNotes / pairs,
      meanLength: subSteps / Math.max(1, subNotes),
    },
    arrangement: {
      cycles,
      lengths: cycleLengths,
      leads,
      extensions,
      introOrders,
      introOpeningHitsPerBar: Object.fromEntries(
        INTRO_ORDERS.map((order) => [order, openingHits[order] / Math.max(1, openingBars[order])]),
      ) as Record<IntroOrder, number>,
      leadIns,
      scenes: Object.fromEntries(
        SCENES.map((scene): [Scene, SceneStats] => {
          const bars = sceneBars[scene];
          const notes = sceneNotes[scene];
          return [
            scene,
            {
              bars,
              drumHitsPerBar: sceneDrums[scene] / Math.max(1, bars),
              notesPerPair: Object.fromEntries(
                PITCHED_PARTS.map((part) => [part, notes[part] / Math.max(1, bars / 2)]),
              ) as Record<PitchedPart, number>,
            },
          ];
        }),
      ) as Record<Scene, SceneStats>,
      misplaced,
    },
    timbre,
    fx: fxCounts,
    fills,
    fillLengths,
    generationMs: { mean: totalMs / pairs, max: maxMs },
  };
}

/**
 * What a 2-bar unit sounds like apart from the chord it is played on. Layers do not change what is heard, and bass
 * pitches count as tones of the chord, so that repeat units on different chords count as repeats. The stab and the
 * pad count by position only: a tension on one chord and not the next changes which tones they sound.
 */
function heardShape(ctx: Context, events: readonly NoteEvent[]): string {
  const chord = chordOf(ctx);
  const fromRoot = (pitch: number) => CHORD_TONES.find((tone) => chordToneClass(ctx.key, chord, tone) === pitch % 12);
  return events
    .map((e) => {
      switch (e.instrument) {
        case 'drums':
          return `d${e.step}:${e.part}:${e.velocity}`;
        case 'sub':
        case 'reese':
          return `${e.instrument}${e.step}:${e.length}:${fromRoot(e.pitch)}`;
        case 'stab':
        case 'pad':
          return `${e.instrument}${e.step}:${e.length}`;
      }
    })
    .join(' ');
}
