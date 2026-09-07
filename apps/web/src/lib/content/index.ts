import { site as zhSite } from './zh-CN/site';
import { docs as zhDocs } from './zh-CN/docs';
import { site as enSite } from './en/site';
import { docs as enDocs } from './en/docs';
import type { Locale } from '$lib/i18n';

export const content = {
  'zh-CN': { site: zhSite, docs: zhDocs },
  en: { site: enSite, docs: enDocs }
} satisfies Record<Locale, { site: typeof zhSite; docs: typeof zhDocs }>;

export type SiteContent = typeof zhSite;
