<script lang="ts">
  import '../app.css';
  import { localize } from '$lib/i18n';
  import { siteOrigin } from '$lib/site-origin';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';
  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  const site = $derived(data.site);
  const path = (href: string) => localize(href, data.locale);
</script>

<svelte:head>
  <link rel="canonical" href={siteOrigin + localize(data.path, data.locale)} />
  <link rel="alternate" hreflang="zh-CN" href={siteOrigin + localize(data.path, 'zh-CN')} />
  <link rel="alternate" hreflang="en" href={siteOrigin + localize(data.path, 'en')} />
  <link rel="alternate" hreflang="x-default" href={siteOrigin + localize(data.path, 'zh-CN')} />
  <meta property="og:url" content={siteOrigin + localize(data.path, data.locale)} />
</svelte:head>
<a class="skip-link" href="#main">{site.skip}</a>
<header class="site-header">
  <a class="wordmark" href={path('/')} aria-label={site.homeLabel}><span class="brand-flame" aria-hidden="true"></span>lamplit<span class="wordmark-dot">.</span></a>
  <nav aria-label={site.navLabel}>
    {#each site.nav as item}<a href={path(item.href)}>{item.label}</a>{/each}
    <a class="source-link" href={site.sourceUrl}>{site.source}<span aria-hidden="true"> ↗</span></a>
    <a class="language-link" href={data.languageHref} lang={data.otherLocale} hreflang={data.otherLocale} aria-label={site.languageLabel}>{site.languageName}</a>
  </nav>
</header>
{@render children()}
<footer class="site-footer">
  <div><a class="footer-wordmark" href={path('/')}>lamplit.</a><p>{site.footer}</p></div>
  <div class="footer-links"><a href={path('/docs/')}>{site.nav[2].label}</a><a href={site.sourceUrl}>{site.source} ↗</a><a href="/licenses.txt">{site.legalLabel}</a><span>{site.license}</span></div>
</footer>
