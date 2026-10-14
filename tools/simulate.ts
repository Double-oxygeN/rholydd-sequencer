import { parseArgs } from 'node:util';
import { compose } from '../src/generators/drums/compose.ts';
import { FILL_KINDS, type FillKind } from '../src/generators/drums/fill.ts';
import { createDrumGenerator } from '../src/generators/drums/index.ts';
import { motifCell, patternsEqual, type Pattern } from '../src/generators/drums/pattern.ts';
import { slotsOf } from '../src/generators/drums/weights.ts';
import { ALL_STEPS, PARTS, type Layer, type NoteEvent, type Part } from '../src/generators/types.ts';
import { DEFAULT_LIVE_PARAMS } from '../src/params/store.ts';
import { parseSeed, type Seed } from '../src/random/rng.ts';
import { createConductor, type LiveParams } from '../src/structure/conductor.ts';
import { clampUnit } from '../src/units.ts';

export interface SimulationOptions {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
}

type PerPart<T> = Record<Part, T>;

export interface SimulationReport {
  readonly bars: number;
  readonly seed: Seed;
  readonly live: LiveParams;
  /** Average hits per bar for each part, split by layer. */
  readonly density: PerPart<Record<Layer | 'total', number>>;
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
  readonly generationMs: { readonly mean: number; readonly max: number };
}

const perPart = <T>(make: () => T): PerPart<T> =>
  Object.fromEntries(PARTS.map((part) => [part, make()])) as PerPart<T>;

export function simulate({ bars, seed, live }: SimulationOptions): SimulationReport {
  const conductor = createConductor(seed);
  const generator = createDrumGenerator();
  const pairs = Math.ceil(bars / 2);

  const hits = perPart(() => ({ base: 0, ornament: 0, fill: 0, total: 0 }));
  const changedSections = perPart(() => 0);
  const changedCells = perPart(() => 0);
  const fills = Object.fromEntries([...FILL_KINDS, 'none'].map((kind) => [kind, 0])) as Record<FillKind | 'none', number>;
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

    for (const event of events) {
      hits[event.part][event.layer]++;
      hits[event.part].total++;
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
    mutation: { changedSections, changedCells, boundaries },
    repetition: {
      pair: pairs > 1 ? repeatedPairs / (pairs - 1) : 0,
      section: boundaries > 0 ? repeatedSections / boundaries : 0,
      distinctBasePatterns: distinctBases.size,
    },
    fills,
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
    `bars: ${report.bars}  seed: ${report.seed}  m2: ${live.m2}  m8: ${live.m8}  fillIntensity: ${live.fillIntensity}`,
    '',
    'Density (hits per bar)',
    '  part     total   base ornament   fill',
    ...PARTS.map((part) => {
      const d = report.density[part];
      return `  ${part.padEnd(6)} ${num(d.total)} ${num(d.base)}   ${num(d.ornament)} ${num(d.fill)}`;
    }),
    '',
    `Mutation (${mutation.boundaries} boundaries)`,
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
    fillIntensity: clampUnit(Number(values.fill)),
  };
  const report = simulate({ bars, seed, live });
  console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (import.meta.main) main();
