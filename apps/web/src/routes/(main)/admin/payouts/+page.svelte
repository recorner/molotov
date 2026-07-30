<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import toastThemes from '$lib/toastThemes';
  import { Clipboard, CheckCircle, XCircle, Clock } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { toast } from '@zerodevx/svelte-toast';
  import type { PageData } from './$types';

  export let data: PageData;

  let rejecting: number | null = null;
  let rejectReason = '';

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'COMPLETED', label: 'Paid' },
    { key: 'REJECTED', label: 'Rejected' },
  ];

  function setStatus(s: string) {
    goto(`/admin/payouts?status=${s}`);
  }
  const goToPage = (p: number) => {
    if (p < 1 || p > data.pages || p === data.page) return;
    goto(`/admin/payouts?status=${data.status}&page=${p}`);
  };
  const truncateMiddle = (str: string, n: number) =>
    str.length <= n ? str : `${str.slice(0, Math.floor(n / 2))}…${str.slice(str.length - Math.floor(n / 2))}`;
  const fmt = (d: string | Date) => new Date(d).toLocaleString('en-GB', { timeStyle: 'short', dateStyle: 'short' });

  function copy(t: string) {
    navigator.clipboard.writeText(t);
    toast.push('Copied', { theme: toastThemes.success });
  }
</script>

<svelte:head><title>Payouts · Admin · Sereni</title></svelte:head>

<div class="mb-5">
  <h1 class="font-montserrat font-bold text-2xl tracking-tight">Payouts</h1>
  <p class="text-sm text-neutral-400">Review and settle withdrawal requests from sellers and escrow.</p>
</div>

<!-- Metrics -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
  <div class="card">
    <p class="text-xs text-neutral-400">Pending</p>
    <p class="text-2xl font-bold text-amber-400">${data.stats.pendingAmount.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.stats.pendingCount} request{data.stats.pendingCount === 1 ? '' : 's'}</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">Paid out</p>
    <p class="text-2xl font-bold text-emerald-400">${data.stats.paidAmount.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.stats.paidCount} completed</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">Rejected</p>
    <p class="text-2xl font-bold">{data.stats.rejectedCount}</p>
    <p class="text-[11px] text-neutral-500">refunded</p>
  </div>
  <div class="card">
    <p class="text-xs text-neutral-400">Awaiting action</p>
    <p class="text-2xl font-bold">{data.stats.pendingCount}</p>
    <p class="text-[11px] text-neutral-500">queue length</p>
  </div>
</div>

<!-- Filter tabs -->
<div class="flex gap-1 p-1 bg-neutral-800 rounded-lg text-sm w-max mb-4 overflow-x-auto">
  {#each tabs as t}
    <button class="px-3 py-1 rounded-md transition whitespace-nowrap {data.status === t.key ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:text-white'}" on:click={() => setStatus(t.key)}>{t.label}</button>
  {/each}
</div>

{#if data.payouts.length === 0}
  <div class="card text-center py-16">
    <Icon src={Clock} class="w-12 h-12 text-neutral-600 mx-auto mb-3" />
    <p class="font-semibold">No payouts here</p>
    <p class="text-sm text-neutral-400">Nothing matches this filter.</p>
  </div>
{:else}
  <div class="card !p-0 overflow-hidden">
    <div class="overflow-x-auto">
      <table>
        <thead><tr><th>Recipient</th><th>Date</th><th>Address</th><th>Amount</th><th>Status</th><th class="text-right">Action</th></tr></thead>
        <tbody>
          {#each data.payouts as p (p.id)}
            <tr>
              <td>
                {#if p.user}
                  <a href={`/admin/users/${p.user.id}`} class="hover:text-emerald-300">@{p.user.username}</a>
                {:else}
                  <span>{p.guestName || 'Guest'}</span>
                {/if}
                {#if p.escrowId}<span class="block text-[11px] text-sky-400">escrow #{p.escrowId}</span>{/if}
              </td>
              <td class="text-sm text-neutral-400 whitespace-nowrap">{fmt(p.createdAt)}</td>
              <td>
                <button class="flex items-center gap-2 hover:text-emerald-400 transition font-mono text-xs" on:click={() => copy(p.address)}>
                  <span>{truncateMiddle(p.address, 14)}</span>
                  <Icon src={Clipboard} class="w-3.5 h-3.5" />
                </button>
                {#if p.currency}<span class="block text-[11px] text-neutral-500 uppercase">{p.currency}</span>{/if}
              </td>
              <td class="font-mono text-emerald-400">${p.amount.toFixed(2)}</td>
              <td>
                {#if p.status === 'PENDING'}
                  <span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-300 border-amber-500/30"><Icon src={Clock} class="w-3 h-3" /> Pending</span>
                {:else if p.status === 'COMPLETED'}
                  <span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30"><Icon src={CheckCircle} class="w-3 h-3" /> Paid</span>
                {:else}
                  <span class="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border bg-red-500/15 text-red-300 border-red-500/30" title={p.rejectedReason || ''}><Icon src={XCircle} class="w-3 h-3" /> Rejected</span>
                {/if}
              </td>
              <td class="text-right">
                {#if p.status === 'PENDING'}
                  <div class="flex items-center gap-2 justify-end">
                    <form action="?/approve" method="post" use:enhance={() => async ({ result }) => { if (result.type === 'success') toast.push('Payout marked as paid', { theme: toastThemes.success }); await invalidateAll(); }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button class="btn !w-auto px-3 !py-1.5 text-xs">Mark paid</button>
                    </form>
                    <button class="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10" on:click={() => { rejecting = p.id; rejectReason = ''; }}>Reject</button>
                  </div>
                {:else if p.paidAt}
                  <span class="text-[11px] text-neutral-500">{fmt(p.paidAt)}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="flex items-center justify-between mt-4 text-sm">
    <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.page > 1 ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => goToPage(data.page - 1)}>← Prev</button>
    <span class="text-neutral-400">Page {data.page} of {data.pages}</span>
    <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.page < data.pages ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => goToPage(data.page + 1)}>Next →</button>
  </div>
{/if}

<!-- Reject modal -->
{#if rejecting !== null}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" on:click|self={() => (rejecting = null)} on:keydown={(e) => e.key === 'Escape' && (rejecting = null)} role="presentation">
    <div class="card w-full max-w-md">
      <h2 class="text-lg font-bold mb-1">Reject payout</h2>
      <p class="text-sm text-neutral-400 mb-4">The held amount will be refunded to the user's balance and they'll be notified.</p>
      <form action="?/reject" method="post" use:enhance={() => async ({ result }) => { if (result.type === 'success') toast.push('Payout rejected & refunded', { theme: toastThemes.success }); rejecting = null; await invalidateAll(); }}>
        <input type="hidden" name="id" value={rejecting} />
        <label class="block text-sm text-neutral-300 mb-1.5" for="reason">Reason</label>
        <textarea id="reason" name="reason" bind:value={rejectReason} rows="3" placeholder="e.g. invalid address" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60 mb-4"></textarea>
        <div class="flex gap-2 justify-end">
          <button type="button" class="px-4 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-800" on:click={() => (rejecting = null)}>Cancel</button>
          <button class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium">Reject & refund</button>
        </div>
      </form>
    </div>
  </div>
{/if}
