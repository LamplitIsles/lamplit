<script lang="ts">
  import { localize } from '$lib/i18n';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const site = $derived(data.site);
  const docs = $derived(data.docs);
  const path = (href: string) => localize(href, data.locale);
</script>

<svelte:head><title>{data.doc.title} — Lamplit</title><meta name="description" content={data.doc.description} /></svelte:head>
<main id="main" class="doc-shell section-wrap">
  <aside class="docs-sidebar"><nav aria-label={site.docs.navLabel}><p class="eyebrow">{site.docs.label}</p><a href={path('/docs/')}>{site.docs.back}</a>{#each docs as doc}<a href={path(`/docs/${doc.slug}/`)} aria-current={data.doc.slug === doc.slug ? 'page' : undefined}>{doc.title}</a>{/each}</nav></aside>
  <article class="doc-article"><p class="eyebrow">{site.name} / {data.doc.title}</p><h1>{data.doc.title}</h1><p class="doc-description">{data.doc.description}</p><div class="prose-content">{@html data.html}</div><div class="doc-next"><a href={path('/docs/')}>← {site.docs.back}</a>{#if data.next}<a href={path(`/docs/${data.next.slug}/`)}>{site.docs.next} · {data.next.title} →</a>{:else}<a href={path('/')}>{site.docs.home} →</a>{/if}</div></article>
</main>
