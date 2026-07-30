<script lang="ts">
  import { Box, Copy, MessageCircle, Check } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { enhance } from '$app/forms';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import type { PageData } from './$types';

  export let data: PageData;

  let copied = '';

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const typeLabel = (t: string) => (t === 'DOWNLOAD' ? 'Download' : t === 'SERVICE' ? 'Service' : 'License');

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = key;
      toast.push('Copied', { theme: toastThemes.success });
      setTimeout(() => (copied = copied === key ? '' : copied), 1500);
    });
  }
</script>

<svelte:head><title>Orders - Sereni</title></svelte:head>

<div class="flex items-center justify-between mb-5">
  <div>
    <h1 class="text-2xl font-bold">Your orders</h1>
    <p class="text-sm text-neutral-400">Everything you've purchased and your delivered items.</p>
  </div>
  <a href="/" class="text-sm text-neutral-400 hover:text-emerald-300">Browse →</a>
</div>

{#if data.orders.length === 0}
  <div class="card text-center py-16">
    <div class="w-20 h-20 bg-neutral-800 rounded-full grid place-items-center mx-auto mb-4">
      <Icon src={Box} class="w-9 h-9 text-neutral-500" />
    </div>
    <h2 class="text-xl font-bold mb-1">No orders yet</h2>
    <p class="text-sm text-neutral-400 mb-6 max-w-sm mx-auto">When you buy a product or service, it shows up here with your delivered content.</p>
    <a href="/" class="btn !w-auto px-6 inline-block mx-auto">Start shopping</a>
  </div>
{:else}
  <div class="space-y-4">
    {#each data.orders as order (order.id)}
      <div class="card !p-0 overflow-hidden">
        <!-- Order header -->
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800 bg-neutral-900/40">
          <div>
            <span class="font-semibold">Order #{order.id}</span>
            <span class="text-xs text-neutral-500 ml-2">{fmt(order.createdAt)}</span>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="text-neutral-400">{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</span>
            <span class="font-semibold text-emerald-400">${order.total.toFixed(2)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{order.status}</span>
          </div>
        </div>

        <!-- Items -->
        <div class="divide-y divide-neutral-800/60">
          {#each order.cart as entry, i}
            <div class="px-4 py-3">
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="min-w-0">
                  <a href={`/product/${entry.product.id}`} class="font-medium hover:text-emerald-300 transition">{entry.quantity}× {entry.product.name}</a>
                  <p class="text-xs text-neutral-500 mt-0.5">
                    {typeLabel(entry.product.type)} · sold by
                    <a href={`/seller/${entry.product.seller.id}`} class="hover:text-emerald-300">@{entry.product.seller.username}</a>
                  </p>
                </div>
                <form method="post" action="?/messageSeller" use:enhance class="shrink-0">
                  <input type="hidden" name="sellerId" value={entry.product.seller.id} />
                  <button class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs transition" title="Message the seller">
                    <Icon src={MessageCircle} class="w-3.5 h-3.5" /> Message seller
                  </button>
                </form>
              </div>

              {#if entry.delivered}
                <div class="rounded-lg border border-neutral-800 bg-neutral-950/60 overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800/60">
                    <span class="text-[11px] uppercase tracking-wide text-neutral-500">Delivered</span>
                    <button type="button" class="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-emerald-300" on:click={() => copy(entry.delivered, `${order.id}-${i}`)}>
                      <Icon src={copied === `${order.id}-${i}` ? Check : Copy} class="w-3 h-3" />
                      {copied === `${order.id}-${i}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre class="px-3 py-2.5 text-xs text-neutral-200 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">{entry.delivered}</pre>
                </div>
              {:else}
                <p class="text-xs text-neutral-500 italic">No delivered content recorded.</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}
