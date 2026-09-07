import { content } from '$lib/content';
import { locales, localize } from '$lib/i18n';
import { siteOrigin } from '$lib/site-origin';

export const prerender = true;

export function GET() {
  const paths = ['/', '/docs/', ...content['zh-CN'].docs.map(({ slug }) => `/docs/${slug}/`)];
  const urls = paths.flatMap((path) => locales.map((locale) => {
    const alternates = locales.map((language) =>
      `<xhtml:link rel="alternate" hreflang="${language}" href="${siteOrigin}${localize(path, language)}"/>`
    ).join('');
    return `<url><loc>${siteOrigin}${localize(path, locale)}</loc>${alternates}</url>`;
  })).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}
