<script lang="ts">
  import { onMount } from 'svelte';
  import { Icon } from '@steeze-ui/svelte-icon';
  import IconifyIcon from '@iconify/svelte';
  import Select from '$lib/components/Select.svelte';
  import { Search, X, Filter } from '@steeze-ui/feather-icons';

  export let initialBins = '';
  /** inline mode: grow with content (page scrolls) instead of an internal scroll area */
  export let inline = false;

  let bins = initialBins;
  let bank = '';
  let country = '';
  let brand = '';
  let type = '';
  let page = 1;

  let loading = false;
  let facets: any = { countries: [], brands: [], types: [] };
  let data: any = { results: [], total: 0, totalPages: 1, page: 1 };
  let selected: any = null;
  let ran = false;

  const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '—');
  function flag(iso?: string | null) {
    if (!iso || iso.length !== 2) return '🏳';
    return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  const brandLogo: Record<string, string> = {
    VISA: 'logos:visa', MASTERCARD: 'logos:mastercard', 'AMERICAN EXPRESS': 'logos:amex',
    DISCOVER: 'logos:discover', JCB: 'logos:jcb', 'DINERS CLUB': 'simple-icons:dinersclub', UNIONPAY: 'simple-icons:unionpay',
  };

  $: countryOptions = [{ value: '', label: 'Any country' }, ...[...facets.countries].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((c: any) => ({ value: c.name, label: c.name, hint: c.count.toLocaleString() }))];
  $: brandOptions = [{ value: '', label: 'Any vendor' }, ...facets.brands.map((b: any) => ({ value: b.name, label: cap(b.name), hint: b.count.toLocaleString() }))];
  $: typeOptions = [{ value: '', label: 'Any type' }, ...facets.types.map((t: any) => ({ value: t.name, label: cap(t.name), hint: t.count.toLocaleString() }))];

  async function run(toPage = 1) {
    page = toPage;
    loading = true;
    ran = true;
    const p = new URLSearchParams();
    if (bins.trim()) p.set('bins', bins.trim());
    if (bank.trim()) p.set('bank', bank.trim());
    if (country) p.set('country', country);
    if (brand) p.set('brand', brand);
    if (type) p.set('type', type);
    p.set('page', String(page));
    try {
      const res = await fetch(`/api/bin/search?${p.toString()}`);
      data = await res.json();
    } catch {
      data = { results: [], total: 0, totalPages: 1, page: 1 };
    } finally {
      loading = false;
    }
  }
  function clearAll() {
    bins = ''; bank = ''; country = ''; brand = ''; type = '';
    data = { results: [], total: 0, totalPages: 1, page: 1 };
    ran = false;
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/bin/search?facets=1');
      const d = await res.json();
      facets = d.facets || facets;
    } catch {}
    if (initialBins.replace(/\D/g, '').length >= 6) run(1);
  });
</script>

<div class="flex flex-col {inline ? '' : 'h-full'}">
  <!-- Filters -->
  <div class="space-y-3 shrink-0">
    <div class="flex gap-2">
      <div class="flex items-center gap-2 flex-1 min-w-0 bg-neutral-950 border border-neutral-700 rounded-lg px-3 focus-within:border-emerald-500/60 transition">
        <Icon src={Search} class="w-4 h-4 text-neutral-500 shrink-0" />
        <input bind:value={bins} on:keydown={(e) => e.key === 'Enter' && run(1)} placeholder="BINs — 414720, 535310 …" class="w-full min-w-0 bg-transparent py-2.5 text-sm font-mono focus:outline-none" />
      </div>
      <button class="btn !w-auto px-5 flex items-center gap-2 shrink-0" on:click={() => run(1)}><Icon src={Search} class="w-4 h-4" /> Search</button>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <input bind:value={bank} on:keydown={(e) => e.key === 'Enter' && run(1)} placeholder="Bank / issuer" class="min-w-0 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
      <Select bind:value={country} searchable placeholder="Any country" options={countryOptions} on:change={() => run(1)} />
      <Select bind:value={brand} placeholder="Any vendor" options={brandOptions} on:change={() => run(1)} />
      <Select bind:value={type} placeholder="Any type" options={typeOptions} on:change={() => run(1)} />
    </div>
  </div>

  <!-- Results -->
  <div class="flex items-center justify-between mt-4 mb-2 text-sm text-neutral-400 shrink-0">
    <span>{loading ? 'Searching…' : ran ? `${data.total.toLocaleString()} result${data.total === 1 ? '' : 's'}` : 'Enter a BIN or pick filters'}</span>
    {#if ran && !loading}<button class="inline-flex items-center gap-1 text-xs hover:text-emerald-300" on:click={clearAll}><Icon src={X} class="w-3 h-3" /> Clear</button>{/if}
  </div>

  <div class="{inline ? '' : 'flex-1 overflow-y-auto -mx-1 px-1'} min-w-0">
    {#if loading}
      <div class="space-y-2">{#each Array(6) as _}<div class="h-12 bg-neutral-800/60 rounded-lg animate-pulse"></div>{/each}</div>
    {:else if ran && data.results.length === 0}
      <div class="text-center py-12 text-neutral-500"><Icon src={Filter} class="w-8 h-8 mx-auto mb-2" /><p class="text-sm">No matches — widen your filters.</p></div>
    {:else if data.results.length}
      <div class="rounded-xl border border-neutral-800 overflow-x-auto">
        <table class="w-full min-w-[34rem]">
          <thead><tr><th>BIN</th><th>Vendor</th><th>Type</th><th class="hidden sm:table-cell">Bank</th><th>Country</th></tr></thead>
          <tbody>
            {#each data.results as r (r.bin)}
              <tr class="cursor-pointer" on:click={() => (selected = r)}>
                <td class="font-mono text-emerald-300">{r.bin}</td>
                <td>{#if brandLogo[(r.brand || '').toUpperCase()]}<IconifyIcon icon={brandLogo[r.brand.toUpperCase()]} class="h-5 w-auto inline-block align-middle" />{:else}{r.brand || '—'}{/if}</td>
                <td class="text-sm">{cap(r.type)}</td>
                <td class="text-sm truncate max-w-[14rem] hidden sm:table-cell">{r.issuer || '—'}</td>
                <td class="text-sm whitespace-nowrap">{flag(r.isoCode2)} {r.countryName || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.totalPages > 1}
        <div class="flex items-center justify-between mt-3 text-sm">
          <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.page > 1 ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => run(data.page - 1)}>← Prev</button>
          <span class="text-neutral-400">Page {data.page} / {data.totalPages}</span>
          <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.page < data.totalPages ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => run(data.page + 1)}>Next →</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Row detail -->
{#if selected}
  <div class="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" on:click|self={() => (selected = null)} on:keydown={(e) => e.key === 'Escape' && (selected = null)} role="presentation">
    <div class="card w-full max-w-sm relative">
      <button class="absolute top-3 right-3 text-neutral-500 hover:text-white" on:click={() => (selected = null)}><Icon src={X} class="w-5 h-5" /></button>
      <div class="rounded-xl bg-gradient-to-br from-emerald-700/40 via-neutral-800 to-teal-800/30 p-5 mb-4 border border-neutral-700">
        <div class="flex items-start justify-between">
          <div><p class="text-[11px] uppercase tracking-widest text-neutral-400">BIN</p><p class="text-2xl font-mono tracking-widest text-emerald-300">{selected.bin}</p></div>
          <span class="text-3xl">{flag(selected.isoCode2)}</span>
        </div>
        <p class="font-semibold mt-4">{selected.issuer || 'Unknown issuer'}</p>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Vendor</p><p>{selected.brand || '—'}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Type</p><p>{cap(selected.type)}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Category</p><p>{cap(selected.category)}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Country</p><p>{flag(selected.isoCode2)} {selected.countryName || '—'}</p></div>
      </div>
    </div>
  </div>
{/if}
