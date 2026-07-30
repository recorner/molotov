<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;
  let isPublic = true;

  const handle = (msg: string) => () => async ({ result }: any) => {
    if (result.type === 'success') { toast.push(msg, { theme: toastThemes.success }); await invalidateAll(); }
    else if (result.type === 'failure') toast.push(result.data?.error || 'Failed', { theme: toastThemes.error });
  };
  const fmt = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>Chat channels - Admin - Sereni</title></svelte:head>

<div class="mb-5"><h1 class="font-montserrat font-bold text-2xl tracking-tight">Chat channels</h1><p class="text-sm text-neutral-400">Create and manage channels for your users.</p></div>

<div class="grid lg:grid-cols-[22rem_1fr] gap-4 items-start">
  <!-- Create -->
  <form class="card space-y-3" method="post" action="?/createChannel" use:enhance={handle('Channel created')}>
    <h2 class="font-bold">New channel</h2>
    <div>
      <label for="t" class="block text-xs text-neutral-400 mb-1">Name</label>
      <input id="t" name="title" maxlength="60" class="input w-full text-sm" placeholder="e.g. announcements" />
      {#if form?.error}<span class="error mt-1">{form.error}</span>{/if}
    </div>
    <div>
      <label for="d" class="block text-xs text-neutral-400 mb-1">Description</label>
      <input id="d" name="description" class="input w-full text-sm" placeholder="What's this channel for?" />
    </div>
    <div>
      <label for="m" class="block text-xs text-neutral-400 mb-1">Add members <span class="text-neutral-600">(usernames, optional)</span></label>
      <input id="m" name="members" class="input w-full text-sm" placeholder="alice, bob" />
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="isPublic" bind:checked={isPublic} />
      <span>Public — anyone can find &amp; join</span>
    </label>
    <button class="btn">Create channel</button>
  </form>

  <!-- List -->
  <div class="card !p-0 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead><tr><th>Channel</th><th>Visibility</th><th>Members</th><th>Messages</th><th>Created</th><th class="text-right">Actions</th></tr></thead>
        <tbody>
          {#each data.channels as c (c.id)}
            <tr class={c.archived ? 'opacity-50' : ''}>
              <td><div class="font-medium"># {c.title}</div><div class="text-xs text-neutral-500 truncate max-w-[14rem]">{c.description || ''}</div></td>
              <td><span class="text-xs px-2 py-0.5 rounded-full border {c.isPublic ? 'border-sky-500/30 text-sky-300 bg-sky-500/10' : 'border-neutral-600 text-neutral-300'}">{c.isPublic ? 'Public' : 'Private'}</span></td>
              <td>{c._count.members}</td>
              <td>{c._count.messages}</td>
              <td class="text-sm text-neutral-400">{fmt(c.createdAt)}</td>
              <td class="text-right">
                <div class="inline-flex gap-2">
                  <a href={`/chat/${c.id}`} class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm">Open</a>
                  <form method="post" action="?/archive" use:enhance={handle(c.archived ? 'Unarchived' : 'Archived')}>
                    <input type="hidden" name="id" value={c.id} />
                    <button class="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm">{c.archived ? 'Unarchive' : 'Archive'}</button>
                  </form>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="6" class="text-center text-neutral-500 py-10">No channels yet — create one.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
