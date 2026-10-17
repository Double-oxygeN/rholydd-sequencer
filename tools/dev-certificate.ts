import { existsSync, readFileSync } from 'node:fs';

const DIRECTORY = new URL('../.cert/', import.meta.url);
export const CERT_FILE = new URL('cert.pem', DIRECTORY);
export const KEY_FILE = new URL('key.pem', DIRECTORY);

/**
 * The certificate `npm run cert` makes for serving the dev server over https. Phones on the LAN need it: the
 * AudioWorklet that counts clipped samples only runs in a secure context, which a plain http LAN address is not.
 */
export function devCertificate(): { readonly cert: Buffer; readonly key: Buffer } {
  if (!existsSync(CERT_FILE) || !existsSync(KEY_FILE)) {
    throw new Error('No certificate in .cert/. Run `npm run cert` first.');
  }
  return { cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) };
}
