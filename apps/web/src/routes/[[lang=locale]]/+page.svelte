<script lang="ts">
  import { localize } from '$lib/i18n';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const site = $derived(data.site);
  const path = (href: string) => localize(href, data.locale);
  import Illustration from '$lib/components/Illustration.svelte';
</script>

<svelte:head>
  <title>{site.title}</title>
  <meta name="description" content={site.description} />
  <meta property="og:title" content={site.title} />
  <meta property="og:description" content={site.description} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content={data.locale === 'en' ? 'en_US' : 'zh_CN'} />
</svelte:head>

<main id="main">
  <section class="hero-section" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow"><span aria-hidden="true">✦</span> {site.hero.eyebrow}</p>
      <h1 id="hero-title">{site.hero.lines[0]}<br /><em>{site.hero.lines[1]}</em></h1>
      <p class="hero-intro">{site.hero.intro}</p>
      <p class="hero-body">{site.hero.body}</p>
      <div class="hero-actions"><a class="btn btn-primary" href={path('/docs/start/')}>{site.hero.start}<span aria-hidden="true">↗</span></a><a class="text-link" href="#together">{site.hero.explore}<span aria-hidden="true"> ↓</span></a></div>
      <p class="hero-note">{site.hero.note}</p>
    </div>
    <div class="candle-scene" aria-hidden="true">
      <div class="scene-halo"></div><div class="window-line"></div><div class="window-line second"></div>
      <div class="candle"><div class="flame-halo"></div><div class="flame"></div><div class="wick"></div><div class="wax"></div><div class="candle-base"></div></div>
      <div class="table-line"></div><p class="scene-caption">{site.hero.caption}</p>
    </div>
    <div class="hero-bottom"><span>LAMPLIT ISLES</span><span>{site.hero.chapter}</span><a href="#together" aria-label={site.hero.explore}>↓</a></div>
  </section>

  <section class="opening section-wrap" aria-labelledby="opening-title">
    <p class="eyebrow">{site.opening.label}</p>
    <h2 id="opening-title">{site.opening.title}</h2><p>{site.opening.body}</p>
  </section>

  <section class="feature section-wrap together" id="together" aria-labelledby="together-title">
    <figure class="phone-figure"><Illustration kind="keet" copy={site.illustrations} /><figcaption>{site.together.caption}</figcaption></figure>
    <div class="feature-copy"><p class="eyebrow">{site.together.label}</p><h2 id="together-title">{site.together.title}</h2><p>{site.together.body}</p><p class="detail">{site.together.detail}</p><a class="text-link" href={path('/docs/keet/')}>{site.together.link}<span aria-hidden="true"> ↗</span></a></div>
  </section>

  <section class="memory-section" id="memory" aria-labelledby="memory-title">
    <div class="section-wrap memory-inner"><div class="feature-copy"><p class="eyebrow">{site.memory.label}</p><h2 id="memory-title">{site.memory.title}</h2><p>{site.memory.body}</p><p class="detail">{site.memory.detail}</p><a class="text-link" href={path('/docs/memory/')}>{site.memory.link}<span aria-hidden="true"> ↗</span></a></div>
    <figure><Illustration kind="memory" copy={site.illustrations} /><figcaption>{site.memory.caption}</figcaption></figure></div>
  </section>

  <section class="home-section section-wrap" aria-labelledby="home-title">
    <div><p class="eyebrow">{site.home.label}</p><h2 id="home-title">{site.home.title}</h2></div>
    <div class="home-principles">{#each site.home.items as item, i}<div><span class="principle-number">0{i + 1}</span><h3>{item.title}</h3><p>{item.body}</p></div>{/each}</div>
  </section>

  <section class="start-section section-wrap" id="start" aria-labelledby="start-title"><p class="eyebrow">{site.start.label}</p><h2 id="start-title">{site.start.title}</h2><p class="start-intro">{site.start.intro}</p>
    <div class="variants">{#each site.start.variants as variant}<article><span class="variant-name">{variant.name}</span><h3>{variant.subtitle}</h3><p>{variant.body}</p><a class="btn" href={path(variant.href)}>{variant.action}<span aria-hidden="true"> ↗</span></a></article>{/each}</div><p class="detail">{site.start.note}</p>
  </section>

  <section class="faq-section section-wrap" aria-labelledby="faq-title"><h2 id="faq-title">{site.faqTitle}</h2><div>{#each site.faqs as faq}<details><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>{/each}</div></section>
  <div class="closing"><span class="brand-flame" aria-hidden="true"></span><p>{site.closing}</p></div>
</main>
