import { content } from '$lib/content';
import { localeFromPath, unlocalize, localize } from '$lib/i18n';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url }) => {
  const locale = localeFromPath(url.pathname);
  const path = unlocalize(url.pathname);
  const otherLocale = locale === 'en' ? 'zh-CN' : 'en';
  return {
    ...content[locale], locale, path, otherLocale,
    languageHref: localize(path, otherLocale)
  };
};
