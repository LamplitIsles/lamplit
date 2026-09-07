export const locales = ['zh-CN', 'en'] as const;
export type Locale = (typeof locales)[number];

export function localeFromPath(path: string): Locale {
  return /^\/en(?:\/|$)/.test(path) ? 'en' : 'zh-CN';
}

export function unlocalize(path: string): string {
  return path.replace(/^\/en(?=\/|$)/, '') || '/';
}

// Paths in content are language-neutral root-relative URLs.
export function localize(path: string, locale: Locale): string {
  return locale === 'en' ? `/en${path}` : path;
}

export function localeParams(locale: Locale): { lang?: 'en' } {
  return locale === 'en' ? { lang: 'en' } : {};
}
