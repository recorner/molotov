<script lang="ts">
  import type { PageData } from './$types';
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import { DollarSign, TrendingUp, Package, Clock } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { Monero, Telegram } from '@steeze-ui/simple-icons';
  import { enhance } from '$app/forms';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { invalidateAll } from '$app/navigation';

  export let data: PageData;

  $: topMax = Math.max(1, ...data.salesByProduct.map((p) => p.value));
  $: dayMax = Math.max(1, ...data.salesPerDay.map((d) => d.value));
</script>

<svelte:head><title>Seller dashboard · Sereni</title></svelte:head>

<div class="mb-5">
  <h1 class="font-montserrat font-bold text-2xl tracking-tight">Seller dashboard</h1>
  <p class="text-sm text-neutral-400">Your storefront performance at a glance.</p>
</div>

<!-- Stat cards -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
  <div class="card">
    <div class="flex items-center gap-2 text-neutral-400 text-xs mb-1"><Icon src={DollarSign} class="w-4 h-4" /> Balance</div>
    <p class="text-2xl font-bold text-emerald-400">${data.user.balance.toFixed(2)}</p>
    <a href="/balance/history" class="text-[11px] text-neutral-500 hover:text-emerald-300">View history →</a>
  </div>
  <div class="card">
    <div class="flex items-center gap-2 text-neutral-400 text-xs mb-1"><Icon src={TrendingUp} class="w-4 h-4" /> Revenue · 7d</div>
    <p class="text-2xl font-bold">${data.revenue7d.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.sales} unit{data.sales === 1 ? '' : 's'} sold</p>
  </div>
  <div class="card">
    <div class="flex items-center gap-2 text-neutral-400 text-xs mb-1"><Icon src={DollarSign} class="w-4 h-4" /> Lifetime</div>
    <p class="text-2xl font-bold">${data.revenueLifetime.toFixed(2)}</p>
    <p class="text-[11px] text-neutral-500">{data.unitsLifetime} units all-time</p>
  </div>
  <div class="card">
    <div class="flex items-center gap-2 text-neutral-400 text-xs mb-1"><Icon src={Package} class="w-4 h-4" /> Products</div>
    <p class="text-2xl font-bold">{data.productCount}</p>
    <a href="/seller/products" class="text-[11px] text-neutral-500 hover:text-emerald-300">Manage →</a>
  </div>
</div>

{#if data.pendingPayout.count > 0}
  <div class="card mb-6 flex items-center gap-3 border-amber-500/30 bg-amber-500/5">
    <Icon src={Clock} class="w-5 h-5 text-amber-400 shrink-0" />
    <p class="text-sm text-amber-200">You have {data.pendingPayout.count} pending payout{data.pendingPayout.count === 1 ? '' : 's'} totalling <strong>${data.pendingPayout.amount.toFixed(2)}</strong> awaiting admin approval.</p>
  </div>
{/if}

<!-- Analytics -->
<div class="grid lg:grid-cols-2 gap-4 mb-6">
  <div class="card">
    <h2 class="font-bold mb-1">Top products</h2>
    <p class="text-neutral-400 text-sm mb-4">Best sellers in the past 7 days</p>
    {#if data.salesByProduct.length === 0}
      <p class="text-sm text-neutral-500 py-8 text-center">No sales in the last 7 days.</p>
    {:else}
      <div class="space-y-3">
        {#each data.salesByProduct as p}
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="truncate pr-2">{p.name}</span>
              <span class="text-neutral-400 shrink-0">{p.value} · ${p.revenue.toFixed(2)}</span>
            </div>
            <div class="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style={`width:${(p.value / topMax) * 100}%`}></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="card">
    <h2 class="font-bold mb-1">Sales by day</h2>
    <p class="text-neutral-400 text-sm mb-4">Units sold over the last 7 days</p>
    <div class="flex items-end justify-between gap-2 h-40">
      {#each data.salesPerDay as d}
        <div class="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span class="text-[11px] text-neutral-400">{d.value}</span>
          <div class="w-full bg-emerald-500/70 hover:bg-emerald-400 rounded-t transition-all" style={`height:${Math.max(3, (d.value / dayMax) * 100)}%`}></div>
          <span class="text-[11px] text-neutral-500">{d.label}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Forms -->
<div class="grid lg:grid-cols-2 gap-4">
  <div class="card h-max">
    <h2 class="font-bold">Request a payout</h2>
    <p class="text-neutral-400 mb-3 text-sm">Withdraw your balance to a Monero (XMR) address. Minimum $10.</p>
    <form
      class="space-y-2"
      method="post"
      action="?/payout"
      use:enhance={({ formElement }) =>
        async ({ result }) => {
          if (result.type == 'success') toast.push('Payout requested', { theme: toastThemes.success });
          else if (result.type == 'failure') {
            const m = { address: 'Invalid XMR address', insufficient: 'Insufficient balance' } as Record<string, string>;
            toast.push(m[result.data?.error as string] || 'An error occurred', { theme: toastThemes.error });
          } else if (result.type == 'error') toast.push(result.error.message, { theme: toastThemes.error });
          await invalidateAll();
          formElement.reset();
        }}
    >
      <InputWithIcon icon={Monero} type="text" placeholder="XMR address" name="address" />
      <InputWithIcon icon={DollarSign} placeholder="Amount" type="number" name="amount" max={data.user.balance} step="1" min="10" />
      <button class="btn">Submit request</button>
    </form>
  </div>

  <div class="card h-max">
    <h2 class="font-bold">Contact details</h2>
    <p class="text-neutral-400 mb-3 text-sm">Let customers reach you. Your Telegram handle is shown on your products.</p>
    <form
      class="space-y-2"
      method="post"
      action="?/contact"
      use:enhance={({ formElement }) =>
        async ({ result }) => {
          if (result.type == 'success') toast.push('Contact details updated', { theme: toastThemes.success });
          else if (result.type == 'error') toast.push(result.error.message, { theme: toastThemes.error });
          formElement.reset();
        }}
    >
      <InputWithIcon icon={Telegram} placeholder="Telegram handle" name="telegram" />
      <button class="btn">Update</button>
    </form>
  </div>
</div>
