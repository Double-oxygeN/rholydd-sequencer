import { SUB_STYLES } from '../../src/generators/sub/styles.ts';
import { PARTS } from '../../src/generators/types.ts';
import { DROP_LEAD_INS } from '../../src/structure/arrangement.ts';
import { BORROWED_SYMBOLS } from '../../src/structure/chords.ts';
import { KEY_NAMES } from '../../src/structure/key.ts';

import {
  DEGREE_NAMES,
  FX_KINDS,
  OUTSIDE,
  PITCHED_PARTS,
  SCENES,
  SECTIONS_IN_32,
  SECTION_LABEL,
  TENSIONS,
  TIMBRE_PARTS,
  type StyleCounts,
  type SimulationReport,
} from './report.ts';

export function formatReport(report: SimulationReport): string {
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
    `  chords (2 bars each): ${Object.entries(report.harmony.chords).sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => `${name} ${n}`).join('  ')}`,
    `  borrowed chords: ${BORROWED_SYMBOLS.map((s) => `${s} ${report.harmony.borrowed[s]}`).join('  ')}`,
    `  tensions: ${TENSIONS.map((t) => `${t} ${report.harmony.tensions[t]}`).join('  ')}`,
    `  notes outside the chord: ${report.harmony.outOfChord}  outside the scale without a borrowed chord: ${report.harmony.outOfScale}  outside the range: ${report.harmony.outOfRange}`,
    `  notes per 2 bars: ${PITCHED_PARTS.map((part) => `${part} ${report.notesPerPair[part].toFixed(2)}`).join('  ')}`,
    '',
    'Sub bass',
    `  notes per 2 bars: ${report.sub.notesPerPair.toFixed(2)}  mean length: ${report.sub.meanLength.toFixed(2)} steps  octave jumps: ${pct(report.sub.octaveJumps)}`,
    '  style          A/A\'/A\'\'      B',
    ...SUB_STYLES.map(
      (style) =>
        `  ${style.padEnd(12)} ${String(report.sub.styles[style].main).padStart(8)} ${String(report.sub.styles[style].transition).padStart(6)}`,
    ),
    `  degrees: ${([...DEGREE_NAMES, OUTSIDE] as const).map((d) => `${d} ${pct(report.sub.degrees[d])}`).join('  ')}`,
    '',
    ...formatStyles('Reese', report.reese.styles),
    '',
    ...formatStyles('Stab', report.stab.styles),
    '',
    'Cymbals',
    `  crashes heard: ${Object.entries(report.cymbal.crashes).map(([place, n]) => `${place} ${n}`).join('  ')}`,
    `  ride styles (cycles): ${Object.entries(report.cymbal.rideStyles).map(([style, n]) => `${style} ${n}`).join('  ')}`,
    `  hits per bar by scene: ${SCENES.map((scene) => `${scene} ${Object.entries(report.arrangement.scenes[scene].cymbalsPerBar).map(([c, n]) => `${c} ${n.toFixed(2)}`).join(' ')}`).join('  ')}`,
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
    `  intro orders: ${Object.entries(arrangement.introOrders).map(([order, n]) => `${order} ${n}`).join('  ')}`,
    `  drum hits per bar in the intro's first 8 bars: ${Object.entries(arrangement.introOpeningHitsPerBar).map(([order, n]) => `${order} ${n.toFixed(2)}`).join('  ')}`,
    ...(['first', 'second'] as const).map(
      (drop) =>
        `  lead-ins into the ${drop} drop: ${DROP_LEAD_INS.map((leadIn) => `${leadIn} ${arrangement.leadIns[drop][leadIn]}`).join('  ')}`,
    ),
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
