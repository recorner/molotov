<script lang="ts">
  import IconifyIcon from '@iconify/svelte';
  import ProductGrid from '$lib/components/ProductGrid.svelte';
  import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';
  import AdSlot from '$lib/components/AdSlot.svelte';
  import { TrendingUp, Clock, Star, Grid, ArrowRight } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { fade } from 'svelte/transition';
  import type { PageData } from './$types';

  export let data: PageData;

  $: home = data.home;
  $: totalProducts = data.categoriesWithCounts?.reduce((sum, c) => sum + c.productCount, 0) || 0;

  const features = [
    { icon: 'material-symbols:bolt', title: 'Instant delivery', desc: 'Digital goods land in your account the moment you pay.' },
    { icon: 'material-symbols:handshake-outline', title: 'Secure escrow', desc: 'Funds held safely until both sides are happy.' },
    { icon: 'material-symbols:currency-bitcoin', title: 'Crypto payments', desc: 'Top up with BTC, XMR, USDT and more.' },
    { icon: 'material-symbols:chat-bubble-outline', title: 'Direct chat', desc: 'Talk to sellers and support in real time.' },
  ];
</script>

<svelte:head>
  <title>Sereni — digital marketplace</title>
</svelte:head>

<!-- Hero -->
<section class="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-emerald-600/20 via-neutral-900 to-teal-700/10 p-6 sm:p-10 mb-6" in:fade={{ duration: 400 }}>
  <div class="absolute -right-10 -top-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
  <div class="relative max-w-2xl">
    <p class="text-emerald-400 text-sm font-medium mb-2">Welcome back, {data.user.username} 👋</p>
    <h1 class="text-3xl sm:text-4xl font-bold leading-tight mb-3">{home.heroTitle}</h1>
    <p class="text-neutral-300 mb-6">{home.heroSubtitle}</p>
    <div class="flex flex-wrap gap-3">
      <a href={home.heroCtaLink} class="btn !w-auto px-6">{home.heroCtaLabel}</a>
      <a href="/escrow" class="px-6 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition text-sm font-medium grid place-items-center">Start an escrow deal</a>
    </div>
  </div>
</section>

<!-- Primary ad -->
{#if home.ads.primary.enabled && home.ads.primary.media}
  <div class="mb-6"><AdSlot ad={home.ads.primary} /></div>
{/if}

<!-- Quick stats -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
  <a href="/orders" class="card flex items-center gap-3 hover:border-neutral-700 transition">
    <IconifyIcon icon="material-symbols:package-2" class="w-8 h-8 text-emerald-400" />
    <div><p class="text-xs text-neutral-400">Your orders</p><p class="text-xl font-bold">{data.orders}</p></div>
  </a>
  <a href="/balance" class="card flex items-center gap-3 hover:border-neutral-700 transition">
    <IconifyIcon icon="material-symbols:account-balance-wallet" class="w-8 h-8 text-emerald-400" />
    <div><p class="text-xs text-neutral-400">Balance</p><p class="text-xl font-bold text-emerald-400">${data.user.balance.toFixed(2)}</p></div>
  </a>
  <a href="#categories" class="card flex items-center gap-3 hover:border-neutral-700 transition">
    <IconifyIcon icon="material-symbols:category" class="w-8 h-8 text-sky-400" />
    <div><p class="text-xs text-neutral-400">Categories</p><p class="text-xl font-bold">{data.categoriesWithCounts?.length || 0}</p></div>
  </a>
  <div class="card flex items-center gap-3">
    <IconifyIcon icon="material-symbols:storefront" class="w-8 h-8 text-purple-400" />
    <div><p class="text-xs text-neutral-400">Products</p><p class="text-xl font-bold">{totalProducts}</p></div>
  </div>
</div>

<!-- Feature highlights -->
<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
  {#each features as f}
    <div class="card">
      <IconifyIcon icon={f.icon} class="w-7 h-7 text-emerald-400 mb-2" />
      <p class="font-semibold text-sm">{f.title}</p>
      <p class="text-xs text-neutral-400 mt-0.5">{f.desc}</p>
    </div>
  {/each}
</div>

<!-- Announcements -->
{#if data.announcements && data.announcements.length > 0}
  <div class="mb-8">
    <AnnouncementBanner announcements={data.announcements} maxVisible={3} autoRotate={true} />
  </div>
{/if}

<!-- Categories -->
{#if data.categoriesWithCounts && data.categoriesWithCounts.length > 0}
  <section class="mb-10 scroll-mt-20" id="categories">
    <div class="flex items-center gap-3 mb-5">
      <Icon src={Grid} class="w-6 h-6 text-emerald-400" />
      <h2 class="text-2xl font-bold">Browse categories</h2>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {#each data.categoriesWithCounts as category}
        <a href="/category/{category.id}" class="card text-center hover:scale-105 hover:border-emerald-500/40 transition-all duration-300 group">
          {#if category.image}
            <img src={category.image} alt={category.name} class="w-12 h-12 mx-auto mb-3 rounded-lg object-cover group-hover:scale-110 transition-transform" />
          {:else}
            <IconifyIcon icon="material-symbols:category" class="w-12 h-12 mx-auto mb-3 text-emerald-400 group-hover:scale-110 transition-transform" />
          {/if}
          <h3 class="font-semibold text-sm mb-1 group-hover:text-emerald-400 transition-colors">{category.name}</h3>
          <p class="text-xs text-neutral-400">{category.productCount} product{category.productCount === 1 ? '' : 's'}</p>
        </a>
      {/each}
    </div>
  </section>
{/if}

<!-- Top selling -->
{#if data.topSellingProducts && data.topSellingProducts.length > 0}
  <section class="mb-10">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3"><Icon src={TrendingUp} class="w-6 h-6 text-orange-400" /><h2 class="text-2xl font-bold">Top selling</h2></div>
    </div>
    <ProductGrid products={data.topSellingProducts} columns={3} showLayoutToggle={false} layout="grid" />
  </section>
{/if}

<!-- Secondary ad -->
{#if home.ads.secondary.enabled && home.ads.secondary.media}
  <div class="mb-10"><AdSlot ad={home.ads.secondary} aspect="aspect-[16/4]" /></div>
{/if}

<!-- Recently added -->
{#if data.recentProducts && data.recentProducts.length > 0}
  <section class="mb-10">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3"><Icon src={Clock} class="w-6 h-6 text-green-400" /><h2 class="text-2xl font-bold">Recently added</h2></div>
    </div>
    <ProductGrid products={data.recentProducts} columns={3} showLayoutToggle={false} layout="grid" />
  </section>
{/if}

<!-- Featured -->
{#if data.featuredProducts && data.featuredProducts.length > 0}
  <section class="mb-10">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3"><Icon src={Star} class="w-6 h-6 text-yellow-400" /><h2 class="text-2xl font-bold">Featured</h2></div>
    </div>
    <ProductGrid products={data.featuredProducts} columns={4} showLayoutToggle={false} layout="grid" />
  </section>
{/if}

<!-- Quick actions -->
<section class="mb-8">
  <h2 class="text-xl font-bold mb-4">Quick actions</h2>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <a href="/orders" class="card text-center hover:bg-neutral-800 transition group"><IconifyIcon icon="material-symbols:package-2" class="w-8 h-8 mx-auto mb-2 text-green-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">View orders</span></a>
    <a href="/balance" class="card text-center hover:bg-neutral-800 transition group"><IconifyIcon icon="material-symbols:account-balance-wallet" class="w-8 h-8 mx-auto mb-2 text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">Add funds</span></a>
    <a href="/chat" class="card text-center hover:bg-neutral-800 transition group"><IconifyIcon icon="material-symbols:chat-bubble-outline" class="w-8 h-8 mx-auto mb-2 text-sky-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">Messages</span></a>
    <a href="/account" class="card text-center hover:bg-neutral-800 transition group"><IconifyIcon icon="material-symbols:account-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">My account</span></a>
  </div>
</section>
