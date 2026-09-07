<script lang="ts">
  import { localize } from '$lib/i18n';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const site = $derived(data.site);
  const docs = $derived(data.docs);
</script>

<svelte:head><title>{site.docs.pageTitle} — Lamplit</title><meta name="description" content={site.docs.intro} /></svelte:head>
<main id="main" class="docs-index section-wrap">
  <p class="eyebrow">{site.docs.label}</p><h1>{site.docs.title}</h1><p>{site.docs.intro}</p>
  <div class="doc-cards">{#each docs as doc}<a href={localize(`/docs/${doc.slug}/`, data.locale)}><h2>{doc.title}<span aria-hidden="true"> ↗</span></h2><p>{doc.description}</p></a>{/each}</div>
</main>
