<script lang="ts">
  import { media } from '$lib/media';
  import type { SiteContent } from '$lib/content';
  let { kind, copy }: { kind: 'keet' | 'memory'; copy: SiteContent['screenshots']['keet'] } = $props();
  const capture = $derived(media[kind]);
</script>

<div class:phone={kind === 'keet'} class:graph={kind === 'memory'} class="screenshot-slot">
  {#if capture}
    <img src={capture.src} width={capture.width} height={capture.height} alt={copy.alt} loading="lazy" decoding="async" />
  {:else}
    <div class="capture-placeholder" role="img" aria-label={`${copy.label}，${copy.note}`}>
      <span class="capture-corners" aria-hidden="true"></span>
      <span class="capture-symbol" aria-hidden="true">{kind === 'keet' ? '↗' : '✧'}</span>
      <span>{copy.label}</span>
      <small>{copy.note}</small>
    </div>
  {/if}
</div>
