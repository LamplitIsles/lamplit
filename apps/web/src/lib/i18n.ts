export const locales = ['en', 'zh-CN'] as const;
export type Locale = (typeof locales)[number];

export function localeFromPath(path: string): Locale {
  return /^\/zh(?:\/|$)/.test(path) ? 'zh-CN' : 'en';
}

export function unlocalize(path: string): string {
  return path.replace(/^\/zh(?=\/|$)/, '') || '/';
}

// Paths in content are language-neutral root-relative URLs.
export function localize(path: string, locale: Locale): string {
  return locale === 'zh-CN' ? `/zh${path}` : path;
}

export function localeParams(locale: Locale): { lang?: 'zh' } {
  return locale === 'zh-CN' ? { lang: 'zh' } : {};
}
