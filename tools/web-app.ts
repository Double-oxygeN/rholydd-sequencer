import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { transformWithOxc, type Plugin, type ResolvedConfig } from 'vite';
import { PAGE } from './page-meta.ts';

const MANIFEST = 'manifest.webmanifest';
const SERVICE_WORKER = 'sw.js';
const SOURCE = new URL('../src/service-worker.ts', import.meta.url);
/** Read afresh on every opening, network first, rather than kept with the files (src/service-worker.ts). */
const NOT_PRECACHED = new Set(['config.json']);

/** What lets the page be added to a home screen. The start URL has no query, so it never opens on a shared seed. */
export function manifest(base: string): Record<string, unknown> {
  const icon = (size: number, purpose: string) => ({
    src: `${base}icons/${purpose === 'maskable' ? 'icon-maskable' : 'icon'}-${size}.png`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });
  return {
    name: PAGE.name,
    short_name: PAGE.name,
    description: PAGE.description,
    lang: 'ja',
    start_url: base,
    scope: base,
    display: 'standalone',
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
    theme_color: PAGE.colors.light,
    background_color: PAGE.colors.light,
  };
}

/** A built or public file, by its path from the page. */
export interface PageFile {
  readonly path: string;
  readonly content: string | Uint8Array;
}

/**
 * The files the service worker keeps, the page itself as ./ for a shared link's query to match, and a version that
 * changes with any file's contents, names that never change such as the samples' and the icons' included.
 */
export function precache(files: readonly PageFile[]): { readonly paths: readonly string[]; readonly version: string } {
  const kept = files
    .filter(({ path }) => !NOT_PRECACHED.has(path) && path !== SERVICE_WORKER)
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const { path, content } of kept) hash.update(path).update('\0').update(content).update('\0');
  return { paths: kept.map(({ path }) => (path === 'index.html' ? './' : path)), version: hash.digest('hex').slice(0, 16) };
}

function publicFiles(directory: string): PageFile[] {
  if (directory === '') return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(directory, full).split(sep).join('/'), content: readFileSync(full) };
    });
}

/**
 * Installs the page and keeps it openable offline: a manifest, and a service worker that only the build registers, so
 * that a kept old version never gets in the way of checking edited code on the dev server.
 */
export function webApp(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'web-app',
    // After Vite's own, so that the bundle holds index.html by the time the files to keep are listed.
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'manifest', href: `${config.base}${MANIFEST}` }, injectTo: 'head' }],
    configureServer(server) {
      server.middlewares.use(`/${MANIFEST}`, (_, response) => {
        response.setHeader('Content-Type', 'application/manifest+json');
        response.end(JSON.stringify(manifest(config.base)));
      });
    },
    async generateBundle(_, bundle) {
      const manifestText = JSON.stringify(manifest(config.base), null, 2);
      this.emitFile({ type: 'asset', fileName: MANIFEST, source: manifestText });
      const built = Object.values(bundle).map((file) => ({
        path: file.fileName,
        content: file.type === 'chunk' ? file.code : file.source,
      }));
      const { paths, version } = precache([
        ...built,
        { path: MANIFEST, content: manifestText },
        ...publicFiles(config.publicDir),
      ]);
      const { code } = await transformWithOxc(readFileSync(SOURCE, 'utf8'), SOURCE.pathname, { lang: 'ts' });
      const values = `const PRECACHE = ${JSON.stringify(paths)};\nconst VERSION = ${JSON.stringify(version)};\n`;
      this.emitFile({ type: 'asset', fileName: SERVICE_WORKER, source: values + code });
    },
  };
}
