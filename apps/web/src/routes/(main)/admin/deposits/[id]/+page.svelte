<script lang="ts">
  import { txDisplay, TONE_CLASSES, TONE_DOT } from '$lib/txStatus';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import type { PageData } from './$types';

  export let data: PageData;
  $: d = data.deposit;
  $: s = txDisplay(d.status, d.completed, d.createdAt);

  const fmt = (x: string | Date) =>
    new Date(x).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.push('Copied', { theme: toastThemes.success }));
  }
</script>

<svelte:head><title>Deposit #{d.id} · Admin · Sereni</title></svelte:head>

<div class="max-w-3xl mx-auto">
  <a href="/admin/deposits" class="text-sm text-neutral-400 hover:text-emerald-300">← Back to deposits</a>

  <div class="flex items-start justify-between gap-3 mt-3 mb-5">
    <div>
      <h1 class="text-2xl font-bold">Deposit #{d.id}</h1>
      <p class="text-sm text-neutral-400">{fmt(d.createdAt)}</p>
    </div>
    <span class="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border {TONE_CLASSES[s.tone]}">
      <span class="w-2 h-2 rounded-full {TONE_DOT[s.tone]}"></span>{s.label}
    </span>
  </div>

  <!-- Amount hero -->
  <div class="card mb-4 text-center py-8">
    <p class="text-xs uppercase tracking-wide text-neutral-500">Amount</p>
    <p class="text-4xl font-bold text-emerald-400 mt-1">${d.amount.toFixed(2)}</p>
  </div>

  <div class="grid sm:grid-cols-2 gap-4">
    <!-- Transaction details -->
    <div class="card">
      <p class="text-sm font-semibold mb-3">Transaction</p>
      <dl class="space-y-2.5 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Status</dt><dd>{s.label}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Raw status</dt><dd class="font-mono text-xs">{d.status || '—'}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Completed</dt><dd>{d.completed ? 'Yes' : 'No'}</dd></div>
        <div class="flex justify-between gap-3 items-start">
          <dt class="text-neutral-400 shrink-0">Reference</dt>
          <dd class="text-right min-w-0">
            {#if d.reference}
              <button class="font-mono text-xs hover:text-emerald-300 break-all" on:click={() => copy(d.reference)}>{d.reference}</button>
            {:else}<span class="text-neutral-600">—</span>{/if}
          </dd>
        </div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Created</dt><dd>{fmt(d.createdAt)}</dd></div>
      </dl>
    </div>

    <!-- Depositor -->
    <div class="card">
      <p class="text-sm font-semibold mb-3">Depositor</p>
      <dl class="space-y-2.5 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">User</dt><dd><a href={`/admin/users/${d.user.id}`} class="text-emerald-300 hover:underline">@{d.user.username}</a></dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">User ID</dt><dd class="font-mono text-xs">{d.user.id}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Current balance</dt><dd class="text-emerald-400">${d.user.balance.toFixed(2)}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Lifetime deposited</dt><dd>${data.depositor.lifetimeDeposited.toFixed(2)}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Total deposits</dt><dd>{data.depositor.depositCount}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-neutral-400">Member since</dt><dd>{fmt(d.user.createdAt)}</dd></div>
      </dl>
      <a href={`/admin/users/${d.user.id}`} class="btn !w-auto px-4 !py-1.5 mt-4 inline-block">View user →</a>
    </div>
  </div>
</div>
