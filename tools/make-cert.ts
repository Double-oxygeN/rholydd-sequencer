import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CERT_FILE, KEY_FILE } from './dev-certificate.ts';

// The addresses a phone on the LAN may reach this machine at, plus the ones a browser on this machine uses.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address !== undefined && address.family === 'IPv4' && !address.internal)
  .map((address) => address!.address);
const names = ['localhost', '127.0.0.1', '::1', ...lanAddresses];

mkdirSync(new URL('.', CERT_FILE), { recursive: true });
execFileSync('mkcert', ['-cert-file', fileURLToPath(CERT_FILE), '-key-file', fileURLToPath(KEY_FILE), ...names], {
  stdio: 'inherit',
});
const caRoot = execFileSync('mkcert', ['-CAROOT'], { encoding: 'utf8' }).trim();
console.log(`
Certificate for: ${names.join(', ')}
Trust it on a phone by installing ${caRoot}/rootCA.pem there (on iOS, then turn on full trust for it in
Settings > General > About > Certificate Trust Settings). Run \`mkcert -install\` once for this machine's browsers.
Run this again whenever the LAN address changes.`);
