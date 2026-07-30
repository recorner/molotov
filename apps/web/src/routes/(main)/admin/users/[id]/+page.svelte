<script lang="ts">
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import type { PageData } from './$types';
  import { Lock, DollarSign, ArrowLeft } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';

  export let data: PageData;

  let balanceMode: 'add' | 'set' = 'add';

  const roleClass: Record<string, string> = {
    ADMIN: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    SELLER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    BUYER: 'bg-neutral-700/50 text-neutral-300 border-neutral-600',
  };
  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString('en-GB', { timeStyle: 'short', dateStyle: 'short' });
</script>

<svelte:head><title>{data.selected.username} · Admin · Sereni</title></svelte:head>

<div class="max-w-5xl mx-auto">
  <a href="/admin/users" class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-emerald-300">
    <Icon src={ArrowLeft} class="w-4 h-4" /> Back to users
  </a>

  <!-- Header -->
  <div class="flex items-center gap-4 mt-3 mb-6">
    <span class="grid place-items-center w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-300 text-lg font-bold shrink-0">
      {data.selected.username.slice(0, 2).toUpperCase()}
    </span>
    <div class="min-w-0">
      <h1 class="font-montserrat font-bold text-2xl tracking-tight truncate">{data.selected.username}</h1>
      <div class="flex gap-1.5 flex-wrap mt-1">
        {#each data.selected.role as role}
          <span class="rounded-full text-[11px] px-2 py-0.5 border {roleClass[role] || roleClass.BUYER}">{role}</span>
        {/each}
      </div>
    </div>
  </div>

  <!-- Stat band -->
  <div class="grid grid-cols-3 divide-x divide-neutral-800/80 border-y border-neutral-800/80 mb-6">
    <div class="py-4 px-4"><p class="text-xs text-neutral-500">Balance</p><p class="font-montserrat font-bold text-xl tabular-nums text-emerald-400">${data.selected.balance.toFixed(2)}</p></div>
    <div class="py-4 px-4"><p class="text-xs text-neutral-500">Orders</p><p class="font-montserrat font-bold text-xl tabular-nums">{data.selected._count.orders}</p></div>
    <div class="py-4 px-4"><p class="text-xs text-neutral-500">Top-ups</p><p class="font-montserrat font-bold text-xl tabular-nums">{data.selected._count.topUps}</p></div>
  </div>

  <div class="grid lg:grid-cols-2 gap-4 items-start">
    <!-- Left: info + topups -->
    <div class="grid gap-4">
      <div class="card">
        <h2 class="font-semibold mb-3">Account</h2>
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-neutral-400">Username</dt><dd class="font-medium">{data.selected.username}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-neutral-400">Balance</dt><dd class="tabular-nums text-emerald-400">${data.selected.balance.toFixed(2)}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-neutral-400">Registered</dt><dd>{fmt(data.selected.createdAt)}</dd></div>
        </dl>
      </div>

      {#if data.selected.topUps.length > 0}
        <div class="card !p-0 overflow-hidden">
          <h2 class="font-semibold px-4 pt-4 pb-2">Recent top-ups</h2>
          <table>
            <thead><tr><th>Amount</th><th class="text-right">Time</th></tr></thead>
            <tbody>
              {#each data.selected.topUps as t}
                <tr><td class="tabular-nums text-emerald-400">${t.amount.toFixed(2)}</td><td class="text-right text-sm text-neutral-400">{fmt(t.createdAt)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Right: actions -->
    <div class="grid gap-4">
      <form
        class="card"
        method="post"
        action="?/adjustBalance"
        use:enhance={({ formElement }) =>
          async ({ result }) => {
            if (result.type === 'success') { toast.push('Balance updated', { theme: toastThemes.success }); formElement.reset(); await invalidateAll(); }
            else if (result.type === 'failure') toast.push((result.data as any)?.error === 'negative' ? 'Balance cannot go below zero' : 'Failed to update balance', { theme: toastThemes.error });
            else if (result.type === 'error') toast.push(result.error.message, { theme: toastThemes.error });
          }}
      >
        <h2 class="font-semibold mb-1">Adjust balance</h2>
        <p class="text-sm text-neutral-400 mb-3">Current: <span class="text-emerald-400 font-semibold tabular-nums">${data.selected.balance.toFixed(2)}</span></p>
        <div class="flex gap-1 mb-2 p-1 bg-neutral-800 rounded-lg w-max text-sm">
          <button type="button" class="px-3 py-1 rounded-md transition {balanceMode === 'add' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (balanceMode = 'add')}>Add / deduct</button>
          <button type="button" class="px-3 py-1 rounded-md transition {balanceMode === 'set' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (balanceMode = 'set')}>Set exact</button>
        </div>
        <input type="hidden" name="mode" value={balanceMode} />
        <div class="space-y-2">
          <InputWithIcon icon={DollarSign} placeholder={balanceMode === 'add' ? 'Amount to add (negative to deduct)' : 'New balance'} name="amount" type="number" step="0.01" />
          <button class="btn w-full">{balanceMode === 'add' ? 'Apply adjustment' : 'Set balance'}</button>
        </div>
      </form>

      <form
        class="card"
        method="post"
        action="?/updatePassword"
        use:enhance={({ formElement }) =>
          ({ result }) => {
            if (result.type === 'success') { toast.push('Password changed', { theme: toastThemes.success }); formElement.reset(); }
            else if (result.type === 'error') toast.push(result.error.message, { theme: toastThemes.error });
            else if (result.type === 'failure') toast.push('Passwords do not match', { theme: toastThemes.error });
          }}
      >
        <h2 class="font-semibold mb-2">Change password</h2>
        <div class="space-y-2">
          <InputWithIcon icon={Lock} placeholder="New password" name="password" type="password" />
          <InputWithIcon icon={Lock} placeholder="Confirm password" name="confirm" type="password" />
          <button class="btn w-full">Change password</button>
        </div>
      </form>

      <form
        action="?/updateRoles"
        class="card"
        method="post"
        use:enhance={() =>
          ({ result }) => {
            if (result.type === 'success') toast.push('Roles updated', { theme: toastThemes.success });
            else if (result.type === 'error') toast.push(result.error.message, { theme: toastThemes.error });
          }}
      >
        <h2 class="font-semibold mb-2">Roles</h2>
        <div class="flex gap-2 flex-wrap items-center">
          {#each data.roles as role}
            <label class="role">
              <input type="checkbox" name="roles" value={role} checked={data.selected.role.includes(role)} />
              <span class="border {roleClass[role] || roleClass.BUYER}">{role}</span>
            </label>
          {/each}
        </div>
        <button class="btn w-max px-5 mt-3">Save roles</button>
      </form>
    </div>
  </div>
</div>

<style>
  .role > input {
    @apply hidden;
  }
  .role > span {
    @apply cursor-pointer px-2.5 py-1 rounded-full text-xs transition select-none;
  }
  .role > input:not(:checked) + span {
    @apply opacity-40 grayscale;
  }
</style>
