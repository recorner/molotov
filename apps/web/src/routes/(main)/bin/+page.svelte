<script lang="ts">
  import { Icon } from '@steeze-ui/svelte-icon';
  import IconifyIcon from '@iconify/svelte';
  import Select from '$lib/components/Select.svelte';
  import { CreditCard, Search, Copy, Check, Globe, Phone, ExternalLink, X, Database, Download, Filter } from '@steeze-ui/feather-icons';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { goto, invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';

  export let data: PageData;

  // Form state mirrors the URL filters.
  let bins = data.filters.bins;
  let bank = data.filters.bank;
  let country = data.filters.country;
  let brand = data.filters.brand;
  let type = data.filters.type;

  let selected: any = null;
  let copied = '';

  $: countriesSorted = [...data.facets.countries].sort((a, b) => a.name.localeCompare(b.name));

  const cap2 = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  $: countryOptions = [{ value: '', label: 'Any country' }, ...countriesSorted.map((c) => ({ value: c.name, label: c.name, hint: c.count.toLocaleString() }))];
  $: brandOptions = [{ value: '', label: 'Any vendor' }, ...data.facets.brands.map((b) => ({ value: b.name, label: cap2(b.name), hint: b.count.toLocaleString() }))];
  $: typeOptions = [{ value: '', label: 'Any type' }, ...data.facets.types.map((t) => ({ value: t.name, label: cap2(t.name), hint: t.count.toLocaleString() }))];

  function submit() {
    const p = new URLSearchParams();
    if (bins.trim()) p.set('bins', bins.trim());
    if (bank.trim()) p.set('bank', bank.trim());
    if (country) p.set('country', country);
    if (brand) p.set('brand', brand);
    if (type) p.set('type', type);
    goto(`/bin?${p.toString()}`, { keepFocus: true, noScroll: true });
  }
  function clearAll() {
    bins = ''; bank = ''; country = ''; brand = ''; type = '';
    goto('/bin');
  }
  function gotoPage(n: number) {
    const p = new URLSearchParams(window.location.search);
    p.set('page', String(n));
    goto(`/bin?${p.toString()}`, { noScroll: true });
  }

  function flag(iso?: string | null) {
    if (!iso || iso.length !== 2) return '🏳️';
    return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = key;
      toast.push('Copied', { theme: toastThemes.success });
      setTimeout(() => (copied = copied === key ? '' : copied), 1500);
    });
  }

  const brandIcon: Record<string, string> = {
    VISA: 'logos:visa', MASTERCARD: 'logos:mastercard', 'AMERICAN EXPRESS': 'logos:amex',
    DISCOVER: 'logos:discover', JCB: 'logos:jcb', 'DINERS CLUB': 'simple-icons:dinersclub', UNIONPAY: 'simple-icons:unionpay',
  };
  const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '—');

  function exportCsv() {
    const rows = data.results;
    if (!rows.length) return;
    const head = ['BIN', 'Brand', 'Type', 'Category', 'Issuer', 'Country', 'ISO2', 'IssuerPhone', 'IssuerUrl'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')]
      .concat(rows.map((r: any) => [r.bin, r.brand, r.type, r.category, r.issuer, r.countryName, r.isoCode2, r.issuerPhone, r.issuerUrl].map(esc).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'bin-results.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // active filter chips
  $: chips = [
    data.filters.bank && { k: 'bank', label: `Bank: ${data.filters.bank}` },
    data.filters.country && { k: 'country', label: `Country: ${data.filters.country}` },
    data.filters.brand && { k: 'brand', label: `Vendor: ${data.filters.brand}` },
    data.filters.type && { k: 'type', label: `Type: ${cap(data.filters.type)}` },
    data.binList.length && { k: 'bins', label: `${data.binList.length} BIN${data.binList.length === 1 ? '' : 's'}` },
  ].filter(Boolean) as { k: string; label: string }[];

  function removeChip(k: string) {
    if (k === 'bank') bank = '';
    if (k === 'country') country = '';
    if (k === 'brand') brand = '';
    if (k === 'type') type = '';
    if (k === 'bins') bins = '';
    submit();
  }

  // admin seed
  let seeding = false, seedProgress = 0, seedInserted = 0, seedTotal = 0;
  async function seed() {
    seeding = true; seedProgress = 0; seedInserted = 0; let offset = 0;
    try {
      while (true) {
        const res = await fetch('/admin/bin/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offset }) });
        const d = await res.json();
        if (!res.ok) { toast.push(d.error || 'Seed failed', { theme: toastThemes.error }); break; }
        seedTotal = d.total; seedInserted += d.inserted;
        seedProgress = d.total ? Math.round((d.processed / d.total) * 100) : 100;
        offset = d.nextOffset;
        if (d.done) { toast.push(`Seeded ${seedInserted.toLocaleString()} new BINs`, { theme: toastThemes.success }); await invalidateAll(); break; }
      }
    } catch { toast.push('Seed failed', { theme: toastThemes.error }); }
    finally { seeding = false; }
  }
</script>

<svelte:head><title>BIN lookup · Sereni</title></svelte:head>

<div class="max-w-5xl mx-auto">
  <div class="flex items-center gap-3 mb-5">
    <div class="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 grid place-items-center shrink-0">
      <Icon src={CreditCard} class="w-6 h-6 text-emerald-400" />
    </div>
    <div>
      <h1 class="font-montserrat font-bold text-2xl tracking-tight">BIN lookup</h1>
      <p class="text-sm text-neutral-400">Search {data.total.toLocaleString()} BINs by number, bank, country, vendor or type.</p>
    </div>
  </div>

  <!-- Filter panel -->
  <form on:submit|preventDefault={submit} class="card mb-4 space-y-3 relative z-20">
    <div>
      <label for="bins" class="block text-xs text-neutral-400 mb-1">BIN numbers <span class="text-neutral-600">(comma or space separated — first 6 digits each)</span></label>
      <textarea id="bins" bind:value={bins} rows="2" placeholder="414720, 558793, 535310 …" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-emerald-600/60 resize-y"></textarea>
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <label for="bank" class="block text-xs text-neutral-400 mb-1">Bank / issuer</label>
        <input id="bank" bind:value={bank} placeholder="e.g. chase" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
      </div>
      <div>
        <label for="country" class="block text-xs text-neutral-400 mb-1">Country</label>
        <Select id="country" bind:value={country} searchable placeholder="Any country" options={countryOptions} />
      </div>
      <div>
        <label for="brand" class="block text-xs text-neutral-400 mb-1">Card vendor</label>
        <Select id="brand" bind:value={brand} placeholder="Any vendor" options={brandOptions} />
      </div>
      <div>
        <label for="type" class="block text-xs text-neutral-400 mb-1">Type</label>
        <Select id="type" bind:value={type} placeholder="Any type" options={typeOptions} />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button type="submit" class="btn !w-auto px-5 flex items-center gap-2"><Icon src={Search} class="w-4 h-4" /> Search</button>
      <button type="button" class="px-4 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-800" on:click={clearAll}>Clear</button>
      {#if data.hasQuery && data.results.length}
        <button type="button" class="px-4 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-800 flex items-center gap-2 ml-auto" on:click={exportCsv}><Icon src={Download} class="w-4 h-4" /> Export CSV</button>
      {/if}
    </div>
  </form>

  <!-- Active chips -->
  {#if chips.length}
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <Icon src={Filter} class="w-4 h-4 text-neutral-500" />
      {#each chips as c}
        <button class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700" on:click={() => removeChip(c.k)}>
          {c.label} <Icon src={X} class="w-3 h-3" />
        </button>
      {/each}
    </div>
  {/if}

  <!-- Results -->
  {#if data.hasQuery}
    {#if data.results.length === 0}
      <div class="card text-center py-12">
        <Icon src={Search} class="w-10 h-10 text-neutral-600 mx-auto mb-3" />
        <p class="font-semibold">No matching BINs</p>
        <p class="text-sm text-neutral-400">Try widening your filters.</p>
      </div>
    {:else}
      <div class="flex items-center justify-between mb-2 text-sm text-neutral-400">
        <span>{data.pagination.totalCount.toLocaleString()} result{data.pagination.totalCount === 1 ? '' : 's'}</span>
        <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
      </div>
      <div class="card !p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table>
            <thead><tr><th>BIN</th><th>Vendor</th><th>Type</th><th>Bank</th><th>Country</th><th class="text-right">View</th></tr></thead>
            <tbody>
              {#each data.results as r (r.bin)}
                <tr class="cursor-pointer" on:click={() => (selected = r)}>
                  <td class="font-mono text-emerald-300">{r.bin}</td>
                  <td>
                    {#if brandIcon[(r.brand || '').toUpperCase()]}
                      <IconifyIcon icon={brandIcon[r.brand.toUpperCase()]} class="h-5 w-auto inline-block align-middle" />
                    {:else}{r.brand || '—'}{/if}
                  </td>
                  <td class="text-sm">{cap(r.type)}</td>
                  <td class="text-sm truncate max-w-[16rem]">{r.issuer || '—'}</td>
                  <td class="text-sm whitespace-nowrap">{flag(r.isoCode2)} {r.countryName || '—'}</td>
                  <td class="text-right text-neutral-600">›</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if data.pagination.totalPages > 1}
        <div class="flex items-center justify-between mt-4 text-sm">
          <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasPrev ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => gotoPage(data.pagination.page - 1)}>← Prev</button>
          <span class="text-neutral-400">Page {data.pagination.page} / {data.pagination.totalPages}</span>
          <button class="px-3 py-1.5 rounded-lg border border-neutral-700 {data.pagination.hasNext ? 'hover:bg-neutral-800' : 'opacity-40 pointer-events-none'}" on:click={() => gotoPage(data.pagination.page + 1)}>Next →</button>
        </div>
      {/if}
    {/if}
  {:else}
    <div class="card text-center py-12">
      <Icon src={CreditCard} class="w-10 h-10 text-neutral-600 mx-auto mb-3" />
      <p class="font-semibold">Start a search</p>
      <p class="text-sm text-neutral-400">Enter BINs or pick any combination of bank, country, vendor and type.</p>
    </div>
  {/if}

  <!-- Admin seed -->
  {#if data.isAdmin}
    <div class="text-center mt-5">
      {#if seeding}
        <div class="card max-w-sm mx-auto border-amber-500/30 bg-amber-500/5">
          <div class="h-2 bg-neutral-800 rounded-full overflow-hidden mb-2"><div class="h-full bg-amber-500 transition-all" style={`width:${seedProgress}%`}></div></div>
          <p class="text-xs text-neutral-400">{seedProgress}% · {seedInserted.toLocaleString()} inserted{seedTotal ? ` of ${seedTotal.toLocaleString()}` : ''}</p>
        </div>
      {:else}
        <button class="text-xs text-neutral-500 hover:text-amber-300 inline-flex items-center gap-1.5" on:click={seed}><Icon src={Database} class="w-3.5 h-3.5" /> Re-sync BIN database ({data.total.toLocaleString()} records)</button>
      {/if}
    </div>
  {/if}
</div>

<!-- Detail modal -->
{#if selected}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" on:click|self={() => (selected = null)} on:keydown={(e) => e.key === 'Escape' && (selected = null)} role="presentation">
    <div class="card w-full max-w-md relative">
      <button class="absolute top-3 right-3 text-neutral-500 hover:text-white" on:click={() => (selected = null)}><Icon src={X} class="w-5 h-5" /></button>

      <div class="relative rounded-xl bg-gradient-to-br from-emerald-700/40 via-neutral-800 to-teal-800/30 p-5 mb-4 border border-neutral-700">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-widest text-neutral-400">BIN</p>
            <button class="text-2xl font-mono tracking-widest hover:text-emerald-300 flex items-center gap-2" on:click={() => copy(selected.bin, 'bin')}>
              {selected.bin}<Icon src={copied === 'bin' ? Check : Copy} class="w-4 h-4 opacity-60" />
            </button>
          </div>
          <span class="text-3xl">{flag(selected.isoCode2)}</span>
        </div>
        <div class="mt-6 flex items-end justify-between">
          <p class="font-semibold text-lg leading-tight max-w-[70%]">{selected.issuer || 'Unknown issuer'}</p>
          {#if selected.brand}
            {#if brandIcon[selected.brand.toUpperCase()]}<IconifyIcon icon={brandIcon[selected.brand.toUpperCase()]} class="h-7 w-auto" />{:else}<span class="font-bold">{selected.brand}</span>{/if}
          {/if}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Vendor</p><p class="font-medium text-sm">{selected.brand || '—'}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Type</p><p class="font-medium text-sm">{cap(selected.type)}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Category</p><p class="font-medium text-sm">{cap(selected.category)}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3"><p class="text-[11px] text-neutral-500">Country</p><p class="font-medium text-sm">{flag(selected.isoCode2)} {selected.countryName || '—'}</p></div>
        <div class="bg-neutral-900/60 rounded-lg p-3 col-span-2"><p class="text-[11px] text-neutral-500">ISO codes</p><p class="font-medium text-sm font-mono">{selected.isoCode2 || '—'} / {selected.isoCode3 || '—'}</p></div>
      </div>

      {#if selected.issuerPhone || selected.issuerUrl}
        <div class="border-t border-neutral-800 pt-3 space-y-2">
          {#if selected.issuerPhone}
            <div class="flex items-center gap-2 text-sm"><Icon src={Phone} class="w-4 h-4 text-neutral-500" /><button class="hover:text-emerald-300" on:click={() => copy(selected.issuerPhone, 'phone')}>{selected.issuerPhone}</button></div>
          {/if}
          {#if selected.issuerUrl}
            <div class="flex items-center gap-2 text-sm"><Icon src={Globe} class="w-4 h-4 text-neutral-500" /><a href={selected.issuerUrl.startsWith('http') ? selected.issuerUrl : `https://${selected.issuerUrl}`} target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 truncate">{selected.issuerUrl}<Icon src={ExternalLink} class="w-3.5 h-3.5 shrink-0" /></a></div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
