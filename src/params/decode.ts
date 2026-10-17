import type { Weight } from '../units.ts';

export interface Decoded<T> {
  readonly value: T;
  /** One line per value left at its default, saying where and why. */
  readonly warnings: readonly string[];
}

export type Warn = (message: string) => void;
/** Reads one value, or returns the fallback after a warning. Never throws. */
export type Decoder<T> = (raw: unknown, fallback: T, path: string, warn: Warn) => T;
export type Schema<T> = Decoder<T> | ObjectSchema<T>;
export type ObjectSchema<T> = { readonly [K in keyof T]-?: Schema<T[K]> };

export function decode<T>(schema: Schema<T>, raw: unknown, fallback: T, path: string, warn: Warn): T {
  // A key left out is the normal way to keep a default, so it passes without a word.
  if (raw === undefined) return fallback;
  if (typeof schema === 'function') return schema(raw, fallback, path, warn);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn(`${path}: オブジェクトでないので、まとめて既定値を使います`);
    return fallback;
  }
  const entries = raw as Record<string, unknown>;
  for (const key of Object.keys(entries)) {
    if (!(key in schema)) warn(`${join(path, key)}: 知らないキーなので無視します`);
  }
  const result = { ...fallback };
  for (const key of Object.keys(schema) as (keyof T & string)[]) {
    result[key] = decode(schema[key], entries[key], fallback[key], join(path, key), warn);
  }
  return result;
}

const join = (path: string, key: string) => (path === '' ? key : `${path}.${key}`);

/** A number within [min, max] (above min when open), kept as given or rounded to a step. */
export function numberIn<T extends number>(
  min: number,
  max: number,
  { openMin = false, step }: { readonly openMin?: boolean; readonly step?: number } = {},
): Decoder<T> {
  const range = `${openMin ? '(' : '['}${min}, ${max}]`;
  return (raw, fallback, path, warn) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw > max || (openMin ? raw <= min : raw < min)) {
      warn(`${path}: ${range} の数値でないので、既定値 ${String(fallback)} を使います`);
      return fallback;
    }
    return (step === undefined ? raw : Math.round(raw / step) * step) as T;
  };
}

export const bool: Decoder<boolean> = (raw, fallback, path, warn) => {
  if (typeof raw === 'boolean') return raw;
  warn(`${path}: 真偽値でないので、既定値 ${String(fallback)} を使います`);
  return fallback;
};

/**
 * Reads a group whose values must agree with each other. When they do not, the whole group falls back: keeping
 * the half that was valid would make a mix of what was written and the defaults that neither side meant.
 */
export function related<T>(schema: ObjectSchema<T>, holds: (value: T) => boolean, relation: string): Decoder<T> {
  return (raw, fallback, path, warn) => {
    const value = decode(schema, raw, fallback, path, warn);
    if (holds(value)) return value;
    warn(`${path}: ${relation}が成り立たないので、まとめて既定値を使います`);
    return fallback;
  };
}

const weight = numberIn<Weight>(0, Number.MAX_VALUE);

/** Weights keyed by choice, which need some weight in total to choose anything. */
export function weights<K extends string | number>(keys: readonly K[]): Decoder<Readonly<Record<K, Weight>>> {
  const schema = Object.fromEntries(keys.map((key) => [key, weight])) as ObjectSchema<Readonly<Record<K, Weight>>>;
  return related(schema, (value) => keys.reduce((sum, key) => sum + value[key], 0) > 0, '重みの合計が正であること');
}
