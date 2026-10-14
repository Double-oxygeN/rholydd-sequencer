import { parseArgs } from 'node:util';
import { compose } from '../src/generators/drums/compose.ts';
import { ALL_FILL_KINDS, FILL_LENGTHS, type FillKind, type FillLength } from '../src/generators/drums/fill.ts';
import { createDrumGenerator } from '../src/generators/drums/index.ts';
import { motifCell, patternsEqual, type Pattern } from '../src/generators/drums/pattern.ts';
import { slotsOf } from '../src/generators/drums/weights.ts';
import { ALL_STEPS, PARTS, type Layer, type NoteEvent, type Part } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { parseSeed, type Seed } from '../src/random/rng.ts';
import { createConductor, type LiveParams } from '../src/structure/conductor.ts';
import type { SectionIn32 } from '../src/structure/form.ts';
import { clampUnit } from '../src/units.ts';

export interface SimulationOptions {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
}

type PerPart<T> = Record<Part, T>;
type PerSection<T> = Record<SectionIn32, T>;

const SECTION_LABEL: PerSection<string> = { 0: 'A', 1: "A'", 2: 'B', 3: "A''" };
const SECTIONS_IN_32: readonly SectionIn32[] = [0, 1, 2, 3];

export interface SimulationReport {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
  /** Average hits per bar for each part, split by layer. */
  readonly density: PerPart<Record<Layer | 'total', number>>;
  /** Average hits per bar for each part within each section of the 32-bar phrase. */
  readonly densityBySection: PerSection<PerPart<number>>;
  readonly phrase: {
    /** Number of 32-bar boundaries after the first phrase. */
    readonly boundaries: number;
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
    /** Share of 2-bar units whose events equal those of the previous 2 bars. */
    readonly pair: number;
    /** Share of 8-bar sections whose base pattern equals that of the previous section. */
    readonly section: number;
    readonly distinctBasePatterns: number;
  };
  readonly fills: Record<FillKind | 'none', number>;
  readonly fillLengths: Record<FillLength, number>;
  readonly generationMs: { readonly mean: number; readonly max: number };
}

const perPart = <T>(make: () => T): PerPart<T> =>
  Object.fromEntries(PARTS.map((part) => [part, make()])) as PerPart<T>;

export function simulate({ bars, seed, live }: SimulationOptions): SimulationReport {
  const conductor = createConductor(seed);
  const generator = createDrumGenerator();
  const pairs = Math.ceil(bars / 2);

  const hits = perPart(() => ({ base: 0, ornament: 0, fill: 0, total: 0 }));
  const sectionHits = Object.fromEntries(SECTIONS_IN_32.map((s) => [s, perPart(() => 0)])) as PerSection<PerPart<number>>;
  const sectionBars = Object.fromEntries(SECTIONS_IN_32.map((s) => [s, 0])) as PerSection<number>;
  let phraseBoundaries = 0;
  let referenceChanges = 0;
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
  let previousEvents: readonly NoteEvent[] | undefined;
  let previousBase: Pattern | undefined;

  for (let i = 0; i < pairs; i++) {
    const ctx = conductor.next(live);
    const start = performance.now();
    const layers = generator.generateLayers(ctx);
    const events = compose(layers.base, layers.ornaments, layers.fill);
    const elapsed = performance.now() - start;
    totalMs += elapsed;
    maxMs = Math.max(maxMs, elapsed);

    const { sectionIn32 } = ctx.sectionRole;
    sectionBars[sectionIn32] += 2;
    for (const event of events) {
      hits[event.part][event.layer]++;
      hits[event.part].total++;
      sectionHits[sectionIn32][event.part]++;
    }
    if (ctx.isSectionStart && ctx.sectionRole.isPhraseStart) {
      if (previousReference !== undefined) {
        phraseBoundaries++;
        if (!patternsEqual(previousReference, layers.reference)) referenceChanges++;
      }
      previousReference = layers.reference;
    }
    if (previousEvents !== undefined && sameEvents(previousEvents, events)) repeatedPairs++;
    previousEvents = events;

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
    phrase: { boundaries: phraseBoundaries, referenceChanges },
    mutation: { changedSections, changedCells, boundaries },
    repetition: {
      pair: pairs > 1 ? repeatedPairs / (pairs - 1) : 0,
      section: boundaries > 0 ? repeatedSections / boundaries : 0,
      distinctBasePatterns: distinctBases.size,
    },
    fills,
    fillLengths,
    generationMs: { mean: totalMs / pairs, max: maxMs },
  };
}

function sameEvents(a: readonly NoteEvent[], b: readonly NoteEvent[]): boolean {
  return (
    a.length === b.length &&
    a.every((e, i) => e.step === b[i]?.step && e.part === b[i]?.part && e.velocity === b[i]?.velocity)
  );
}

function formatReport(report: SimulationReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(2).padStart(6);
  const { live, mutation } = report;
  const lines = [
    `bars: ${report.bars}  seed: ${report.seed}  m2: ${live.m2}  m8: ${live.m8}  m32: ${live.m32}  energyDepth: ${live.energyDepth}  fillIntensity: ${live.fillIntensity}`,
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
    `Reference changed at ${report.phrase.referenceChanges} of ${report.phrase.boundaries} 32-bar boundaries`,
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

function main() {
  const { values } = parseArgs({
    options: {
      bars: { type: 'string', default: '4096' },
      seed: { type: 'string', default: '42' },
      m2: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m2) },
      m8: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m8) },
      m32: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.m32) },
      energy: { type: 'string', default: String(DEFAULT_LIVE_PARAMS.energyDepth) },
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
  const report = simulate({ bars, seed, live });
  console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (import.meta.main) main();
