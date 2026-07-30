<script lang="ts">
  import { enhance } from '$app/forms';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { User, DollarSign, Tag } from '@steeze-ui/feather-icons';
  import { computeFee } from '$lib/escrow-fee';
  import type { ActionData, PageData } from './$types';

  export let form: ActionData;
  export let data: PageData;

  let role: 'buyer' | 'seller' = 'buyer';
  let mode: 'username' | 'link' = 'username';
  let submitting = false;
  let amountVal = 0;

  $: fee = computeFee(Number(amountVal) || 0, data.feeConfig);
  $: net = Math.max(0, (Number(amountVal) || 0) - fee);
</script>

<svelte:head><title>New escrow deal - Sereni</title></svelte:head>

<a href="/escrow" class="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200 mb-4">← Back to escrow</a>

<div class="max-w-xl">
  <h1 class="font-montserrat font-bold text-2xl tracking-tight mb-1">New escrow deal</h1>
  <p class="text-sm text-neutral-400 mb-6">
    Create a safe, held deal with another Sereni user. Funds stay in escrow until the buyer confirms delivery.
  </p>

  <form
    class="card space-y-5"
    method="post"
    action="?/create"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
  >
    <!-- Role -->
    <div>
      <span class="block text-sm font-medium text-neutral-300 mb-1.5">Your role in this deal</span>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-lg border p-3 text-left transition {role === 'buyer' ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}"
          on:click={() => (role = 'buyer')}
        >
          <p class="font-medium text-sm">I'm the buyer</p>
          <p class="text-xs text-neutral-400">I pay and receive the goods/service</p>
        </button>
        <button
          type="button"
          class="rounded-lg border p-3 text-left transition {role === 'seller' ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}"
          on:click={() => (role = 'seller')}
        >
          <p class="font-medium text-sm">I'm the seller</p>
          <p class="text-xs text-neutral-400">I deliver and get paid</p>
        </button>
      </div>
      <input type="hidden" name="role" value={role} />
    </div>

    <!-- Counterparty mode -->
    <div>
      <span class="block text-sm font-medium text-neutral-300 mb-1.5">The other party</span>
      <div class="flex gap-1 mb-2 p-1 bg-neutral-800 rounded-lg text-sm">
        <button type="button" class="flex-1 px-3 py-1 rounded-md transition {mode === 'username' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (mode = 'username')}>I know their username</button>
        <button type="button" class="flex-1 px-3 py-1 rounded-md transition {mode === 'link' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (mode = 'link')}>Generate a link</button>
      </div>
      <input type="hidden" name="mode" value={mode} />
      {#if mode === 'username'}
        <div class="input">
          <Icon src={User} class="w-5 h-5 text-neutral-400" />
          <input id="counterparty" name="counterparty" placeholder={role === 'buyer' ? "Seller's username" : "Buyer's username"} class="w-full bg-transparent text-sm focus:outline-none text-neutral-100 placeholder:text-neutral-500" />
        </div>
        {#if form?.error === 'counterparty'}<span class="error mt-1">{form.message}</span>{/if}
      {:else}
        <p class="text-xs text-neutral-500">We'll create a shareable link you can send to anyone — they join with their account or as a guest.</p>
      {/if}
    </div>

    <!-- Title -->
    <div>
      <label for="title" class="block text-sm font-medium text-neutral-300 mb-1.5">What's the deal for?</label>
      <div class="input">
        <Icon src={Tag} class="w-5 h-5 text-neutral-400" />
        <input id="title" name="title" maxlength="80" placeholder="e.g. Logo design, 3-month rental, account transfer" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100 placeholder:text-neutral-500" />
      </div>
      {#if form?.error === 'title'}<span class="error mt-1">{form.message}</span>{/if}
    </div>

    <!-- Amount -->
    <div>
      <label for="amount" class="block text-sm font-medium text-neutral-300 mb-1.5">Amount (USD)</label>
      <div class="input">
        <Icon src={DollarSign} class="w-5 h-5 text-neutral-400" />
        <input id="amount" name="amount" type="number" min="1" step="0.01" bind:value={amountVal} placeholder="100.00" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100 placeholder:text-neutral-500" />
      </div>
      {#if form?.error === 'amount'}<span class="error mt-1">{form.message}</span>{/if}
      {#if Number(amountVal) > 0}
        <div class="mt-2 rounded-lg bg-neutral-900/60 border border-neutral-800 px-3 py-2 text-xs text-neutral-400 space-y-0.5">
          <div class="flex justify-between"><span>Buyer pays</span><span class="text-neutral-200">${Number(amountVal).toFixed(2)}</span></div>
          <div class="flex justify-between"><span>Platform fee</span><span class="text-neutral-200">${fee.toFixed(2)}</span></div>
          <div class="flex justify-between font-medium"><span>Seller receives</span><span class="text-emerald-400">${net.toFixed(2)}</span></div>
        </div>
      {/if}
    </div>

    <!-- Description -->
    <div>
      <label for="description" class="block text-sm font-medium text-neutral-300 mb-1.5">Terms / description <span class="text-neutral-600">(optional)</span></label>
      <textarea id="description" name="description" rows="4" maxlength="2000" placeholder="Describe exactly what's being delivered, deadlines, and any conditions both parties agree to." class="input w-full resize-none text-sm"></textarea>
    </div>

    <button type="submit" class="btn" disabled={submitting}>{submitting ? 'Creating…' : 'Create escrow deal'}</button>
  </form>

  <div class="card mt-4 bg-sky-500/5 border-sky-500/20">
    <p class="text-sm text-sky-200">
      <strong>How it works:</strong> after you create the deal, the other party accepts it. The buyer then funds
      the escrow from their Sereni balance. Once the buyer confirms delivery, the funds are released to the
      seller, who can withdraw them. If something goes wrong, either party can open a dispute for an admin to review.
    </p>
  </div>
</div>
