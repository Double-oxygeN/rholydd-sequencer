import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, decodeConfig, initialParams, parseConfigText } from '../../src/params/config.ts';
import { loadConfig } from '../../src/params/load-config.ts';
import { seedFromQuery, shareUrl } from '../../src/params/query.ts';
import { toSeed } from '../../src/random/rng.ts';
import { SILENCE, SILENT_SAMPLE, silentWav } from '../../src/ui/media-session.ts';
import { APP_NAME } from '../../src/app-name.ts';
import { pageMetaTags } from '../../tools/page-meta.ts';

describe('integration: initial seed', () => {
  it('reads a valid seed from the query string and nothing else', () => {
    expect(seedFromQuery('?seed=0')).toBe(0);
    expect(seedFromQuery('?seed=4294967295')).toBe(4294967295);
    expect(seedFromQuery('?bpm=170&seed=12345')).toBe(12345);
    for (const search of ['?seed=4294967296', '?seed=-1', '?seed=abc', '?seed=', '?seed=1.5', '', '?other=1']) {
      expect(seedFromQuery(search)).toBeUndefined();
    }
  });

  it('takes the seed from the query string, then the config file, then chance', () => {
    const withSeed = { ...DEFAULT_CONFIG, params: { ...DEFAULT_CONFIG.params, seed: toSeed(7) } };
    expect(initialParams(withSeed, toSeed(3)).seed).toBe(3);
    expect(initialParams(withSeed, undefined).seed).toBe(7);
    const drawn = new Set(Array.from({ length: 8 }, () => initialParams(DEFAULT_CONFIG, undefined).seed));
    expect(drawn.size).toBeGreaterThan(1);
  });
});

describe('integration: sharing', () => {
  const pages = [
    'https://example.com/',
    'https://example.com/rholydd-sequencer/?seed=1&bpm=170#menu',
    'http://192.168.0.2:5173/?seed=99',
  ];

  it('shares the page without its query and fragment, with the seed only when asked to', () => {
    expect(shareUrl(pages[1]!, toSeed(12345))).toBe('https://example.com/rholydd-sequencer/?seed=12345');
    expect(shareUrl(pages[1]!, undefined)).toBe('https://example.com/rholydd-sequencer/');
    expect(shareUrl(pages[2]!, undefined)).toBe('http://192.168.0.2:5173/');
  });

  it('gives back the shared seed, or none, when the link is opened', () => {
    for (const page of pages) {
      for (const seed of [toSeed(0), toSeed(12345), toSeed(4294967295)]) {
        expect(seedFromQuery(new URL(shareUrl(page, seed)).search)).toBe(seed);
      }
      expect(seedFromQuery(new URL(shareUrl(page, undefined)).search)).toBeUndefined();
    }
  });
});

describe('integration: media session', () => {
  it('loops a silent mono 8-bit WAV longer than the five seconds the media controls need', () => {
    const wav = silentWav();
    const view = new DataView(wav.buffer);
    const text = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SILENCE.sampleRate);
    expect(view.getUint16(34, true)).toBe(8);
    const data = wav.subarray(44);
    expect(data.length).toBe(view.getUint32(40, true));
    expect(data.length / SILENCE.sampleRate).toBeGreaterThan(5);
    expect(data.every((sample) => sample === SILENT_SAMPLE)).toBe(true);
  });
});

describe('integration: config file', () => {
  const example: unknown = JSON.parse(readFileSync(new URL('../../config.example.json', import.meta.url), 'utf8'));

  /** Every path to a value in a JSON object, with the value. */
  const leaves = (value: unknown, path: readonly string[] = []): [readonly string[], unknown][] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, inner]) => leaves(inner, [...path, key]))
      : value === undefined
        ? []
        : [[path, value]];

  const only = (path: readonly string[], value: unknown): unknown =>
    path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value);

  it('keeps every default without a word when the file says nothing', () => {
    expect(decodeConfig({})).toEqual({ value: DEFAULT_CONFIG, warnings: [] });
  });

  it('writes every key with its default in the example file', () => {
    expect(decodeConfig(example)).toEqual({ value: DEFAULT_CONFIG, warnings: [] });
    expect(leaves(example)).toHaveLength(leaves(DEFAULT_CONFIG).length);
  });

  it('knows every key of the example on its own, and leaves the rest at their defaults', () => {
    for (const [path, value] of leaves(example)) {
      expect(decodeConfig(only(path, value))).toEqual({ value: DEFAULT_CONFIG, warnings: [] });
    }
  });

  it('changes only the keys written', () => {
    const { value, warnings } = decodeConfig({
      params: { bpm: 170, initialKey: 'Bb', seed: 99 },
      mixer: { snare: { level: -3.4, pan: 0.123 }, reverbReturn: { muted: true } },
      generation: { harmony: { borrowChance: 0.9 }, energy: { phrase: { "A''": 0.95 } } },
      sound: { fx: { riser: { highHz: 9000 } } },
    });
    expect(warnings).toEqual([]);
    expect(value).toEqual({
      ...DEFAULT_CONFIG,
      params: { ...DEFAULT_CONFIG.params, bpm: 170, initialKey: 10, seed: 99 },
      mixer: {
        ...DEFAULT_CONFIG.mixer,
        snare: { ...DEFAULT_CONFIG.mixer.snare, level: -3, pan: 0.12 },
        reverbReturn: { ...DEFAULT_CONFIG.mixer.reverbReturn, muted: true },
      },
      generation: {
        ...DEFAULT_CONFIG.generation,
        harmony: { ...DEFAULT_CONFIG.generation.harmony, borrowChance: 0.9 },
        energy: { ...DEFAULT_CONFIG.generation.energy, phrase: { ...DEFAULT_CONFIG.generation.energy.phrase, 3: 0.95 } },
      },
      sound: {
        ...DEFAULT_CONFIG.sound,
        fx: { ...DEFAULT_CONFIG.sound.fx, riser: { ...DEFAULT_CONFIG.sound.fx.riser, highHz: 9000 } },
      },
    });
  });

  it('falls back on any value of the wrong type, one key at a time, with a warning naming it', () => {
    for (const [path] of leaves(example)) {
      const { value, warnings } = decodeConfig(only(path, 'wrong'));
      expect(value).toEqual(DEFAULT_CONFIG);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(path.join('.'));
    }
  });

  it('falls back on values out of range', () => {
    for (const raw of [
      { params: { bpm: 181 } },
      { params: { m2: -0.1 } },
      { params: { initialKey: 'H' } },
      { params: { seed: 4294967296 } },
      { mixer: { kick: { level: 7 } } },
      { mixer: { hat: { pan: 1.5 } } },
      { ducking: { release: 10 } },
      { generation: { lines: { velocity: { sub: 0 } } } },
      { sound: { trimDb: { kick: 1 } } },
      { sound: { fx: { lowpass: { openHz: 30000 } } } },
    ]) {
      const { value, warnings } = decodeConfig(raw);
      expect(value).toEqual(DEFAULT_CONFIG);
      expect(warnings).toHaveLength(1);
    }
  });

  it('falls back on a whole group whose values disagree', () => {
    for (const [raw, group] of [
      [{ generation: { energy: { scene: { buildFirst: 0.8 } } } }, 'generation.energy'],
      [{ generation: { energy: { phrase: { A: 0.7 } } } }, 'generation.energy'],
      [{ generation: { layout: { dropExtension: { none: 0, first: 0, second: 0, both: 0 } } } }, 'generation.layout.dropExtension'],
      [{ generation: { fill: { phraseLength: { 16: 0, 32: 0 } } } }, 'generation.fill.phraseLength'],
      [{ generation: { lines: { subToneWeights: { root: 0, third: 0, fifth: 0, seventh: 0 } } } }, 'generation.lines.subToneWeights'],
      [{ sound: { fx: { riser: { peakGain: 0.3, lowHz: 9000 } } } }, 'sound.fx.riser'],
      [{ sound: { fx: { highpass: { closedHz: 10 } } } }, 'sound.fx.highpass'],
      [{ sound: { fx: { lowpass: { closedHz: 19000 } } } }, 'sound.fx.lowpass'],
    ] as const) {
      const { value, warnings } = decodeConfig(raw);
      expect(value).toEqual(DEFAULT_CONFIG);
      expect(warnings.at(-1)).toContain(group);
    }
  });

  it('ignores unknown keys with a warning, and keys a channel does not have', () => {
    for (const raw of [{ tempo: 170 }, { params: { swing: 1 } }, { mixer: { kick: { pan: 0.5 } } }, { mixer: { reverbReturn: { soloed: true } } }]) {
      const { value, warnings } = decodeConfig(raw);
      expect(value).toEqual(DEFAULT_CONFIG);
      expect(warnings).toHaveLength(1);
    }
  });

  it('starts from the defaults with a warning, and never throws, when the text is no JSON or no object', () => {
    for (const text of ['{', '', 'null', '[1, 2]', '"text"', '42']) {
      const { value, warnings } = parseConfigText(text);
      expect(value).toEqual(DEFAULT_CONFIG);
      expect(warnings).toHaveLength(1);
    }
  });

  it('loads silently without a file, and with warnings when the file cannot be read', async () => {
    const answer =
      (body: string, init: ResponseInit): typeof fetch =>
      async () =>
        new Response(body, init);
    const json = { headers: { 'content-type': 'application/json' } };
    expect(await loadConfig('config.json', answer('', { status: 404 }))).toEqual({ value: DEFAULT_CONFIG, warnings: [] });
    // Vite's dev server answers a missing file with index.html.
    const html = answer('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    expect(await loadConfig('config.json', html)).toEqual({ value: DEFAULT_CONFIG, warnings: [] });
    const offline: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await loadConfig('config.json', offline)).warnings).toHaveLength(1);
    expect((await loadConfig('config.json', answer('{', json))).warnings).toHaveLength(1);
    const read = await loadConfig('config.json', answer('{"params": {"bpm": 170}}', json));
    expect(read).toEqual({ value: { ...DEFAULT_CONFIG, params: { ...DEFAULT_CONFIG.params, bpm: 170 } }, warnings: [] });
  });
});

describe('integration: link previews', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    description: string;
    homepage: string;
  };
  const tags = pageMetaTags();
  const content = (key: string) => tags.filter((tag) => tag.name === key || tag.property === key).map((tag) => tag.content);

  it('describes the page with package.json and points at where it is published', () => {
    expect(content('description')).toEqual([pkg.description]);
    expect(content('og:description')).toEqual([pkg.description]);
    expect(content('og:title')).toEqual([APP_NAME]);
    expect(content('og:url')).toEqual([pkg.homepage]);
    expect(content('og:image')).toEqual([`${pkg.homepage}icons/share.png`]);
    expect([...content('og:image:width'), ...content('og:image:height')]).toEqual(['1200', '630']);
    expect(content('twitter:card')).toEqual(['summary_large_image']);
  });

  it('colours the browser around the page with the background of each colour scheme in tokens.css', () => {
    // Read the way the contrast test reads it, so that the two never disagree on what the backgrounds are.
    const css = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');
    const [light, dark] = css.split('@media (prefers-color-scheme: dark)').map((block) => /--bg:\s*([^;]+);/.exec(block)![1]);
    const themes = tags.filter((tag) => tag.name === 'theme-color').map(({ content, media }) => ({ content, media }));
    expect(themes).toEqual([
      { content: light, media: '(prefers-color-scheme: light)' },
      { content: dark, media: '(prefers-color-scheme: dark)' },
    ]);
  });
});
