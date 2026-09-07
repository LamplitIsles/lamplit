import { locales, localeParams } from '$lib/i18n';
import type { EntryGenerator } from './$types';

export const entries: EntryGenerator = () => locales.map(localeParams);
