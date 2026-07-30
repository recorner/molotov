<script lang="ts">
  import { txDisplay, TONE_CLASSES, TONE_DOT } from '$lib/txStatus';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { FileText } from '@steeze-ui/feather-icons';
  import type { PageData } from './$types';

  export let data: PageData;

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  $: totalDeposited = data.topUps
    .filter((t) => t.completed)
    .reduce((s, t) => s + t.amount, 0);
</script>

<svelte:head><title>Payment history - Sereni</title></svelte:head>

<div class="flex items-center justify-between mb-5">
  <div>
    <h1 class="font-montserrat font-bold text-2xl tracking-tight">Payment history</h1>
    <p class="text-sm text-neutral-400">Your top-ups and their status.</p>
  </div>
  <a href="/balance" class="btn !w-auto px-4">Add funds</a>
</div>

<!-- Summary -->
<div class="grid grid-cols-3 divide-x divide-neutral-800/80 border-y border-neutral-800/80 mb-6">
  <div class="py-5 px-4">
    <p class="text-xs text-neutral-500">Completed deposits</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">${totalDeposited.toFixed(2)}</p>
  </div>
  <div class="py-5 px-4">
    <p class="text-xs text-neutral-500">Transactions</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums">{data.pagination.totalCount}</p>
  </div>
  <div class="py-5 px-4">
    <p class="text-xs text-neutral-500">Current balance</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">${data.user.balance.toFixed(2)}</p>
  </div>
</div>

{#if data.topUps.length === 0}
  <div class="card text-center py-16">
    <div class="w-14 h-14 rounded-full bg-neutral-800 grid place-items-center mx-auto mb-4">
      <Icon src={FileText} class="w-6 h-6 text-neutral-500" />
    </div>
    <p class="font-medium mb-1">No transactions yet</p>
    <p class="text-sm text-neutral-400 mb-5">Top up your balance to get started.</p>
    <a href="/balance" class="btn !w-auto px-5 mx-auto inline-block">Add funds</a>
  </div>
{:else}
  <div class="card !p-0 overflow-hidden divide-y divide-neutral-800">
    {#each data.topUps as tx (tx.id)}
      {@const d = txDisplay(tx.status, tx.completed, tx.createdAt)}
      <a
        href={`/balance/history/${tx.id}`}
        class="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-neutral-800/50 transition"
      >
        <span class="grid place-items-center w-10 h-10 rounded-full bg-neutral-800 shrink-0">
          <span class="w-2 h-2 rounded-full {TONE_DOT[d.tone]}"></span>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold tabular-nums">${tx.amount.toFixed(2)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full border {TONE_CLASSES[d.tone]}">{d.label}</span>
          </div>
          <p class="text-xs text-neutral-500 truncate">{fmtDate(tx.createdAt)}</p>
        </div>
        <div class="text-right hidden sm:block">
          <p class="text-[11px] text-neutral-500 font-mono truncate max-w-[10rem]">
            {tx.reference ? `#${tx.reference}` : '—'}
          </p>
        </div>
        <span class="text-neutral-600">›</span>
      </a>
    {/each}
  </div>

  <!-- Pagination -->
  {#if data.pagination.totalPages > 1}
    <div class="flex items-center justify-between mt-4 text-sm">
      <a
        href={`?page=${data.pagination.currentPage - 1}`}
        class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasPrev ? 'hover:bg-neutral-800' : 'pointer-events-none opacity-40'}"
      >← Previous</a>
      <span class="text-neutral-400">Page {data.pagination.currentPage} of {data.pagination.totalPages}</span>
      <a
        href={`?page=${data.pagination.currentPage + 1}`}
        class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasNext ? 'hover:bg-neutral-800' : 'pointer-events-none opacity-40'}"
      >Next →</a>
    </div>
  {/if}
{/if}
