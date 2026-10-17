import type { Seconds } from '../engine/ducking.ts';
import { DEFAULT_SOUND_TUNING, type CompressorTuning, type Hertz, type SoundTuning } from '../engine/tuning.ts';
import { DEFAULT_GENERATION_TUNING, type GenerationTuning, type ToneWeights } from '../generators/tuning.ts';
import type { Velocity } from '../generators/types.ts';
import type { Seed } from '../random/rng.ts';
import type { LiveParams } from '../structure/conductor.ts';
import { DEFAULT_KEY, KEY_NAMES, parseKey, type Key } from '../structure/key.ts';
import type { PhraseCurve } from '../structure/tuning.ts';
import {
  DEFAULT_DUCKING,
  DEFAULT_MIXER,
  LEVEL_RANGE,
  RELEASE_RANGE,
  type Channel,
  type DuckingSettings,
  type Fader,
  type MixerSettings,
  type SendingChannel,
} from './mixer.ts';
import { BPM_RANGE, DEFAULT_BPM, DEFAULT_LIVE_PARAMS, DEFAULT_VOLUME, randomSeed, type Bpm, type Params } from './store.ts';
import type { UnitInterval } from '../units.ts';
import { bool, decode, numberIn, related, weights, type Decoded, type Decoder, type ObjectSchema } from './decode.ts';

/**
 * Everything the config file may override. The file is read once when the page opens; whatever it leaves out, or
 * gets wrong, falls back to the defaults below, so a missing or broken file never stops the page from starting.
 */
export interface Config {
  readonly params: InitialParams;
  readonly mixer: MixerSettings;
  readonly ducking: DuckingSettings;
  readonly generation: GenerationTuning;
  readonly sound: SoundTuning;
}

export interface InitialParams extends LiveParams {
  readonly bpm: Bpm;
  readonly volume: UnitInterval;
  readonly initialKey: Key;
  /** Absent unless the file names one; the query string and then a random seed decide otherwise. */
  readonly seed: Seed | undefined;
}

export const DEFAULT_CONFIG: Config = {
  params: { ...DEFAULT_LIVE_PARAMS, bpm: DEFAULT_BPM, volume: DEFAULT_VOLUME, initialKey: DEFAULT_KEY, seed: undefined },
  mixer: DEFAULT_MIXER,
  ducking: DEFAULT_DUCKING,
  generation: DEFAULT_GENERATION_TUNING,
  sound: DEFAULT_SOUND_TUNING,
};

/** The values the page starts with. The seed comes from the query string, then the config file, then chance. */
export function initialParams(config: Config, querySeed: Seed | undefined): Params {
  const { seed, ...params } = config.params;
  return { ...params, seed: querySeed ?? seed ?? randomSeed(), mixer: config.mixer, ducking: config.ducking };
}

export function parseConfigText(text: string): Decoded<Config> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { value: DEFAULT_CONFIG, warnings: [`設定ファイルを JSON として読めないので、すべて既定値を使います: ${String(error)}`] };
  }
  return decodeConfig(raw);
}

export function decodeConfig(raw: unknown): Decoded<Config> {
  const warnings: string[] = [];
  const value = decode(CONFIG_SCHEMA, raw, DEFAULT_CONFIG, '', (message) => warnings.push(message));
  return { value, warnings };
}

const unit = numberIn<UnitInterval>(0, 1);
const velocity = numberIn<Velocity>(0, 1, { openMin: true });
const seconds = numberIn<Seconds>(0, 1, { openMin: true });
const hertz = numberIn<Hertz>(20, 20000);

const keyName: Decoder<Key> = (raw, fallback, path, warn) => {
  const key = typeof raw === 'string' ? parseKey(raw) : undefined;
  if (key !== undefined) return key;
  warn(`${path}: F、F#、B♭ のようなキーの名前でないので、既定値 ${KEY_NAMES[fallback]} を使います`);
  return fallback;
};

const seed: Decoder<Seed | undefined> = (raw, fallback, path, warn) => {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff) return raw as Seed;
  warn(`${path}: 0〜4294967295 の整数でないので無視します`);
  return fallback;
};

const PHRASE_NAMES = { A: 0, "A'": 1, B: 2, "A''": 3 } as const;

/** The drop's curve, written with the names of the sections rather than their numbers. */
const phraseCurve: Decoder<PhraseCurve> = (raw, fallback, path, warn) => {
  const named = Object.fromEntries(Object.entries(PHRASE_NAMES).map(([name, i]) => [name, fallback[i]]));
  const schema = Object.fromEntries(Object.keys(PHRASE_NAMES).map((name) => [name, unit]));
  const value = decode(schema as ObjectSchema<Record<string, UnitInterval>>, raw, named as Record<string, UnitInterval>, path, warn);
  return { 0: value.A!, 1: value["A'"]!, 2: value.B!, 3: value["A''"]! };
};

const channel: ObjectSchema<Channel> = {
  level: numberIn(LEVEL_RANGE.min, LEVEL_RANGE.max, { step: 1 }),
  muted: bool,
  soloed: bool,
};
const sendingChannel: ObjectSchema<SendingChannel> = {
  ...channel,
  pan: numberIn(-1, 1, { step: 0.01 }),
  send: unit,
};
const fader: ObjectSchema<Fader> = { level: channel.level, muted: bool };

const compressor: ObjectSchema<CompressorTuning> = {
  threshold: numberIn(-40, 0),
  ratio: numberIn(1, 20),
  attack: seconds,
  release: seconds,
};

const toneWeights: Decoder<ToneWeights> = weights(['root', 'third', 'fifth', 'seventh'] as const);

const CONFIG_SCHEMA: ObjectSchema<Config> = {
  params: {
    bpm: numberIn(BPM_RANGE.min, BPM_RANGE.max, { step: 1 }),
    volume: unit,
    m2: unit,
    m8: unit,
    m32: unit,
    fillIntensity: unit,
    energyDepth: unit,
    initialKey: keyName,
    seed,
  },
  mixer: {
    kick: channel,
    snare: sendingChannel,
    hat: sendingChannel,
    ghost: sendingChannel,
    sub: channel,
    reese: sendingChannel,
    stab: sendingChannel,
    pad: sendingChannel,
    fx: sendingChannel,
    reverbReturn: fader,
  },
  ducking: {
    depth: unit,
    release: numberIn(RELEASE_RANGE.min, RELEASE_RANGE.max, { step: 1 }),
  },
  generation: {
    harmony: { tensionChance: unit, borrowChance: unit, modulationShare: unit },
    energy: related(
      { phrase: phraseCurve, scene: { intro: unit, buildFirst: unit, buildLast: unit, breakdown: unit } },
      ({ phrase, scene }) => scene.buildFirst <= scene.buildLast && scene.buildLast <= phrase[0],
      'scene.buildFirst ≤ scene.buildLast ≤ phrase.A ',
    ),
    layout: {
      longIntroChance: unit,
      longBreakdownChance: unit,
      dropExtension: weights(['none', 'first', 'second', 'both'] as const),
    },
    fill: {
      sectionLength: weights([4, 8, 16, 32] as const),
      phraseLength: weights([16, 32] as const),
    },
    lines: {
      subOctaveJumpChance: unit,
      subToneWeights: toneWeights,
      reeseToneWeights: toneWeights,
      velocity: { sub: velocity, reese: velocity, stab: velocity, pad: velocity, pickup: velocity },
    },
  },
  sound: {
    trimDb: {
      kick: numberIn(-60, 0),
      snare: numberIn(-60, 0),
      hat: numberIn(-60, 0),
      ghost: numberIn(-60, 0),
      sub: numberIn(-60, 0),
      reese: numberIn(-60, 0),
      stab: numberIn(-60, 0),
      pad: numberIn(-60, 0),
      fx: numberIn(-60, 0),
    },
    duckRatio: { sub: unit, reese: unit, pad: unit },
    reverb: { decay: numberIn(0.1, 10), preDelay: numberIn(0, 0.5) },
    dynamics: { drumBus: compressor, masterBus: compressor, limiterThresholdDb: numberIn(-12, 0) },
    fx: {
      riser: related({ peakGain: unit, lowHz: hertz, highHz: hertz }, (r) => r.lowHz < r.highHz, 'lowHz < highHz '),
      highpass: related({ openHz: hertz, closedHz: hertz }, (h) => h.openHz < h.closedHz, 'openHz < closedHz '),
      lowpass: related({ closedHz: hertz, openHz: hertz }, (l) => l.closedHz < l.openHz, 'closedHz < openHz '),
      throwSend: unit,
      impactVolumeDb: numberIn(-40, 0),
    },
  },
};
