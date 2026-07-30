<script lang="ts">
  /** Renders an admin-configured advertisement: image, direct video, or embedded (YouTube/Vimeo). */
  export let ad: {
    enabled: boolean;
    type: string;
    media: string;
    link?: string;
    title?: string;
    caption?: string;
  };
  export let aspect = 'aspect-[16/5]';

  function embedUrl(url: string): string | null {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return null;
  }

  $: embed = ad.type === 'video' ? embedUrl(ad.media) : null;
  $: show = ad.enabled && ad.media;
</script>

{#if show}
  <div class="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 group">
    <span class="absolute top-2 right-2 z-10 text-[10px] uppercase tracking-wide bg-black/60 text-neutral-300 px-2 py-0.5 rounded">Ad</span>

    {#if ad.type === 'video' && embed}
      <div class={aspect}>
        <iframe src={embed} title={ad.title || 'Advertisement'} class="w-full h-full" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>
    {:else if ad.type === 'video'}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video src={ad.media} class="w-full {aspect} object-cover" autoplay muted loop playsinline controls></video>
    {:else}
      <svelte:element this={ad.link ? 'a' : 'div'} href={ad.link || undefined} target={ad.link ? '_blank' : undefined} rel="noopener" class="block">
        <img src={ad.media} alt={ad.title || 'Advertisement'} class="w-full {aspect} object-cover group-hover:scale-[1.02] transition-transform duration-500" />
      </svelte:element>
    {/if}

    {#if ad.title || ad.caption}
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-none">
        {#if ad.title}<p class="font-bold text-lg">{ad.title}</p>{/if}
        {#if ad.caption}<p class="text-sm text-neutral-300">{ad.caption}</p>{/if}
      </div>
    {/if}
  </div>
{/if}
