import { readFileSync } from 'node:fs';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { APP_NAME } from '../src/app-name.ts';

const { description, homepage } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  description: string;
  homepage: string;
};
const TOKENS = readFileSync(new URL('../src/ui/styles/tokens.css', import.meta.url), 'utf8');

/** The page's background in each colour scheme, as tokens.css paints it. */
export interface SchemeColors {
  readonly light: string;
  readonly dark: string;
}

export function backgrounds(css: string): SchemeColors {
  const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
  const bg = (block: string) => {
    const value = /--bg:\s*([^;]+);/.exec(block)?.[1]?.trim();
    if (value === undefined) throw new Error('tokens.css sets no --bg');
    return value;
  };
  return { light: bg(css.slice(0, darkStart)), dark: bg(css.slice(darkStart)) };
}

/**
 * What a link to the page says about it, wherever it is shared. The address comes from package.json's homepage, as
 * the base path comes from its name, so that moving the page means changing package.json alone; a build for another
 * place with --base still points its previews here.
 */
export const PAGE = {
  name: APP_NAME,
  description,
  url: homepage,
  colors: backgrounds(TOKENS),
  shareImage: {
    url: new URL('icons/share.png', homepage).href,
    width: 1200,
    height: 630,
    alt: `${APP_NAME} のアイコン（シーケンサーのマスで描いた鳥）と、名前と「Endless generative drum & bass」の文字`,
  },
} as const;

type Meta = Readonly<Record<string, string>>;

/**
 * Written into index.html when it is built or served, since the crawlers that make link previews run no scripts. The
 * description stays in Japanese, the language index.html declares: a crawler reads one static page whatever the
 * screen's language turns out to be.
 */
export function pageMetaTags(): readonly Meta[] {
  const { shareImage, colors } = PAGE;
  return [
    { name: 'description', content: PAGE.description },
    { property: 'og:title', content: PAGE.name },
    { property: 'og:description', content: PAGE.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: PAGE.url },
    { property: 'og:image', content: shareImage.url },
    { property: 'og:image:width', content: String(shareImage.width) },
    { property: 'og:image:height', content: String(shareImage.height) },
    { property: 'og:image:alt', content: shareImage.alt },
    { property: 'og:locale', content: 'ja_JP' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'theme-color', content: colors.light, media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: colors.dark, media: '(prefers-color-scheme: dark)' },
  ];
}

export function pageMeta(): Plugin {
  return {
    name: 'page-meta',
    transformIndexHtml: (): HtmlTagDescriptor[] =>
      pageMetaTags().map((attrs) => ({ tag: 'meta', attrs: { ...attrs }, injectTo: 'head' })),
  };
}
