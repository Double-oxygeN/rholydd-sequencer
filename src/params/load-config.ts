import { DEFAULT_CONFIG, parseConfigText, type Config } from './config.ts';
import type { Decoded } from './decode.ts';

const NONE: Decoded<Config> = { value: DEFAULT_CONFIG, warnings: [] };

/**
 * Fetches the config file. A missing file is the normal case and passes silently. Vite's dev server answers a
 * missing file with index.html to any request accepting text/html or any type, so the request asks for JSON only, and
 * an answer that still is not JSON counts as no file, in case another server does the same.
 */
export async function loadConfig(url: string, fetchFile: typeof fetch = fetch): Promise<Decoded<Config>> {
  try {
    // no-cache asks the server each time, so that an edited file is never served from the cache on opening the page
    // again. no-store would too, but Firefox then sent the request past the service worker and failed it offline.
    const response = await fetchFile(url, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return NONE;
    return parseConfigText(await response.text());
  } catch (error) {
    return { value: DEFAULT_CONFIG, warnings: [`設定ファイルを読み込めないので、すべて既定値を使います: ${String(error)}`] };
  }
}
