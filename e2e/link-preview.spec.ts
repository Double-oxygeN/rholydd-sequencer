import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { APP_NAME } from '../src/app-name.ts';

const { homepage } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { homepage: string };

for (const query of ['', '?seed=12345']) {
  test(`gives crawlers the name, the description and the image${query === '' ? '' : ' with a seed in the address'}`, async ({
    page,
    request,
    baseURL,
  }) => {
    // Read from the page as served, before any script runs, as a crawler reads it.
    const html = await (await request.get(`${baseURL}${query}`)).text();
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    const meta = (key: string) => page.locator(`head meta[property="${key}"], head meta[name="${key}"]`);
    await expect(meta('og:title')).toHaveAttribute('content', APP_NAME);
    await expect(meta('description')).toHaveAttribute('content', /.+/);
    await expect(meta('og:url')).toHaveAttribute('content', homepage);
    await expect(meta('twitter:card')).toHaveAttribute('content', 'summary_large_image');
    await expect(meta('theme-color')).toHaveCount(2);

    const image = await meta('og:image').getAttribute('content');
    expect(image?.startsWith(homepage)).toBe(true);
    // The preview server serves the build at the same path as the published page.
    const response = await request.get(new URL(new URL(image!).pathname, baseURL).href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  });
}
