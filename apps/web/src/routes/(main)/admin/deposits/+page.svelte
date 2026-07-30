<script lang="ts">
  import { goto } from '$app/navigation';
  import { txDisplay, TONE_CLASSES, TONE_DOT } from '$lib/txStatus';
  import type { PageData } from './$types';

  export let data: PageData;

  let search = data.filters.search || '';

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'pending', label: 'Pending' },
    { key: 'failed', label: 'Failed' },
    { key: 'expired', label: 'Expired' },
  ];

  function setStatus(s: string) {
    const p = new URLSearchParams();
    if (data.filters.search) p.set('search', data.filters.search);
    p.set('status', s);
    goto(`/admin/deposits?${p.toString()}`);
  }
  function doSearch() {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (data.filters.status !== 'all') p.set('status', data.filters.status);
    goto(`/admin/deposits?${p.toString()}`);
  }

  $: chart = data.stats.chartData || [];
  $: chartMax = Math.max(1, ...chart.map((c: any) => c.amount));
  $: pendingCount = data.stats.statusBreakdown.find((s: any) => s.status === 'pending')?._count ?? 0;
</script>

<svelte:head><title>Deposits · Admin · Sereni</title></svelte:head>

<div class="mb-5">
  <h1 class="font-montserrat font-bold text-2xl tracking-tight">Deposits</h1>
  <p class="text-sm text-neutral-400">Every balance top-up across the platform. Click a row to inspect it.</p>
</div>

<!-- Metrics -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
  <div class="card">
    <p class="text-xs text-neutral-400">Total revenue</p>
    <p class="text-2xl font-bold text-emerald-400">${data.stats.total.amount.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.stats.total.count} completed</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">This month</p>
    <p class="text-2xl font-bold">${data.stats.monthly.amount.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.stats.monthly.count} deposits</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">Pending</p>
    <p class="text-2xl font-bold text-amber-400">{pendingCount}</p>
    <p class="text-[11px] text-neutral-500">awaiting confirmation</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">Records</p>
    <p class="text-2xl font-bold">{data.pagination.totalCount}</p>
    <p class="text-[11px] text-neutral-500">in current view</p>
  </div>
</div>

<!-- 30-day chart -->
{#if chart.length > 0}
  <div class="card mb-5">
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm font-semibold">Revenue · last 30 days</p>
      <p class="text-xs text-neutral-500">peak ${chartMax.toFixed(0)}</p>
    </div>
    <div class="flex items-end gap-1 h-28">
      {#each chart as c}
        <div class="flex-1 group relative flex items-end h-full" title={`${c.date}: $${c.amount.toFixed(2)} (${c.count})`}>
          <div class="w-full bg-emerald-500/70 hover:bg-emerald-400 rounded-t transition-all" style={`height:${Math.max(3, (c.amount / chartMax) * 100)}%`}></div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- Filters + search -->
<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
  <div class="flex gap-1 p-1 bg-neutral-800 rounded-lg text-sm w-max overflow-x-auto">
    {#each tabs as t}
      <button class="px-3 py-1 rounded-md transition whitespace-nowrap {data.filters.status === t.key ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:text-white'}" on:click={() => setStatus(t.key)}>{t.label}</button>
    {/each}
  </div>
  <form on:submit|preventDefault={doSearch} class="flex gap-2">
    <input bind:value={search} placeholder="Search user or reference…" class="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:border-emerald-600/60" />
    <button class="btn !w-auto px-4 !py-1.5" type="submit">Search</button>
  </form>
</div>

<!-- Table -->
<div class="card !p-0 overflow-hidden">
  <div class="overflow-x-auto">
    <table>
      <thead><tr><th>User</th><th>Amount</th><th>Status</th><th>Reference</th><th>Date</th><th class="text-right">View</th></tr></thead>
      <tbody>
        {#each data.deposits as d (d.id)}
          {@const s = txDisplay(d.status, d.completed, d.createdAt)}
          <tr class="cursor-pointer" on:click={() => goto(`/admin/deposits/${d.id}`)}>
            <td><a href={`/admin/users/${d.user.id}`} class="hover:text-emerald-300" on:click|stopPropagation>@{d.user.username}</a></td>
            <td class="font-mono text-emerald-400">${d.amount.toFixed(2)}</td>
            <td><span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border {TONE_CLASSES[s.tone]}"><span class="w-1.5 h-1.5 rounded-full {TONE_DOT[s.tone]}"></span>{s.label}</span></td>
            <td class="font-mono text-xs text-neutral-500 truncate max-w-[10rem]">{d.reference || '—'}</td>
            <td class="text-sm text-neutral-400 whitespace-nowrap">{fmt(d.createdAt)}</td>
            <td class="text-right text-neutral-600">›</td>
          </tr>
        {:else}
          <tr><td colspan="6" class="text-center text-neutral-500 py-10">No deposits found.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

{#if data.pagination.totalPages > 1}
  <div class="flex items-center justify-between mt-4 text-sm">
    <a href={`?status=${data.filters.status}&page=${data.pagination.currentPage - 1}`} class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasPrev ? 'hover:bg-neutral-800' : 'pointer-events-none opacity-40'}">← Prev</a>
    <span class="text-neutral-400">Page {data.pagination.currentPage} of {data.pagination.totalPages}</span>
    <a href={`?status=${data.filters.status}&page=${data.pagination.currentPage + 1}`} class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasNext ? 'hover:bg-neutral-800' : 'pointer-events-none opacity-40'}">Next →</a>
  </div>
{/if}
