<script lang="ts">
  import { ESCROW_STATUS, ESCROW_TONE_CLASSES, ESCROW_TONE_DOT } from '$lib/escrow';
  import type { EscrowStatus } from '$lib/escrow';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { MessageSquare } from '@steeze-ui/feather-icons';
  import type { PageData } from './$types';

  export let data: PageData;

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const party = (u: string | null | undefined, n: string | null | undefined) => (u ? '@' + u : n || '—');

  const filters = [
    { key: 'active', label: 'Active' },
    { key: 'disputed', label: 'Disputed' },
    { key: 'all', label: 'All' },
  ];
</script>

<svelte:head><title>Escrow admin - Sereni</title></svelte:head>

<div class="mb-5">
  <h1 class="font-montserrat font-bold text-2xl tracking-tight">Escrow management</h1>
  <p class="text-sm text-neutral-400">Monitor deals, step into disputes, and message both parties.</p>
</div>

<div class="grid grid-cols-2 sm:grid-cols-5 divide-x divide-neutral-800/80 border-y border-neutral-800/80 mb-6">
  <div class="py-5 px-4"><p class="text-xs text-neutral-500">Active</p><p class="font-montserrat font-bold text-2xl tabular-nums">{data.stats.active}</p></div>
  <div class="py-5 px-4"><p class="text-xs text-neutral-500">Disputed</p><p class="font-montserrat font-bold text-2xl tabular-nums {data.stats.disputed ? 'text-red-400' : ''}">{data.stats.disputed}</p></div>
  <div class="py-5 px-4 border-t sm:border-t-0 border-neutral-800/80"><p class="text-xs text-neutral-500">Held</p><p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">${data.stats.held.toFixed(2)}</p></div>
  <div class="py-5 px-4 border-t sm:border-t-0 border-neutral-800/80"><p class="text-xs text-neutral-500">Completed</p><p class="font-montserrat font-bold text-2xl tabular-nums">{data.stats.completed}</p></div>
  <div class="py-5 px-4 border-t sm:border-t-0 border-neutral-800/80 col-span-2 sm:col-span-1"><p class="text-xs text-neutral-500">Fee revenue</p><p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">${data.revenue.toFixed(2)}</p></div>
</div>

<div class="flex gap-1 mb-4 p-1 bg-neutral-800 rounded-lg w-max text-sm">
  {#each filters as f}
    <a href={`?filter=${f.key}`} class="px-3 py-1 rounded-md transition {data.filter === f.key ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:text-white'}">{f.label}</a>
  {/each}
</div>

{#if data.escrows.length === 0}
  <div class="card text-center py-14 text-neutral-400">No deals in this view.</div>
{:else}
  <div class="card !p-0 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr><th>Deal</th><th>Parties</th><th>Amount</th><th>Status</th><th>Created</th><th class="text-right">Manage</th></tr>
        </thead>
        <tbody>
          {#each data.escrows as e (e.id)}
            {@const meta = ESCROW_STATUS[e.status]}
            <tr>
              <td>
                <div class="font-mono text-sm">{e.publicId}</div>
                <div class="text-xs text-neutral-500 truncate max-w-[12rem]">{e.title}{#if e.isGuest} · guest{/if}</div>
              </td>
              <td class="text-sm">
                <div>{party(e.buyer?.username, e.buyerName)} <span class="text-neutral-600">→ buyer</span></div>
                <div>{party(e.seller?.username, e.sellerName)} <span class="text-neutral-600">→ seller</span></div>
              </td>
              <td class="font-mono tabular-nums text-emerald-400">${e.amount.toFixed(2)}</td>
              <td><span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border {ESCROW_TONE_CLASSES[meta.tone]}"><span class="w-1.5 h-1.5 rounded-full {ESCROW_TONE_DOT[meta.tone]}"></span>{meta.label}</span></td>
              <td class="text-sm text-neutral-400 whitespace-nowrap">{fmtDate(e.createdAt)}</td>
              <td class="text-right">
                <a href={`/escrow/${e.publicId}`} class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition">
                  Open
                  {#if e._count.messages}<span class="inline-flex items-center gap-1 text-xs text-neutral-400"><Icon src={MessageSquare} class="w-3.5 h-3.5" />{e._count.messages}</span>{/if}
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  <p class="text-xs text-neutral-500 mt-3">Open a deal to view progress, read the chat, message both parties, freeze it, or resolve a dispute.</p>
{/if}
