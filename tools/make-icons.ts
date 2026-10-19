import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { APP_NAME } from '../src/app-name.ts';

// The PNGs are drawn by the Chromium the end-to-end tests already use, so that no image library joins the
// dependencies. They are committed, like the drum samples, so that neither the build nor CI has to start a browser.

const ICON_DIR = join(import.meta.dirname, '..', 'public', 'icons');
const SOURCE = readFileSync(join(ICON_DIR, 'icon.svg'), 'utf8');
/** The icon's own background, which fills the corners wherever the OS crops or rounds the icon itself. */
const BACKGROUND = '#141416';
/**
 * Android keeps only a circle of 80% of a maskable icon's width. The 7×7 cells span 376 of the 512 units, so at this
 * scale their corners, where the bird's wing and tail sit, stay within it.
 */
const MASKABLE_SCALE = 0.76;
/** The shared image says what the page is in English, which more of the people a link reaches can read. */
const TAGLINE = 'Endless generative drum & bass';

interface Image {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly html: string;
}

const svgUrl = `data:image/svg+xml;base64,${Buffer.from(SOURCE).toString('base64')}`;

const page = (body: string, background: string) => `<!doctype html>
<style>
  html, body { margin: 0; height: 100%; background: ${background}; }
  body { display: grid; place-items: center; overflow: hidden; }
</style>
${body}`;

const icon = (size: number): Image => ({
  file: `icon-${size}.png`,
  width: size,
  height: size,
  html: page(`<img src="${svgUrl}" width="${size}" height="${size}">`, 'transparent'),
});

const filled = (file: string, size: number, scale: number): Image => ({
  file,
  width: size,
  height: size,
  html: page(`<img src="${svgUrl}" width="${size * scale}" height="${size * scale}">`, BACKGROUND),
});

const SHARE: Image = {
  file: 'share.png',
  width: 1200,
  height: 630,
  html: page(
    `<style>
      main { display: flex; align-items: center; gap: 64px; padding: 0 96px; font-family: system-ui, sans-serif; }
      h1 { margin: 0 0 20px; color: #ececf0; font-size: 76px; font-weight: 700; letter-spacing: -0.01em; }
      p { margin: 0; color: #9a9aa3; font-size: 38px; line-height: 1.3; }
    </style>
    <main>
      <img src="${svgUrl}" width="320" height="320">
      <div><h1>${APP_NAME}</h1><p>${TAGLINE}</p></div>
    </main>`,
    BACKGROUND,
  ),
};

const IMAGES: readonly Image[] = [
  icon(192),
  icon(512),
  filled('icon-maskable-512.png', 512, MASKABLE_SCALE),
  // iOS rounds the corners itself and shows black where an icon is transparent.
  filled('apple-touch-icon.png', 180, 1),
  SHARE,
];

async function draw(tab: Page, image: Image): Promise<void> {
  await tab.setViewportSize({ width: image.width, height: image.height });
  await tab.setContent(image.html);
  await tab.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const path = join(ICON_DIR, image.file);
  await tab.screenshot({ path, omitBackground: true });
  console.log(`wrote ${path}`);
}

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ deviceScaleFactor: 1 });
  for (const image of IMAGES) await draw(tab, image);
} finally {
  await browser.close();
}
