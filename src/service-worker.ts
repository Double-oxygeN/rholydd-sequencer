/*
 * Keeps the page openable offline once it has been opened. tools/web-app.ts strips the types from this file and puts
 * the two values below in front of it, so it imports nothing and is served as sw.js beside index.html.
 */

/** Every file of the build and of public/ but config.json, relative to this script. */
declare const PRECACHE: readonly string[];
/** A hash of those files' contents, so that any file changed makes a new cache. */
declare const VERSION: string;

// The DOM library this file is checked with has no service worker types, so only what is used here is declared.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  readonly location: Location;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}

const scope = self as unknown as WorkerScope;
const PREFIX = 'rholydd-sequencer-';
const FILES = `${PREFIX}files-${VERSION}`;
// Apart from the files, so that the last config file read survives a new version of the page.
const CONFIG = `${PREFIX}config`;
const CONFIG_URL = new URL('config.json', scope.location.href).href;
const PAGE_URL = new URL('./', scope.location.href).href;
const precached = new Set(PRECACHE.map((path) => new URL(path, scope.location.href).href));

scope.addEventListener('install', (event) => {
  // Past the HTTP cache, which could hand over an index.html older than the scripts it names.
  const requests = [...precached].map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(FILES).then((cache) => cache.addAll(requests)));
});

// No skipWaiting and no clients.claim: a new version waits until every tab of the old one has closed, so that no
// piece changes version mid-play, and no page runs scripts of one version with the files of another.
scope.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      const old = names.filter((name) => name.startsWith(PREFIX) && name !== FILES && name !== CONFIG);
      return Promise.all(old.map((name) => caches.delete(name)));
    }),
  );
});

scope.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.hash = '';
  // A shared link carries ?seed=, which the cached page reads from its own address all the same.
  if (request.mode === 'navigate' && (url.origin + url.pathname === PAGE_URL || url.href === `${PAGE_URL}index.html`)) {
    event.respondWith(fromFiles(PAGE_URL, request));
  } else if (url.origin + url.pathname === CONFIG_URL) {
    event.respondWith(configFile(request));
  } else if (precached.has(url.href)) {
    event.respondWith(fromFiles(url.href, request));
  }
});

async function fromFiles(url: string, request: Request): Promise<Response> {
  return (await (await caches.open(FILES)).match(url)) ?? fetch(request);
}

/**
 * The network first, as the page reads the file afresh on every opening, keeping whatever answer arrives, a missing
 * file's included. Offline, the last answer kept stands in, or else a missing file: an error would read as a broken
 * file and show a warning, and the defaults would differ from those the deployment chose.
 */
async function configFile(request: Request): Promise<Response> {
  const cache = await caches.open(CONFIG);
  try {
    const response = await fetch(request);
    await cache.put(CONFIG_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(CONFIG_URL)) ?? new Response(null, { status: 404 });
  }
}
