<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { Bell } from '@steeze-ui/feather-icons';
  import { onMount, onDestroy } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';

  export let notifications: any[] = [];
  export let unreadCount = 0;

  let open = false;
  let items = notifications;
  let unread = unreadCount;
  let lastUnread = unreadCount;
  let poll: ReturnType<typeof setInterval>;

  // keep in sync with server-rendered data
  $: items = notifications;
  $: unread = unreadCount;

  const ICONS: Record<string, string> = {
    deposit: 'material-symbols:account-balance-wallet',
    payout: 'material-symbols:payments-outline',
    escrow: 'material-symbols:handshake-outline',
    message: 'material-symbols:chat-bubble-outline',
    login: 'material-symbols:devices',
    announcement: 'material-symbols:campaign-outline',
    system: 'material-symbols:notifications-outline',
  };
  const TONE: Record<string, string> = {
    deposit: 'text-emerald-400', payout: 'text-emerald-400', escrow: 'text-sky-400',
    message: 'text-sky-400', login: 'text-amber-400', announcement: 'text-purple-400', system: 'text-neutral-400',
  };

  function beep() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.42);
      o.onended = () => ctx.close();
    } catch {}
  }

  async function refresh() {
    try {
      const res = await fetch('/api/notifications/read');
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.unread === 'number') {
        if (data.unread > lastUnread) beep();
        lastUnread = data.unread;
        unread = data.unread;
        items = data.items;
      }
    } catch {}
  }

  async function markAll() {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    unread = 0; lastUnread = 0;
    items = items.map((i) => ({ ...i, read: true }));
    invalidateAll();
  }

  async function clearAll() {
    await fetch('/api/notifications/read', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    items = []; unread = 0; lastUnread = 0;
    invalidateAll();
  }

  async function openItem(n: any) {
    if (!n.read) {
      fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) });
      n.read = true; unread = Math.max(0, unread - 1); lastUnread = unread;
    }
    open = false;
    if (n.link) goto(n.link);
  }

  const ago = (d: string | Date) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  let container: HTMLElement;
  function onWindowClick(e: MouseEvent) {
    if (open && container && !container.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  onMount(() => { lastUnread = unreadCount; poll = setInterval(refresh, 5000); });
  onDestroy(() => clearInterval(poll));
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

<div class="relative" bind:this={container}>
  <button
    class="relative grid place-items-center w-9 h-9 rounded-lg hover:bg-neutral-800 transition"
    on:click={() => { open = !open; }}
    aria-label="Notifications"
  >
    <Icon src={Bell} class="w-5 h-5 text-neutral-300" />
    {#if unread > 0}
      <span class="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-bold">{unread > 9 ? '9+' : unread}</span>
    {/if}
  </button>

  {#if open}
    <div class="absolute z-40 right-0 mt-2 w-80 max-w-[90vw] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
        <span class="font-semibold text-sm">Notifications</span>
        <div class="flex items-center gap-3">
          {#if unread > 0}<button class="text-xs text-emerald-400 hover:text-emerald-300" on:click={markAll}>Mark all read</button>{/if}
          {#if items.length > 0}<button class="text-xs text-neutral-500 hover:text-red-400" on:click={clearAll}>Clear</button>{/if}
        </div>
      </div>
      <div class="max-h-96 overflow-y-auto">
        {#each items as n (n.id)}
          <button
            on:click={() => openItem(n)}
            class="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-800/60 transition {n.read ? '' : 'bg-emerald-500/[0.06]'}"
          >
            <AppIcon name={ICONS[n.type] || ICONS.system} class="w-5 h-5 mt-0.5 shrink-0 {TONE[n.type] || TONE.system}" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium leading-snug">{n.title}</p>
              {#if n.body}<p class="text-xs text-neutral-400 leading-snug">{n.body}</p>{/if}
              <p class="text-[10px] text-neutral-600 mt-0.5">{ago(n.createdAt)}</p>
            </div>
            {#if !n.read}<span class="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>{/if}
          </button>
        {:else}
          <p class="text-sm text-neutral-500 text-center py-10">You're all caught up 🎉</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
