<script lang="ts">
  import { ChevronLeft, ChevronRight, Search } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import type { PageData } from './$types';

  export let data: PageData;

  const roleClass: Record<string, string> = {
    ADMIN: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    SELLER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    BUYER: 'bg-neutral-700/50 text-neutral-300 border-neutral-600',
  };

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

  $: pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (data.q) params.set('q', data.q);
    params.set('page', String(p));
    return `?${params.toString()}`;
  };
</script>

<svelte:head><title>Users - Admin - Sereni</title></svelte:head>

<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
  <div>
    <h1 class="font-montserrat font-bold text-2xl tracking-tight">Users</h1>
    <p class="text-sm text-neutral-400"><span class="tabular-nums">{data.total}</span> registered account{data.total === 1 ? '' : 's'}</p>
  </div>
  <form method="get" class="flex gap-2">
    <div class="input !py-1.5 w-full sm:w-64">
      <Icon src={Search} class="w-4 h-4 text-neutral-400" />
      <input
        type="text"
        name="q"
        value={data.q}
        placeholder="Search username…"
        class="w-full bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
      />
    </div>
    <button class="btn !w-auto px-4" type="submit">Search</button>
  </form>
</div>

<div class="card !p-0 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full">
      <thead>
        <tr>
          <th>User</th>
          <th>Roles</th>
          <th>Balance</th>
          <th>Registered</th>
          <th class="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user (user.id)}
          <tr>
            <td>
              <div class="flex items-center gap-3">
                <span class="grid place-items-center w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold shrink-0">
                  {user.username.slice(0, 2).toUpperCase()}
                </span>
                <span class="font-medium">{user.username}</span>
              </div>
            </td>
            <td>
              <div class="flex gap-1 flex-wrap">
                {#each user.role as role}
                  <span class="rounded-full text-[11px] px-2 py-0.5 border {roleClass[role] || roleClass.BUYER}">{role}</span>
                {/each}
              </div>
            </td>
            <td class="font-mono tabular-nums text-emerald-400">${user.balance.toFixed(2)}</td>
            <td class="text-sm text-neutral-400">{fmtDate(user.createdAt)}</td>
            <td class="text-right">
              <a href="/admin/users/{user.id}" class="inline-flex items-center px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition">Manage</a>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="text-center text-neutral-500 py-10">No users found.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

{#if data.pages > 1}
  <div class="flex items-center justify-between mt-4 text-sm">
    <a href={pageHref(data.page - 1)} class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-700 {data.page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-800'}">
      <Icon src={ChevronLeft} class="w-4 h-4" /> Prev
    </a>
    <span class="text-neutral-400">Page {data.page} of {data.pages}</span>
    <a href={pageHref(data.page + 1)} class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-700 {data.page >= data.pages ? 'pointer-events-none opacity-40' : 'hover:bg-neutral-800'}">
      Next <Icon src={ChevronRight} class="w-4 h-4" />
    </a>
  </div>
{/if}
