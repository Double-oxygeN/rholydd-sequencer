import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_CONFIG, parseConfigText, type Config } from '../src/params/config.ts';
import { parseSeed } from '../src/random/rng.ts';
import type { LiveParams } from '../src/structure/conductor.ts';
import { KEY_NAMES, parseKey } from '../src/structure/key.ts';
import { clampUnit } from '../src/units.ts';

import { formatReport } from './simulation/format.ts';
import { simulate } from './simulation/report.ts';

/** Reads --config as the page reads config.json, warning on standard error about every value left at its default. */
function readConfig(path: string | undefined): Config {
  if (path === undefined) return DEFAULT_CONFIG;
  const { value, warnings } = parseConfigText(readFileSync(path, 'utf8'));
  for (const warning of warnings) console.error(warning);
  return value;
}

function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      bars: { type: 'string', default: '4096' },
      seed: { type: 'string' },
      m2: { type: 'string' },
      m8: { type: 'string' },
      m32: { type: 'string' },
      energy: { type: 'string' },
      'initial-key': { type: 'string' },
      fill: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  // Options given on the command line win over the config file, which wins over the defaults.
  const config = readConfig(values.config);
  const { params } = config;
  const bars = Number(values.bars);
  const seed = parseSeed(values.seed ?? String(params.seed ?? 42));
  if (!Number.isInteger(bars) || bars < 2) throw new Error(`--bars must be an integer of 2 or more: ${values.bars}`);
  if (seed === undefined) throw new Error(`--seed must be a 32-bit unsigned integer: ${values.seed}`);
  const live: LiveParams = {
    m2: clampUnit(Number(values.m2 ?? params.m2)),
    m8: clampUnit(Number(values.m8 ?? params.m8)),
    m32: clampUnit(Number(values.m32 ?? params.m32)),
    energyDepth: clampUnit(Number(values.energy ?? params.energyDepth)),
    fillIntensity: clampUnit(Number(values.fill ?? params.fillIntensity)),
  };
  const initialKey = parseKey(values['initial-key'] ?? KEY_NAMES[params.initialKey] ?? '');
  if (initialKey === undefined) {
    throw new Error(`--initial-key must be a note name such as F, F# or Bb: ${values['initial-key']}`);
  }
  const report = simulate({ bars, seed, live, initialKey, tuning: config.generation });
  console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (import.meta.main) main();
