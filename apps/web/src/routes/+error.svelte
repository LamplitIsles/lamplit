<script lang="ts">
  import { page } from '$app/state';
  import { content } from '$lib/content';
  import { localeFromPath, localize } from '$lib/i18n';
  const locale = $derived(localeFromPath(page.url.pathname));
  const site = $derived(content[locale].site);
</script>
<svelte:head><title>{page.status} — Lamplit</title></svelte:head>
<main id="main" class="docs-index section-wrap"><p class="eyebrow">{page.status}</p><h1>{site.error.title}</h1><p>{site.error.body}</p><div class="hero-actions"><a class="btn" href={localize('/', locale)}>{site.docs.home}</a><a class="text-link" href={localize('/docs/', locale)}>{site.docs.pageTitle} →</a></div></main>
