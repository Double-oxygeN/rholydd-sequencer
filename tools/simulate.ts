import { parseArgs } from 'node:util';
import { ALL_FILL_KINDS, FILL_LENGTHS, type FillKind, type FillLength } from '../src/generators/drums/fill.ts';
import { motifCell, patternsEqual, type Pattern } from '../src/generators/drums/pattern.ts';
import { slotsOf } from '../src/generators/drums/weights.ts';
import { createEnsemble } from '../src/generators/ensemble.ts';
import type { FxEvent } from '../src/generators/fx/index.ts';
import { PAD_HIGHEST, PAD_LOWEST } from '../src/generators/pad/index.ts';
import { REESE_HIGHEST, REESE_LOWEST } from '../src/generators/reese/index.ts';
import { REESE_STYLES, type ReeseStyle } from '../src/generators/reese/styles.ts';
import { STAB_HIGHEST, STAB_LOWEST } from '../src/generators/stab/index.ts';
import { STAB_STYLES, type StabStyle } from '../src/generators/stab/styles.ts';
import { HIGHEST_PITCH, LOWEST_PITCH } from '../src/generators/sub/pitch.ts';
import { SUB_STYLES, type SubStyle } from '../src/generators/sub/styles.ts';
import { PARTS, type Layer, type NoteEvent, type Part, type PitchedEvent } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { parseSeed, type Seed } from '../src/random/rng.ts';
import {
  BARS_PER_SECTION,
  cycleSections,
  plays,
  playsHit,
  refreshesReference,
  type CycleLayout,
  type Scene,
} from '../src/structure/arrangement.ts';
import { chordOf, type Context, type LiveParams } from '../src/structure/conductor.ts';
import type { SectionIn32 } from '../src/structure/form.ts';
import {
  MAIN_PROGRESSIONS,
  TRANSITION_PROGRESSIONS,
  isChordTone,
  progressionName,
  rootDegree,
  type MainProgression,
} from '../src/structure/harmony.ts';
import { DEFAULT_KEY, KEY_NAMES, degreeOf, parseKey, type Key } from '../src/structure/key.ts';
import { PAD_TIMBRES, REESE_TIMBRES, STAB_TIMBRES, type CycleTimbre } from '../src/structure/timbre.ts';
import { clampUnit } from '../src/units.ts';

export interface SimulationOptions {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
  readonly initialKey?: Key;
}

const DEGREE_NAMES = ['1', '2', '♭3', '4', '5', '♭6', '♭7'] as const;

type PerPart<T> = Record<Part, T>;
type PerSection<T> = Record<SectionIn32, T>;

const SECTION_LABEL: PerSection<string> = { 0: 'A', 1: "A'", 2: 'B', 3: "A''" };
const SECTIONS_IN_32: readonly SectionIn32[] = [0, 1, 2, 3];

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
    /** Notes of any pitched part outside the chord of their 2 bars. The generators should never produce one. */
    readonly outOfChord: number;
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
    /** Share of notes on each scale degree counted from the tonic of the cycle's key. */
    readonly degrees: Record<(typeof DEGREE_NAMES)[number], number>;
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
    readonly scenes: Record<Scene, SceneStats>;
    /** Heard events of parts that their scene leaves out, apart from the snare roll ending a breakdown. Always 0. */
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

const SCENES: readonly Scene[] = ['intro', 'build', 'drop', 'breakdown'];
const TIMBRE_TABLES: Readonly<Record<keyof CycleTimbre, readonly string[]>> = {
  reese: REESE_TIMBRES,
  stab: STAB_TIMBRES,
  pad: PAD_TIMBRES,
};
const TIMBRE_PARTS = Object.keys(TIMBRE_TABLES) as (keyof CycleTimbre)[];
const FX_KINDS: readonly FxEvent['fx'][] = ['riser', 'sweep', 'impact', 'throw', 'filterReset', 'gap'];
const LEAD_BARS = [16, 24] as const;

function extensionOf(layout: CycleLayout): DropExtension {
  if (layout.firstDrop === 2) return layout.secondDrop === 2 ? 'both' : 'first';
  return layout.secondDrop === 2 ? 'second' : 'none';
}
const PITCHED_PARTS: readonly PitchedPart[] = ['sub', 'reese', 'stab', 'pad'];
const RANGES: Readonly<Record<PitchedPart, readonly [number, number]>> = {
  sub: [LOWEST_PITCH, HIGHEST_PITCH],
  reese: [REESE_LOWEST, REESE_HIGHEST],
  stab: [STAB_LOWEST, STAB_HIGHEST],
  pad: [PAD_LOWEST, PAD_HIGHEST],
};

/** Number of phrases using each style for A, A' and A'', and for B. */
type StyleCounts<S extends string> = Record<S, { main: number; transition: number }>;

function styleCounts<S extends string>(styles: readonly S[]): StyleCounts<S> {
  return Object.fromEntries(styles.map((s) => [s, { main: 0, transition: 0 }])) as StyleCounts<S>;
}

const perPart = <T>(make: () => T): PerPart<T> =>
  Object.fromEntries(PARTS.map((part) => [part, make()])) as PerPart<T>;

export function simulate({ bars, seed, live, initialKey = DEFAULT_KEY }: SimulationOptions): SimulationReport {
  const ensemble = createEnsemble({ seed, initialKey });
  const pairs = Math.ceil(bars / 2);

  const styles = styleCounts(SUB_STYLES);
  const reeseStyles = styleCounts(REESE_STYLES);
  const stabStyles = styleCounts(STAB_STYLES);
  const pitchedNotes: Record<PitchedPart, number> = { sub: 0, reese: 0, stab: 0, pad: 0 };
  let outOfRange = 0;
  const mainProgressions = Object.fromEntries(MAIN_PROGRESSIONS.map((p) => [progressionName(p), 0]));
  const transitionProgressions = Object.fromEntries(TRANSITION_PROGRESSIONS.map((p) => [progressionName(p), 0]));
  let previousMain: MainProgression | undefined;
  let mainChanges = 0;
  let previousKey: Key | undefined;
  const modulations = { dominant: 0, subdominant: 0 };
  const barsByFifths = Object.fromEntries(SIGNED_FIFTHS.map((f) => [signed(f), 0])) as Record<string, number>;
  let outOfChord = 0;
  const degrees = Object.fromEntries(DEGREE_NAMES.map((d) => [d, 0])) as Record<(typeof DEGREE_NAMES)[number], number>;
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
    for (const event of events) {
      if (event.instrument === 'drums') sceneDrums[scene]++;
      else sceneNotes[scene][event.instrument]++;
      const allowed = event.instrument === 'drums' ? playsHit(ctx.sceneRole, event) : plays(ctx.sceneRole, event.instrument);
      const announcesDrums = event.instrument === 'drums' && event.part === 'snare' && event.layer === 'fill';
      if (!allowed && !(scene === 'breakdown' && announcesDrums)) misplaced++;
    }
    for (const event of fx) fxCounts[event.fx]++;
    if (ctx.isSectionStart && (ctx.sectionRole.isPhraseStart || ctx.sectionRole.relation === 'transition')) {
      const plan = ctx.sectionRole.relation === 'transition' ? 'transition' : 'main';
      styles[sub.style][plan]++;
      reeseStyles[reese.style][plan]++;
      stabStyles[stab.style][plan]++;
    }
    if (ctx.isSectionStart && ctx.sectionRole.isPhraseStart) {
      const main = ctx.progression as MainProgression;
      mainProgressions[progressionName(main)]! += 1;
      if (previousMain !== undefined && previousMain !== main) mainChanges++;
      previousMain = main;
    }
    if (ctx.isSectionStart && ctx.sectionRole.relation === 'transition') {
      transitionProgressions[progressionName(ctx.progression)]! += 1;
    }
    const chord = chordOf(ctx);
    for (const event of [...sub.notes, ...reese.notes, ...stab.hits, pad]) {
      pitchedNotes[event.instrument]++;
      const [lowest, highest] = RANGES[event.instrument];
      for (const pitch of 'pitch' in event ? [event.pitch] : event.voicing) {
        const degree = degreeOf(ctx.key, pitch);
        if (degree === undefined || !isChordTone(chord, degree)) outOfChord++;
        if (pitch < lowest || pitch > highest) outOfRange++;
      }
    }
    for (const note of sub.notes) {
      const degree = degreeOf(ctx.key, note.pitch);
      if (degree !== undefined) degrees[DEGREE_NAMES[degree]!]++;
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
    harmony: { main: mainProgressions, transition: transitionProgressions, mainChanges, modulations, barsByFifths, outOfChord, outOfRange },
    notesPerPair: Object.fromEntries(PITCHED_PARTS.map((part) => [part, pitchedNotes[part] / pairs])) as Record<
      PitchedPart,
      number
    >,
    reese: { styles: reeseStyles },
    stab: { styles: stabStyles },
    sub: {
      styles,
      degrees: Object.fromEntries(DEGREE_NAMES.map((d) => [d, degrees[d] / Math.max(1, subNotes)])) as Record<
        (typeof DEGREE_NAMES)[number],
        number
      >,
      octaveJumps: octaveJumps / Math.max(1, subNotes),
      notesPerPair: subNotes / pairs,
      meanLength: subSteps / Math.max(1, subNotes),
    },
    arrangement: {
      cycles,
      lengths: cycleLengths,
      leads,
      extensions,
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
 * What a 2-bar unit sounds like apart from the chord it is played on. Layers do not change what is heard, and
 * pitches count from the chord root, so that repeat units on different chords count as repeats. Chords count as
 * sets of tones because voice leading changes their inversion from one chord to the next.
 */
function heardShape(ctx: Context, events: readonly NoteEvent[]): string {
  const root = rootDegree(chordOf(ctx));
  const fromRoot = (pitch: number) => ((((degreeOf(ctx.key, pitch) ?? NaN) - root) % 7) + 7) % 7;
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
          return `${e.instrument}${e.step}:${e.length}:${[...new Set(e.voicing.map(fromRoot))].sort().join(',')}`;
      }
    })
    .join(' ');
}

function formatReport(report: SimulationReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(2).padStart(6);
  const { live, mutation } = report;
  const lines = [
    `bars: ${report.bars}  seed: ${report.seed}  initial key: ${KEY_NAMES[report.initialKey]}m  m2: ${live.m2}  m8: ${live.m8}  m32: ${live.m32}  energyDepth: ${live.energyDepth}  fillIntensity: ${live.fillIntensity}`,
    '',
    'Density (hits per bar)',
    '  part     total   base ornament   fill',
    ...PARTS.map((part) => {
      const d = report.density[part];
      return `  ${part.padEnd(6)} ${num(d.total)} ${num(d.base)}   ${num(d.ornament)} ${num(d.fill)}`;
    }),
    '',
    'Density by section of the 32-bar phrase (hits per bar)',
    `  section ${PARTS.map((part) => part.padStart(6)).join(' ')}`,
    ...SECTIONS_IN_32.map(
      (s) => `  ${SECTION_LABEL[s].padEnd(7)} ${PARTS.map((part) => num(report.densityBySection[s][part])).join(' ')}`,
    ),
    '',
    `Reference changed at ${report.phrase.referenceChanges} of ${report.phrase.refreshable} 32-bar boundaries that allow it (${report.phrase.boundaries} in all)`,
    '',
    ...formatArrangement(report),
    '',
    `Mutation at 8-bar boundaries (${mutation.boundaries} boundaries)`,
    '  part    changed sections   changed cells',
    ...PARTS.map(
      (part) =>
        `  ${part.padEnd(6)}  ${String(mutation.changedSections[part]).padStart(6)} (${pct(mutation.changedSections[part] / Math.max(1, mutation.boundaries)).padStart(6)})   ${String(mutation.changedCells[part]).padStart(8)}`,
    ),
    '',
    'Repetition',
    `  2 bars identical to previous 2 bars:  ${pct(report.repetition.pair)}`,
    `  8-bar base identical to previous:     ${pct(report.repetition.section)}`,
    `  distinct base patterns:               ${report.repetition.distinctBasePatterns}`,
    '',
    'Harmony (phrases per progression)',
    ...Object.entries(report.harmony.main).map(([name, count]) => `  A/A'/A''  ${name.padEnd(18)} ${String(count).padStart(6)}`),
    ...Object.entries(report.harmony.transition).map(([name, count]) => `  B         ${name.padEnd(18)} ${String(count).padStart(6)}`),
    `  main progression changed at ${report.harmony.mainChanges} of ${report.phrase.boundaries} 32-bar boundaries`,
    `  key moved to the dominant ${report.harmony.modulations.dominant} times, to the subdominant ${report.harmony.modulations.subdominant} times`,
    `  bars by fifths from the initial key: ${Object.entries(report.harmony.barsByFifths).map(([fifths, bars]) => `${fifths} ${bars}`).join('  ')}`,
    `  notes outside the chord: ${report.harmony.outOfChord}  outside the range: ${report.harmony.outOfRange}`,
    `  notes per 2 bars: ${PITCHED_PARTS.map((part) => `${part} ${report.notesPerPair[part].toFixed(2)}`).join('  ')}`,
    '',
    'Sub bass',
    `  notes per 2 bars: ${report.sub.notesPerPair.toFixed(2)}  mean length: ${report.sub.meanLength.toFixed(2)} steps  octave jumps: ${pct(report.sub.octaveJumps)}`,
    '  style          A/A\'/A\'\'      B',
    ...SUB_STYLES.map(
      (style) =>
        `  ${style.padEnd(12)} ${String(report.sub.styles[style].main).padStart(8)} ${String(report.sub.styles[style].transition).padStart(6)}`,
    ),
    `  degrees: ${DEGREE_NAMES.map((d) => `${d} ${pct(report.sub.degrees[d])}`).join('  ')}`,
    '',
    ...formatStyles('Reese', report.reese.styles),
    '',
    ...formatStyles('Stab', report.stab.styles),
    '',
    'Fills (per 8 bars)',
    ...Object.entries(report.fills).map(([kind, count]) => `  ${kind.padEnd(10)} ${String(count).padStart(6)}`),
    '',
    'Fill lengths (steps)',
    ...Object.entries(report.fillLengths).map(([length, count]) => `  ${length.padStart(2)} steps  ${String(count).padStart(6)}`),
    '',
    `Generation time per 2 bars: mean ${report.generationMs.mean.toFixed(3)} ms, max ${report.generationMs.max.toFixed(3)} ms`,
  ];
  return lines.join('\n');
}

function formatArrangement({ arrangement, fx, timbre }: SimulationReport): string[] {
  const num = (x: number) => x.toFixed(2).padStart(6);
  const count = (x: number) => String(x).padStart(6);
  return [
    `Arrangement (${arrangement.cycles} cycles)`,
    `  length:     ${Object.entries(arrangement.lengths).map(([bars, n]) => `${bars} bars ${n}`).join('  ')}`,
    `  intro/breakdown bars: ${Object.entries(arrangement.leads).map(([lead, n]) => `${lead} ${n}`).join('  ')}`,
    `  extended drops: ${Object.entries(arrangement.extensions).map(([which, n]) => `${which} ${n}`).join('  ')}`,
    `  scene        bars  drums/bar ${PITCHED_PARTS.map((part) => part.padStart(6)).join(' ')}  (notes per 2 bars)`,
    ...SCENES.map((scene) => {
      const stats = arrangement.scenes[scene];
      return `  ${scene.padEnd(10)} ${count(stats.bars)} ${num(stats.drumHitsPerBar)}    ${PITCHED_PARTS.map((part) => num(stats.notesPerPair[part])).join(' ')}`;
    }),
    `  parts heard outside their scenes: ${arrangement.misplaced}`,
    `  effects: ${FX_KINDS.map((kind) => `${kind} ${fx[kind]}`).join('  ')}`,
    `  sounds (cycles each, changes at cycle starts):`,
    ...TIMBRE_PARTS.map(
      (part) =>
        `    ${part.padEnd(6)} ${Object.entries(timbre[part].cycles).map(([name, n]) => `${name} ${n}`).join('  ')}  changed ${timbre[part].changes}`,
    ),
  ];
}

function formatStyles<S extends string>(title: string, styles: StyleCounts<S>): string[] {
  return [
    `${title}`,
    '  style          A/A\'/A\'\'      B',
    ...Object.entries<{ main: number; transition: number }>(styles).map(
      ([style, { main, transition }]) => `  ${style.padEnd(12)} ${String(main).padStart(8)} ${String(transition).padStart(6)}`,
    ),
  ];
}

function main() {
  const { values } = parseArgs({
    options: {
      bars: { type: 'string', default: '4096' },
      seed: { type: 'string', default: '42' },
      m2: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m2) },
      m8: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m8) },
      m32: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m32) },
      energy: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.energyDepth) },
      'initial-key': { type: 'string', default: KEY_NAMES[DEFAULT_KEY] },
      fill: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.fillIntensity) },
      json: { type: 'boolean', default: false },
    },
  });
  const bars = Number(values.bars);
  const seed = parseSeed(values.seed);
  if (!Number.isInteger(bars) || bars < 2) throw new Error(`--bars must be an integer of 2 or more: ${values.bars}`);
  if (seed === undefined) throw new Error(`--seed must be a 32-bit unsigned integer: ${values.seed}`);
  const live: LiveParams = {
    m2: clampUnit(Number(values.m2)),
    m8: clampUnit(Number(values.m8)),
    m32: clampUnit(Number(values.m32)),
    energyDepth: clampUnit(Number(values.energy)),
    fillIntensity: clampUnit(Number(values.fill)),
  };
  const initialKey = parseKey(values['initial-key'] ?? '');
  if (initialKey === undefined) {
    throw new Error(`--initial-key must be a note name such as F, F# or Bb: ${values['initial-key']}`);
  }
  const report = simulate({ bars, seed, live, initialKey });
  console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (import.meta.main) main();
