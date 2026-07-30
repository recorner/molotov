<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

  let newDm = '';
  $: activeId = Number($page.params.id) || null;
  $: onThread = $page.url.pathname !== '/chat';

  const initials = (s: string) => (s || '?').slice(0, 2).toUpperCase();
</script>

<svelte:head><title>Chat - Sereni</title></svelte:head>

<div class="grid md:grid-cols-[18rem_1fr] gap-4 h-[calc(100vh-7rem)]">
  <!-- Sidebar -->
  <aside class="card !p-0 flex-col overflow-hidden {onThread ? 'hidden md:flex' : 'flex'}">
    <div class="p-3 border-b border-neutral-800">
      <div class="flex items-center justify-between mb-2">
        <h1 class="font-bold">Chats</h1>
        <a href="/chat/channels" class="text-xs text-emerald-400 hover:text-emerald-300">Browse channels</a>
      </div>
      <form method="post" action="/chat?/startDM" use:enhance class="flex gap-2">
        <input bind:value={newDm} name="username" placeholder="Message a user…" class="input flex-1 text-sm !py-1.5" />
        <button class="btn !w-auto px-3 !py-1.5" disabled={!newDm.trim()}>Go</button>
      </form>
    </div>
    <div class="flex-1 overflow-y-auto">
      {#each data.conversations as c (c.id)}
        <a href={`/chat/${c.id}`} class="flex items-center gap-3 px-3 py-2.5 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition {activeId === c.id ? 'bg-neutral-800/70' : ''}">
          {#if c.avatar}
            <img src={c.avatar} alt="" class="w-9 h-9 rounded-full object-cover shrink-0" />
          {:else}
            <span class="w-9 h-9 rounded-full grid place-items-center shrink-0 {c.type === 'channel' ? 'bg-sky-500/15 text-sky-300' : 'bg-emerald-500/15 text-emerald-300'} text-xs font-bold">
              {c.type === 'channel' ? '#' : initials(c.title)}
            </span>
          {/if}
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-sm truncate">{c.type === 'channel' ? '# ' : ''}{c.title}</span>
              {#if c.unread > 0}<span class="min-w-[1.1rem] h-[1.1rem] px-1 grid place-items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold shrink-0">{c.unread > 9 ? '9+' : c.unread}</span>{/if}
            </div>
            <p class="text-xs text-neutral-500 truncate">{c.preview}</p>
          </div>
        </a>
      {:else}
        <p class="text-sm text-neutral-500 text-center py-10 px-4">No chats yet. Message a user above or browse channels.</p>
      {/each}
    </div>
  </aside>

  <!-- Thread / content -->
  <section class="card !p-0 overflow-hidden {onThread ? 'flex' : 'hidden md:flex'} flex-col">
    <slot />
  </section>
</div>
