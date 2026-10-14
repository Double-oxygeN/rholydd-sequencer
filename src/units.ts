declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Value in the closed interval [0, 1]. Used for probabilities, weights and UI knobs. */
export type UnitInterval = Brand<number, 'UnitInterval'>;

export function clampUnit(x: number): UnitInterval {
  if (Number.isNaN(x)) return 0 as UnitInterval;
  return Math.min(1, Math.max(0, x)) as UnitInterval;
}

export function isUnit(x: number): x is UnitInterval {
  return x >= 0 && x <= 1;
}
