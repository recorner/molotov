<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<div class="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 shrink-0">
  <a href="/chat" class="md:hidden text-neutral-400 hover:text-neutral-200">←</a>
  <h1 class="font-semibold">Browse channels</h1>
</div>

<div class="flex-1 overflow-y-auto p-4">
  {#if data.channels.length === 0}
    <p class="text-sm text-neutral-500 text-center py-12">No public channels yet.</p>
  {:else}
    <div class="space-y-2">
      {#each data.channels as c (c.id)}
        <div class="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
          <span class="w-10 h-10 rounded-full grid place-items-center bg-sky-500/15 text-sky-300 font-bold shrink-0">#</span>
          <div class="min-w-0 flex-1">
            <p class="font-medium truncate"># {c.title}</p>
            <p class="text-xs text-neutral-500 truncate">{c.description || `${c.memberCount} members`}</p>
          </div>
          <a href={`/chat/${c.id}`} class="btn !w-auto px-4 !py-1.5 text-sm">{c.joined ? 'Open' : 'Join'}</a>
        </div>
      {/each}
    </div>
  {/if}
</div>
