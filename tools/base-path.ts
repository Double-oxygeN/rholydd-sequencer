import { readFileSync } from 'node:fs';

const { name } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string };

/**
 * Where the built page is served from: GitHub Pages serves a project's repository under its name, and the package
 * carries the same name, so renaming the repository means changing package.json alone.
 */
export const BASE_PATH = `/${name}/`;
