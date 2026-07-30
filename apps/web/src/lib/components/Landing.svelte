<script lang="ts">
  import IconifyIcon from '@iconify/svelte';
  import AppIcon from '$lib/components/AppIcon.svelte';
  import AdSlot from '$lib/components/AdSlot.svelte';
  import BinSearch from '$lib/components/BinSearch.svelte';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { ArrowRight, ArrowUpRight, Search, Lock, Check, Copy, X, Maximize2, Shield, Zap } from '@steeze-ui/feather-icons';
  import { onMount, onDestroy, tick } from 'svelte';
  import { fly, slide } from 'svelte/transition';

  export let data: any;
  const home = data.home;
  const l = data.landing ?? { productCount: 0, categoryCount: 0, binCount: 0, escrowCount: 0 };
  const fmt = (n: number) => n.toLocaleString();

  // ---- live BIN lookup ----
  let raw = '';
  let loading = false;
  let result: any = null;
  let error = '';
  let copied = false;
  let debounce: ReturnType<typeof setTimeout>;
  $: digits = raw.replace(/\D/g, '');

  function onInput() {
    clearTimeout(debounce);
    error = '';
    if (digits.length < 6) { result = null; return; }
    debounce = setTimeout(lookup, 280);
  }
  async function lookup() {
    if (digits.length < 6) return;
    loading = true; error = '';
    try {
      const res = await fetch(`/api/bin/${digits.slice(0, 6)}`);
      const d = await res.json();
      if (!res.ok) { error = d.error || 'Lookup failed'; result = null; }
      else result = d;
    } catch { error = 'Network error'; result = null; }
    finally { loading = false; }
  }
  function tryExample(b: string) { raw = b; onInput(); }
  function flag(iso?: string | null) {
    if (!iso || iso.length !== 2) return '🏳';
    return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  function copyBin() {
    if (!result?.bin) return;
    navigator.clipboard.writeText(result.bin);
    copied = true; setTimeout(() => (copied = false), 1400);
  }
  const brandLogo: Record<string, string> = {
    VISA: 'logos:visa', MASTERCARD: 'logos:mastercard', 'AMERICAN EXPRESS': 'logos:amex',
    DISCOVER: 'logos:discover', JCB: 'logos:jcb', 'DINERS CLUB': 'simple-icons:dinersclub', UNIONPAY: 'simple-icons:unionpay',
  };
  const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '—');
  const examples = ['457173', '535310', '371449', '601100'];
  const networks = ['logos:visa', 'logos:mastercard', 'logos:amex', 'logos:discover', 'logos:jcb', 'logos:unionpay', 'simple-icons:dinersclub'];

  // ---- hero message rotation ----
  const slides = [
    { tag: `${fmt(l.binCount)} BIN records`, title: 'Identify any card', accent: 'in milliseconds.', sub: 'Paste the first six digits and Sereni reveals the issuing bank, network, type and country — instantly.', ctas: [{ label: 'Advanced BIN search', href: '/bin', primary: true, icon: 'credit-card-outline' }, { label: 'Start an escrow deal', href: '/escrow', primary: false, icon: 'handshake-outline' }] },
    { tag: 'Escrow · no account', title: 'Trade safely', accent: 'with anyone.', sub: 'Funds are held in escrow until both sides confirm delivery. Fund with balance or crypto, settle in minutes.', ctas: [{ label: 'Start an escrow deal', href: '/escrow', primary: true, icon: 'handshake-outline' }, { label: 'Look up a BIN', href: '/bin', primary: false, icon: 'credit-card-outline' }] },
    { tag: 'Instant delivery · crypto', title: 'Everything digital,', accent: 'delivered instantly.', sub: 'Downloads, licenses and services from verified sellers — delivered the moment payment confirms.', ctas: [{ label: 'Browse marketplace', href: '/auth/register', primary: true, icon: 'storefront-outline' }, { label: 'Advanced BIN search', href: '/bin', primary: false, icon: 'credit-card-outline' }] },
  ];
  let slideIdx = 0;
  let paused = false;
  let timer: ReturnType<typeof setInterval>;
  function go(i: number) { slideIdx = (i + slides.length) % slides.length; }
  function startRotate() { clearInterval(timer); timer = setInterval(() => { if (!paused) go(slideIdx + 1); }, 6000); }
  onMount(startRotate);
  onDestroy(() => clearInterval(timer));

  // ---- inline full search ----
  let showSearch = false;
  let searchSeed = '';
  let searchEl: HTMLElement;
  async function openFullSearch(seed = '') {
    searchSeed = seed; showSearch = true;
    await tick();
    searchEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function lookupAndExpand() { lookup(); if (digits.length >= 6) openFullSearch(digits.slice(0, 6)); }

  const compact = (n: number) => {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return '' + n;
  };
  const atLeast = (real: number, floor: number) => compact(Math.max(real || 0, floor)) + '+';
  const stats = [
    { d: fmt(l.binCount), k: 'BIN records' },
    { d: atLeast(l.productCount, 1_000_000), k: 'Products' },
    { d: atLeast(l.escrowCount, 35_000), k: 'Escrow deals' },
    { d: atLeast(l.categoryCount, 800), k: 'Categories' },
  ];
</script>

<!-- ambient backdrop (fixed → never affects document width) -->
<div class="bg-fx" aria-hidden="true"></div>

<!-- ===== HERO ===== -->
<section class="grid lg:grid-cols-2 gap-8 lg:gap-10 items-center pt-4 pb-12 lg:pt-8 lg:pb-20" on:mouseenter={() => (paused = true)} on:mouseleave={() => (paused = false)} role="group">
  <!-- message -->
  <div class="order-2 lg:order-1 min-w-0">
    <div class="inline-flex max-w-full items-center gap-2 text-[11px] text-emerald-200/90 mb-5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
      <span class="truncate">Free · {fmt(l.binCount)} BINs · no signup</span>
    </div>

    {#key slideIdx}
      <div in:fly={{ y: 14, duration: 450 }}>
        <p class="text-xs uppercase tracking-[0.2em] text-emerald-300/70 mb-3">{slides[slideIdx].tag}</p>
        <h1 class="font-montserrat font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.02]">
          {slides[slideIdx].title} <span class="shine">{slides[slideIdx].accent}</span>
        </h1>
        <p class="text-neutral-300/80 text-base sm:text-lg mt-5 max-w-md">{slides[slideIdx].sub}</p>
        <div class="flex flex-wrap items-center gap-3 mt-7">
          {#each slides[slideIdx].ctas as cta}
            {#if cta.primary}
              <a href={cta.href} class="btn !w-auto px-5 py-2.5 inline-flex items-center gap-2"><AppIcon name={cta.icon} class="w-4 h-4" /> {cta.label}</a>
            {:else}
              <a href={cta.href} class="px-5 py-2.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition text-sm font-medium inline-flex items-center gap-2"><AppIcon name={cta.icon} class="w-4 h-4" /> {cta.label}</a>
            {/if}
          {/each}
        </div>
      </div>
    {/key}

    <div class="flex items-center gap-2 mt-8">
      {#each slides as _, i}
        <button type="button" aria-label={`Slide ${i + 1}`} on:click={() => { go(i); startRotate(); }} class="h-1.5 rounded-full transition-all duration-500 {slideIdx === i ? 'w-7 bg-emerald-400' : 'w-2 bg-white/20 hover:bg-white/40'}"></button>
      {/each}
    </div>
  </div>

  <!-- BIN console -->
  <div class="order-1 lg:order-2 min-w-0">
    <div class="console rounded-2xl p-5 sm:p-6">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="flex items-center gap-2 text-[11px] uppercase tracking-widest text-neutral-400 min-w-0"><Icon src={Search} class="w-3.5 h-3.5 shrink-0" /> <span class="truncate">BIN lookup</span></span>
        <button type="button" on:click={() => openFullSearch(digits.slice(0, 6))} class="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 shrink-0"><Icon src={Maximize2} class="w-3 h-3" /> Full search</button>
      </div>

      <div class="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/15 transition">
        <input
          id="hero-bin"
          bind:value={raw}
          on:input={onInput}
          on:keydown={(e) => e.key === 'Enter' && lookupAndExpand()}
          inputmode="numeric"
          maxlength="19"
          placeholder="4 5 7 1 7 3"
          autocomplete="off"
          class="w-full min-w-0 bg-transparent py-3.5 text-xl sm:text-2xl font-mono tracking-[0.15em] tabular-nums focus:outline-none placeholder:text-neutral-700"
        />
        {#if loading}<span class="w-4 h-4 border-2 border-neutral-600 border-t-emerald-400 rounded-full animate-spin shrink-0"></span>{/if}
      </div>

      <div class="flex flex-wrap items-center gap-1.5 mt-3">
        <span class="text-[11px] text-neutral-600">try</span>
        {#each examples as ex}
          <button type="button" on:click={() => tryExample(ex)} class="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/10 border border-white/5 text-neutral-300 transition">{ex}</button>
        {/each}
      </div>

      <div class="mt-4 min-h-[3.5rem]">
        {#if error}
          <p class="text-sm text-red-300/90 py-3">{error}</p>
        {:else if result && !result.found}
          <p class="text-sm text-neutral-500 py-3">No record for <span class="font-mono text-neutral-300">{result.bin}</span>.</p>
        {:else if result && result.found}
          <div in:fly={{ y: 8, duration: 250 }} class="rounded-xl border border-white/10 bg-black/30 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <button on:click={copyBin} class="font-mono text-lg tracking-widest text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-2">
                  {result.bin}<Icon src={copied ? Check : Copy} class="w-3.5 h-3.5 opacity-50" />
                </button>
                <p class="font-medium leading-tight mt-1 truncate">{result.issuer || 'Unknown issuer'}</p>
              </div>
              <div class="shrink-0 text-right">
                {#if brandLogo[(result.brand || '').toUpperCase()]}
                  <IconifyIcon icon={brandLogo[result.brand.toUpperCase()]} class="h-6 w-auto inline-block" />
                {:else if result.brand}<span class="text-sm font-semibold">{result.brand}</span>{/if}
              </div>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-neutral-400">
              <span>{cap(result.type)}</span>
              {#if result.category}<span class="text-neutral-600">/</span><span>{cap(result.category)}</span>{/if}
              <span class="text-neutral-600">/</span>
              <span>{flag(result.isoCode2)} {result.countryName || '—'}</span>
            </div>
            <button on:click={() => openFullSearch(result.bin)} class="w-full mt-3 text-sm text-emerald-400 hover:text-emerald-300 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
              <Icon src={Maximize2} class="w-3.5 h-3.5" /> Open full search
            </button>
          </div>
        {:else}
          <p class="text-sm text-neutral-600 py-3">Enter 6 digits — results appear as you type. Card numbers are never stored.</p>
        {/if}
      </div>
    </div>

    <!-- network marquee -->
    <div class="marquee mt-5">
      <div class="marquee-track">
        {#each [...networks, ...networks] as b}
          <IconifyIcon icon={b} class="h-6 w-auto opacity-50 grayscale shrink-0" />
        {/each}
      </div>
    </div>
  </div>
</section>

<!-- inline full search -->
{#if showSearch}
  <section bind:this={searchEl} class="card mb-12 scroll-mt-20" transition:slide={{ duration: 250 }}>
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-montserrat font-bold text-lg tracking-tight flex items-center gap-2"><Icon src={Search} class="w-5 h-5 text-emerald-400" /> BIN search</h2>
      <button class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white" on:click={() => (showSearch = false)}><Icon src={X} class="w-4 h-4" /> Close</button>
    </div>
    {#key searchSeed}<BinSearch initialBins={searchSeed} inline />{/key}
  </section>
{/if}

<!-- primary ad -->
{#if home.ads.primary.enabled && home.ads.primary.media}
  <div class="mb-12"><AdSlot ad={home.ads.primary} /></div>
{/if}

<!-- stats -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-14">
  {#each stats as s}
    <div class="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5">
      <p class="font-montserrat font-bold text-2xl sm:text-3xl tabular-nums">{s.d}</p>
      <p class="text-xs text-neutral-500 mt-1">{s.k}</p>
    </div>
  {/each}
</div>

<!-- features -->
<section class="mb-14">
  <div class="max-w-xl mb-6">
    <p class="text-xs uppercase tracking-[0.2em] text-emerald-300/70 mb-2">The platform</p>
    <h2 class="font-montserrat font-bold text-2xl sm:text-3xl tracking-tight leading-tight">A trust layer, a toolkit, and a marketplace.</h2>
  </div>

  <div class="grid lg:grid-cols-3 gap-4">
    <a href="/escrow" class="tile lg:col-span-2 group p-6 sm:p-8">
      <span class="grid place-items-center w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 mb-4"><Icon src={Shield} class="w-5 h-5" /></span>
      <div class="flex items-center gap-2 mb-1">
        <h3 class="font-montserrat font-bold text-xl tracking-tight">Escrow for any deal</h3>
        <span class="text-[10px] uppercase tracking-wide text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">no account</span>
      </div>
      <p class="text-neutral-400 max-w-md">Trade with strangers safely — funds held until both sides confirm. Balance or crypto, settled in minutes.</p>
      <span class="inline-flex items-center gap-1.5 text-emerald-400 text-sm mt-5 group-hover:gap-2.5 transition-all">Open a deal <Icon src={ArrowUpRight} class="w-4 h-4" /></span>
    </a>

    <a href="/auth/register" class="tile group p-6 sm:p-8 flex flex-col">
      <span class="grid place-items-center w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 mb-4"><AppIcon name="storefront-outline" class="w-5 h-5" /></span>
      <h3 class="font-montserrat font-bold text-xl tracking-tight mb-1">Digital marketplace</h3>
      <p class="text-neutral-400 flex-1">Downloads, licenses and services from verified sellers.</p>
      <span class="inline-flex items-center gap-1.5 text-neutral-300 text-sm mt-5 group-hover:text-emerald-300 transition">Browse <Icon src={ArrowRight} class="w-4 h-4" /></span>
    </a>
  </div>

  <div class="grid sm:grid-cols-3 gap-4 mt-4">
    <div class="tile p-5">
      <span class="grid place-items-center w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-300 mb-3"><AppIcon name="currency-bitcoin" class="w-5 h-5" /></span>
      <h4 class="font-semibold">Crypto payments</h4>
      <p class="text-sm text-neutral-500 mt-1">BTC, XMR, USDT &amp; more.</p>
    </div>
    <a href="/auth/login" class="tile group p-5">
      <div class="flex items-center justify-between">
        <span class="grid place-items-center w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 mb-3"><AppIcon name="chat-bubble-outline" class="w-5 h-5" /></span>
        <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-400"><Icon src={Lock} class="w-3 h-3" /> login</span>
      </div>
      <h4 class="font-semibold">Encrypted chat</h4>
      <p class="text-sm text-neutral-500 mt-1">Encrypted at rest.</p>
    </a>
  </div>
</section>

<!-- secondary ad -->
{#if home.ads.secondary.enabled && home.ads.secondary.media}
  <div class="mb-14"><AdSlot ad={home.ads.secondary} aspect="aspect-[16/4]" /></div>
{/if}

<!-- closing -->
<section class="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-6 py-12 sm:px-12 sm:py-16 text-center mb-4">
  <p class="text-xs uppercase tracking-[0.25em] text-emerald-300/70 mb-3">Free to use · upgrade any time</p>
  <h2 class="font-montserrat font-bold text-2xl sm:text-4xl tracking-tight leading-tight max-w-2xl mx-auto">Use the tools free. <span class="shine">Create an account to trade.</span></h2>
  <div class="flex flex-wrap gap-3 justify-center mt-8">
    <a href="/auth/register" class="btn !w-auto px-6 py-2.5">Create free account</a>
    <a href="/bin" class="px-6 py-2.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition font-medium grid place-items-center">Open BIN tool</a>
  </div>
</section>

<style>
  /* ambient backdrop — fixed, so it can never affect document width */
  .bg-fx {
    position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden;
    background:
      radial-gradient(38rem 32rem at 88% -8%, rgba(16,185,129,0.16), transparent 60%),
      radial-gradient(34rem 30rem at -8% 108%, rgba(20,184,166,0.12), transparent 60%);
  }
  .bg-fx::after {
    content: ''; position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 56px 56px;
    -webkit-mask-image: radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 75%);
    mask-image: radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 75%);
  }

  .shine {
    background: linear-gradient(100deg, #6ee7b7, #34d399, #99f6e4, #34d399, #6ee7b7);
    background-size: 200% auto;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: shine 6s linear infinite;
  }
  @keyframes shine { to { background-position: 200% center; } }

  .console {
    background: linear-gradient(180deg, rgba(23,23,23,0.85), rgba(10,10,10,0.85));
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 30px 60px -30px rgba(0,0,0,0.7);
    backdrop-filter: blur(12px);
  }

  .tile {
    border-radius: 1rem; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    transition: border-color .25s ease, transform .25s ease;
  }
  .tile:hover { border-color: rgba(52,211,153,0.35); transform: translateY(-2px); }

  .marquee { overflow: hidden; max-width: 100%; }
  .marquee-track { display: flex; align-items: center; gap: 2.25rem; width: max-content; animation: marquee 26s linear infinite; }
  @keyframes marquee { to { transform: translateX(-50%); } }

  @media (prefers-reduced-motion: reduce) {
    .shine, .marquee-track { animation: none; }
  }
</style>
