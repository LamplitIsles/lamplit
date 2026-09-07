import { error } from '@sveltejs/kit';
import { Marked, Renderer } from 'marked';
import { content } from '$lib/content';
import { locales, localeParams, localize } from '$lib/i18n';
import type { EntryGenerator, PageServerLoad } from './$types';

const articles = import.meta.glob('/src/lib/content/*/*.md', {
  query: '?raw', import: 'default', eager: true
}) as Record<string, string>;

export const entries: EntryGenerator = () => locales.flatMap((locale) =>
  content[locale].docs.map(({ slug }) => ({ ...localeParams(locale), slug }))
);

export const load: PageServerLoad = async ({ params, parent }) => {
  const { locale, docs, site } = await parent();
  const index = docs.findIndex((doc) => doc.slug === params.slug);
  const doc = docs[index];
  const markdown = articles[`/src/lib/content/${locale}/${params.slug}.md`];
  if (!doc || !markdown) error(404, site.error.notFound);
  const marked = new Marked({
    renderer: {
      code: (token) => new Renderer().code(token).replace('<pre>', '<pre tabindex="0">')
    },
    walkTokens(token) {
      if (token.type === 'link' && token.href.startsWith('/') && !token.href.startsWith('//')) {
        token.href = localize(token.href, locale);
      }
    }
  });
  // Only reviewed repository Markdown is rendered; never accept user HTML here.
  return { doc, html: await marked.parse(markdown), next: docs[index + 1] ?? null };
};
