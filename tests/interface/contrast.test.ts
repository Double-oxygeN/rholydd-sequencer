import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Tokens = Readonly<Record<string, string>>;

const CSS = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');

function tokensIn(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));
}

const darkStart = CSS.indexOf('@media (prefers-color-scheme: dark)');
const LIGHT: Tokens = tokensIn(CSS.slice(0, darkStart));
const SCHEMES: Readonly<Record<string, Tokens>> = { light: LIGHT, dark: { ...LIGHT, ...tokensIn(CSS.slice(darkStart)) } };

type Rgb = readonly [number, number, number];

function rgb(hex: string): Rgb {
  const digits = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as unknown as Rgb;
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map((x) => {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT = 4.5;
const GRAPHIC = 3;

interface Pairing {
  readonly what: string;
  readonly fore: (t: Tokens) => readonly Rgb[];
  readonly back: readonly string[];
  readonly ratio: number;
}

const token = (name: string) => (t: Tokens) => [rgb(t[name]!)];
const tokens = (...names: string[]) => (t: Tokens) => names.map((name) => rgb(t[name]!));

// Every fill on the screen that means something, as the stylesheets paint it. The sequencer's hits and notes are
// left out: they are shaded by velocity, and the softest shades are meant to fade into the cell.
const PAIRINGS: readonly Pairing[] = [
  { what: 'text and labels', fore: tokens('fg', 'muted'), back: ['bg', 'panel'], ratio: TEXT },
  { what: 'text on a selected tab', fore: token('bg'), back: ['fg'], ratio: TEXT },
  { what: 'clip count and invalid fields', fore: token('accent'), back: ['bg', 'panel'], ratio: TEXT },
  { what: 'control borders', fore: token('control-border'), back: ['bg', 'panel'], ratio: GRAPHIC },
  { what: 'the focus ring', fore: token('focus'), back: ['bg', 'panel', 'cell'], ratio: GRAPHIC },
  { what: 'the play button', fore: token('accent'), back: ['bg'], ratio: GRAPHIC },
  { what: 'the icon on the play button', fore: token('on-accent'), back: ['accent'], ratio: GRAPHIC },
  { what: 'lit cells of the cycle meter', fore: tokens('base', 'fill', 'accent', 'ornament'), back: ['bg'], ratio: GRAPHIC },
  { what: 'lit cells of the 8-bar meter', fore: token('accent'), back: ['bg'], ratio: GRAPHIC },
  { what: 'lit segments of the spectrum', fore: tokens('base', 'fill', 'accent'), back: ['cell', 'panel'], ratio: GRAPHIC },
  { what: 'the level meter', fore: token('ornament'), back: ['cell'], ratio: GRAPHIC },
  { what: 'mute and solo when on', fore: tokens('fill', 'solo'), back: ['panel'], ratio: GRAPHIC },
  { what: 'the letter on mute when on', fore: token('on-fill'), back: ['fill'], ratio: TEXT },
  { what: 'the letter on solo when on', fore: token('on-solo'), back: ['solo'], ratio: TEXT },
];

describe('contrast', () => {
  for (const [scheme, t] of Object.entries(SCHEMES)) {
    for (const { what, fore, back, ratio } of PAIRINGS) {
      it(`keeps ${what} at ${ratio}:1 or more in the ${scheme} scheme`, () => {
        for (const color of fore(t)) {
          for (const name of back) expect(contrast(color, rgb(t[name]!)), `on --${name}`).toBeGreaterThanOrEqual(ratio);
        }
      });
    }
  }
});
