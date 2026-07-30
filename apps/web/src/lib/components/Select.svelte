<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { ChevronDown, Check, Search } from '@steeze-ui/feather-icons';

  export let value: string = '';
  /** options: { value, label, hint? } */
  export let options: { value: string; label: string; hint?: string }[] = [];
  export let placeholder = 'Select…';
  /** optional form field name — renders a hidden input so it submits inside a <form> */
  export let name: string | undefined = undefined;
  export let searchable = false;
  export let disabled = false;
  export let id: string | undefined = undefined;

  const dispatch = createEventDispatcher();

  let open = false;
  let search = '';
  let container: HTMLElement;

  $: selected = options.find((o) => o.value === value) || null;
  $: filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  })();

  function pick(v: string) {
    value = v;
    open = false;
    search = '';
    dispatch('change', v);
  }
  function toggle() {
    if (disabled) return;
    open = !open;
  }
  function onWindowClick(e: MouseEvent) {
    if (open && container && !container.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKey} />

{#if name}<input type="hidden" {name} {value} />{/if}

<div class="relative {open ? 'z-50' : ''}" bind:this={container}>
  <button
    type="button"
    {id}
    class="w-full flex items-center justify-between gap-2 bg-neutral-900 border rounded-lg px-3 py-2 text-sm transition disabled:opacity-60 {open ? 'border-emerald-600/60 ring-2 ring-emerald-600/15' : 'border-neutral-700 hover:border-neutral-600'}"
    on:click={toggle}
    aria-haspopup="listbox"
    aria-expanded={open}
    {disabled}
  >
    <span class="truncate {selected ? '' : 'text-neutral-500'}">{selected ? selected.label : placeholder}</span>
    <Icon src={ChevronDown} class="w-4 h-4 text-neutral-500 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div transition:slide={{ duration: 150 }} class="absolute z-[60] left-0 right-0 mt-1.5 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
      {#if searchable}
        <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
          <Icon src={Search} class="w-4 h-4 text-neutral-500 shrink-0" />
          <!-- svelte-ignore a11y-autofocus -->
          <input bind:value={search} autofocus placeholder="Search…" class="w-full bg-transparent text-sm focus:outline-none placeholder:text-neutral-600" />
        </div>
      {/if}
      <div class="max-h-64 overflow-y-auto py-1">
        {#each filtered as o (o.value)}
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-800 transition {o.value === value ? 'text-emerald-300' : 'text-neutral-200'}"
            on:click={() => pick(o.value)}
          >
            <span class="truncate">{o.label}</span>
            <span class="flex items-center gap-2 shrink-0">
              {#if o.hint}<span class="text-[11px] text-neutral-500 tabular-nums">{o.hint}</span>{/if}
              {#if o.value === value}<Icon src={Check} class="w-4 h-4 text-emerald-400" />{/if}
            </span>
          </button>
        {:else}
          <p class="px-3 py-4 text-sm text-neutral-500 text-center">No matches</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
