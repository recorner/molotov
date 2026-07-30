<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { txDisplay, TONE_CLASSES, TONE_DOT } from '$lib/txStatus';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { Check } from '@steeze-ui/feather-icons';
  import type { PageData } from './$types';

  export let data: PageData;

  let checking = false;
  let liveAddress = '';
  let liveAmount = '';
  let liveCurrency = '';

  $: tx = data.topUp;
  $: d = txDisplay(tx.status, tx.completed, tx.createdAt);

  const fmtDate = (date: string | Date) =>
    new Date(date).toLocaleString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.push('Copied', { theme: toastThemes.success }));
  }

  async function refreshStatus() {
    if (!tx.reference) {
      toast.push('No payment reference to check.', { theme: toastThemes.error });
      return;
    }
    checking = true;
    try {
      const res = await fetch(`/api/payment/status?id=${tx.reference}`);
      const json = await res.json();
      if (res.ok && json.payment) {
        const p = json.payment;
        liveAddress = p.pay_address || '';
        liveAmount = p.pay_amount || '';
        liveCurrency = p.pay_currency || '';
        if (p.local_completed || p.status === 'finished' || p.status === 'confirmed') {
          toast.push('Payment confirmed — balance updated!', { theme: toastThemes.success });
        } else {
          toast.push(`Status: ${p.status}`, { theme: toastThemes.info ?? toastThemes.success });
        }
        await invalidateAll();
      } else {
        toast.push(json.error || 'Could not refresh status.', { theme: toastThemes.error });
      }
    } catch {
      toast.push('Network error while checking status.', { theme: toastThemes.error });
    } finally {
      checking = false;
    }
  }
</script>

<svelte:head><title>Transaction #{tx.id} - Sereni</title></svelte:head>

<a href="/balance/history" class="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200 mb-4">← Back to history</a>

<div class="max-w-xl mx-auto">
  <!-- Hero -->
  <div class="card text-center mb-4">
    <span class="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border {TONE_CLASSES[d.tone]} mb-4">
      <span class="w-1.5 h-1.5 rounded-full {TONE_DOT[d.tone]}"></span>{d.label}
    </span>
    <p class="font-montserrat font-bold text-4xl tabular-nums mb-1">${tx.amount.toFixed(2)}</p>
    <p class="text-sm text-neutral-400">Balance top-up</p>
  </div>

  <!-- Details -->
  <div class="card !p-0 divide-y divide-neutral-800 text-sm">
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-neutral-400">Transaction ID</span>
      <span class="font-mono">#{tx.id}</span>
    </div>
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-neutral-400">Status</span>
      <span class="font-medium">{d.label}</span>
    </div>
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-neutral-400">Amount</span>
      <span class="font-medium">${tx.amount.toFixed(2)} USD</span>
    </div>
    <div class="flex items-center justify-between px-4 py-3 gap-3">
      <span class="text-neutral-400 shrink-0">Payment reference</span>
      {#if tx.reference}
        <button type="button" class="font-mono text-xs text-neutral-200 hover:text-emerald-300 truncate" on:click={() => copy(tx.reference)}>
          {tx.reference}
        </button>
      {:else}
        <span class="text-neutral-500">—</span>
      {/if}
    </div>
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-neutral-400">Created</span>
      <span>{fmtDate(tx.createdAt)}</span>
    </div>
  </div>

  <!-- Pending: allow status refresh + resume -->
  {#if d.tone === 'pending'}
    <div class="card mt-4">
      <p class="text-sm text-neutral-300 mb-3">
        This payment hasn't completed yet. If you've already sent the crypto, it may still be confirming
        on-chain — check again in a moment.
      </p>
      <button type="button" class="btn" on:click={refreshStatus} disabled={checking}>
        {checking ? 'Checking…' : 'Refresh status'}
      </button>

      {#if liveAddress}
        <div class="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
          <p class="text-neutral-400 mb-1">Still need to pay? Send {liveAmount} {liveCurrency?.toUpperCase()} to:</p>
          <button type="button" class="font-mono text-xs break-all text-neutral-200 hover:text-emerald-300 text-left" on:click={() => copy(liveAddress)}>
            {liveAddress}
          </button>
        </div>
      {/if}
    </div>
  {:else if d.tone === 'failed'}
    <div class="card mt-4 text-center">
      <p class="text-sm text-neutral-400 mb-3">This payment didn't complete. No funds were deducted from your balance.</p>
      <a href="/balance" class="btn !w-auto px-5 inline-block">Try a new deposit</a>
    </div>
  {:else}
    <div class="card mt-4 flex items-center gap-3 border-emerald-600/25 bg-emerald-500/5">
      <span class="grid place-items-center w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0"><Icon src={Check} class="w-5 h-5" /></span>
      <p class="text-sm text-neutral-300">This deposit was credited to your balance.</p>
    </div>
  {/if}
</div>
