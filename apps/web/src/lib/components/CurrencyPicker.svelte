<script lang="ts">
  import IconifyIcon from '@iconify/svelte';
  import { slide } from 'svelte/transition';
  import { currencyName, currencyNetwork, coinIcon } from '$lib/nowpayments';

  /** selected currency code (bindable) */
  export let value = 'btc';
  /** list of currency codes to choose from */
  export let currencies: string[] = [];
  /** optional form field name — renders a hidden input so it submits in a form */
  export let name: string | undefined = undefined;
  export let disabled = false;

  let open = false;
  let search = '';

  $: filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) => c.includes(q) || currencyName(c).toLowerCase().includes(q));
  })();

  function pick(c: string) {
    value = c;
    open = false;
    search = '';
  }
</script>

{#if name}<input type="hidden" {name} {value} />{/if}

<div>
  <button
    type="button"
    class="w-full flex items-center justify-between input cursor-pointer disabled:opacity-60"
    on:click={() => (open = !open)}
    aria-expanded={open}
    {disabled}
  >
    <span class="flex items-center gap-2.5 min-w-0">
      <IconifyIcon icon={coinIcon(value)} class="w-6 h-6 shrink-0" />
      <span class="text-sm truncate">
        {currencyName(value)}
        <span class="text-neutral-500">· {value.toUpperCase()}{#if currencyNetwork(value)} ({currencyNetwork(value)}){/if}</span>
      </span>
    </span>
    <span class="text-neutral-500 text-xs transition-transform {open ? 'rotate-180' : ''}">▼</span>
  </button>

  {#if open}
    <div class="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden" transition:slide={{ duration: 160 }}>
      <div class="p-2 border-b border-neutral-800">
        <input
          type="text"
          bind:value={search}
          placeholder="Search coins…"
          class="w-full bg-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>
      <div class="max-h-64 overflow-y-auto p-1">
        {#if filtered.length === 0}
          <p class="px-3 py-6 text-center text-sm text-neutral-500">No coins match “{search}”.</p>
        {:else}
          {#each filtered as c (c)}
            <button
              type="button"
              on:click={() => pick(c)}
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition hover:bg-neutral-800 {c === value ? 'bg-neutral-800' : ''}"
            >
              <IconifyIcon icon={coinIcon(c)} class="w-6 h-6 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm text-neutral-100 truncate">{currencyName(c)}</span>
                <span class="block text-[11px] text-neutral-500 uppercase">{c}{#if currencyNetwork(c)} · {currencyNetwork(c)}{/if}</span>
              </span>
              {#if c === value}<IconifyIcon icon="material-symbols:check-rounded" class="w-4 h-4 text-emerald-400" />{/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
