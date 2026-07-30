<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll, goto } from '$app/navigation';
  import { onMount, onDestroy, tick } from 'svelte';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export const form: ActionData = null;

  let body = '';
  let fileInput: HTMLInputElement;
  let fileName = '';
  let sending = false;
  let box: HTMLElement;
  let poll: ReturnType<typeof setInterval>;

  $: c = data.conversation;
  $: other = data.other;

  const initials = (s: string | null | undefined) => (s || '?').slice(0, 2).toUpperCase();
  const time = (d: string | Date) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  function fmtSeen(d: string | Date | null | undefined) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 90) return 'online';
    if (s < 3600) return `last seen ${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `last seen ${Math.floor(s / 3600)}h ago`;
    return `last seen ${Math.floor(s / 86400)}d ago`;
  }
  function tickState(m: any): 'sent' | 'delivered' | 'read' {
    if (!other) return 'sent';
    if (other.lastReadAt && new Date(other.lastReadAt).getTime() >= new Date(m.createdAt).getTime()) return 'read';
    if (other.lastSeen && new Date(other.lastSeen).getTime() >= new Date(m.createdAt).getTime()) return 'delivered';
    return 'sent';
  }

  async function scroll() { await tick(); if (box) box.scrollTop = box.scrollHeight; }
  $: if (data.messages) scroll();

  onMount(() => { poll = setInterval(() => invalidateAll(), 3000); scroll(); });
  onDestroy(() => clearInterval(poll));
</script>

<!-- Header -->
<div class="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 shrink-0">
  <a href="/chat" class="md:hidden text-neutral-400 hover:text-neutral-200">←</a>
  <span class="w-9 h-9 rounded-full grid place-items-center shrink-0 {c.type === 'channel' ? 'bg-sky-500/15 text-sky-300' : 'bg-emerald-500/15 text-emerald-300'} text-xs font-bold">
    {c.type === 'channel' ? '#' : initials(c.title)}
  </span>
  <div class="min-w-0 flex-1">
    <p class="font-semibold truncate">{c.type === 'channel' ? '# ' : ''}{c.title}</p>
    <p class="text-[11px] {other && fmtSeen(other.lastSeen) === 'online' ? 'text-emerald-400' : 'text-neutral-500'}">
      {c.type === 'channel' ? `${c.memberCount} members` : fmtSeen(other?.lastSeen)}
    </p>
  </div>
  <span class="text-[10px] text-neutral-600 flex items-center gap-1" title="Messages are encrypted at rest">🔒 encrypted</span>
</div>

<!-- Messages -->
<div bind:this={box} class="flex-1 overflow-y-auto p-4 space-y-2">
  {#each data.messages as m (m.id)}
    {@const mine = m.senderId === data.meId}
    <div class="flex items-end gap-2 {mine ? 'justify-end' : 'justify-start'}">
      {#if !mine}
        {#if m.sender?.avatar}
          <img src={m.sender.avatar} alt="" class="w-7 h-7 rounded-full object-cover shrink-0" />
        {:else}
          <span class="w-7 h-7 rounded-full grid place-items-center bg-neutral-700 text-[9px] font-bold shrink-0">{initials(m.sender?.username)}</span>
        {/if}
      {/if}
      <div class="max-w-[78%] rounded-2xl px-3 py-2 text-sm {mine ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'}">
        {#if !mine && c.type === 'channel'}<p class="text-[10px] opacity-70 mb-0.5">{m.sender?.username || 'User'}</p>{/if}
        {#if m.fileUrl}
          {#if m.fileType?.startsWith('image/')}
            <a href={m.fileUrl} target="_blank" rel="noreferrer"><img src={m.fileUrl} alt={m.fileName} class="rounded-lg max-h-56 mb-1" /></a>
          {:else}
            <a href={m.fileUrl} target="_blank" rel="noreferrer" class="flex items-center gap-2 underline mb-1"><span>📎</span><span class="truncate">{m.fileName}</span></a>
          {/if}
        {/if}
        {#if m.body}<p class="whitespace-pre-wrap break-words">{m.body}</p>{/if}
        <span class="block text-right text-[10px] mt-0.5 leading-none opacity-70">
          {time(m.createdAt)}
          {#if mine && c.type === 'dm'}
            {@const t = tickState(m)}
            <span class={t === 'read' ? 'text-sky-300' : ''}>{t === 'sent' ? ' ✓' : ' ✓✓'}</span>
          {/if}
        </span>
      </div>
    </div>
  {:else}
    <p class="text-sm text-neutral-500 text-center py-10">No messages yet — say hello.</p>
  {/each}
</div>

<!-- Composer -->
<form
  class="border-t border-neutral-800 p-3 shrink-0"
  method="post"
  action="?/send"
  enctype="multipart/form-data"
  use:enhance={() => {
    sending = true;
    return async ({ result }) => {
      sending = false;
      if (result.type === 'success') {
        body = ''; fileName = ''; if (fileInput) fileInput.value = '';
        await invalidateAll(); scroll();
      } else if (result.type === 'failure') {
        toast.push((result.data as any)?.error === 'empty' ? 'Type a message' : (result.data as any)?.error || 'Failed to send', { theme: toastThemes.error });
      }
    };
  }}
>
  {#if fileName}
    <div class="flex items-center gap-2 text-xs text-neutral-300 mb-2 bg-neutral-800 rounded-lg px-2 py-1 w-max">
      <span>📎 {fileName}</span>
      <button type="button" class="text-neutral-500 hover:text-red-400" on:click={() => { fileName = ''; if (fileInput) fileInput.value = ''; }}>✕</button>
    </div>
  {/if}
  <div class="flex items-end gap-2">
    <label class="grid place-items-center w-9 h-9 rounded-lg hover:bg-neutral-800 cursor-pointer shrink-0" title="Attach (max 25 MB)">
      📎
      <input bind:this={fileInput} type="file" name="file" class="hidden" on:change={(e) => (fileName = (e.target as HTMLInputElement).files?.[0]?.name || '')} />
    </label>
    <textarea
      name="body"
      bind:value={body}
      rows="1"
      maxlength="4000"
      placeholder="Message…"
      class="input flex-1 resize-none text-sm py-2"
      on:keydown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.currentTarget.form?.requestSubmit(); } }}
    ></textarea>
    <button class="btn !w-auto px-4" disabled={sending || (!body.trim() && !fileName)}>Send</button>
  </div>
</form>
