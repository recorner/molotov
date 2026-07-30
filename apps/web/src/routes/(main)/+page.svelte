<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import ProductGrid from '$lib/components/ProductGrid.svelte';
  import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';
  import AdSlot from '$lib/components/AdSlot.svelte';
  import Landing from '$lib/components/Landing.svelte';
  import { TrendingUp, Clock, Star, Grid } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import type { PageData } from './$types';

  export let data: PageData;

  $: home = data.home;
  $: totalProducts = data.categoriesWithCounts?.reduce((sum, c) => sum + c.productCount, 0) || 0;
</script>

<svelte:head>
  <title>Sereni — digital marketplace</title>
</svelte:head>

{#if !data.user}
  <Landing {data} />
{:else}

<!-- Header -->
<header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
  <div>
    <p class="text-sm text-neutral-500">Welcome back</p>
    <h1 class="font-montserrat font-bold text-3xl tracking-tight">{data.user.username}</h1>
  </div>
  <div class="flex flex-wrap gap-2">
    <a href="/bin" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition text-sm font-medium">
      <AppIcon name="credit-card-outline" class="w-4 h-4" /> BIN lookup
    </a>
    <a href="/escrow" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition text-sm font-medium">
      <AppIcon name="handshake-outline" class="w-4 h-4" /> Escrow
    </a>
    <a href="/balance" class="btn !w-auto px-4 inline-flex items-center gap-2 text-sm">
      <AppIcon name="add" class="w-4 h-4" /> Add funds
    </a>
  </div>
</header>

<!-- Primary ad -->
{#if home.ads.primary.enabled && home.ads.primary.media}
  <div class="mb-8"><AdSlot ad={home.ads.primary} /></div>
{/if}

<!-- Stats band -->
<div class="grid grid-cols-2 sm:grid-cols-4 divide-x divide-neutral-800/80 border-y border-neutral-800/80 mb-10">
  <a href="/balance" class="group py-5 px-4 hover:bg-neutral-900/40 transition">
    <p class="text-xs text-neutral-500">Balance</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">${data.user.balance.toFixed(2)}</p>
  </a>
  <a href="/orders" class="group py-5 px-4 hover:bg-neutral-900/40 transition">
    <p class="text-xs text-neutral-500">Your orders</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums">{data.orders}</p>
  </a>
  <a href="#categories" class="group py-5 px-4 border-t sm:border-t-0 border-neutral-800/80 hover:bg-neutral-900/40 transition">
    <p class="text-xs text-neutral-500">Categories</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums">{data.categoriesWithCounts?.length || 0}</p>
  </a>
  <div class="py-5 px-4 border-t sm:border-t-0 border-neutral-800/80">
    <p class="text-xs text-neutral-500">Products</p>
    <p class="font-montserrat font-bold text-2xl tabular-nums">{totalProducts}</p>
  </div>
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
      <Icon src={Grid} class="w-5 h-5 text-neutral-500" />
      <h2 class="text-2xl font-bold">Browse categories</h2>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {#each data.categoriesWithCounts as category}
        <a href="/category/{category.id}" class="card text-center hover:scale-105 hover:border-emerald-500/40 transition-all duration-300 group">
          {#if category.image}
            <img src={category.image} alt={category.name} class="w-12 h-12 mx-auto mb-3 rounded-lg object-cover group-hover:scale-110 transition-transform" />
          {:else}
            <AppIcon name="category" class="w-12 h-12 mx-auto mb-3 text-emerald-400 group-hover:scale-110 transition-transform" />
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
      <div class="flex items-center gap-3"><Icon src={TrendingUp} class="w-5 h-5 text-neutral-500" /><h2 class="text-2xl font-bold">Top selling</h2></div>
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
      <div class="flex items-center gap-3"><Icon src={Clock} class="w-5 h-5 text-neutral-500" /><h2 class="text-2xl font-bold">Recently added</h2></div>
    </div>
    <ProductGrid products={data.recentProducts} columns={3} showLayoutToggle={false} layout="grid" />
  </section>
{/if}

<!-- Featured -->
{#if data.featuredProducts && data.featuredProducts.length > 0}
  <section class="mb-10">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3"><Icon src={Star} class="w-5 h-5 text-neutral-500" /><h2 class="text-2xl font-bold">Featured</h2></div>
    </div>
    <ProductGrid products={data.featuredProducts} columns={4} showLayoutToggle={false} layout="grid" />
  </section>
{/if}

<!-- Quick actions -->
<section class="mb-8">
  <h2 class="text-xl font-bold mb-4">Quick actions</h2>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <a href="/orders" class="card text-center hover:bg-neutral-800 transition group"><AppIcon name="package-2" class="w-8 h-8 mx-auto mb-2 text-neutral-400 group-hover:text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">View orders</span></a>
    <a href="/balance" class="card text-center hover:bg-neutral-800 transition group"><AppIcon name="account-balance-wallet" class="w-8 h-8 mx-auto mb-2 text-neutral-400 group-hover:text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">Add funds</span></a>
    <a href="/chat" class="card text-center hover:bg-neutral-800 transition group"><AppIcon name="chat-bubble-outline" class="w-8 h-8 mx-auto mb-2 text-neutral-400 group-hover:text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">Messages</span></a>
    <a href="/account" class="card text-center hover:bg-neutral-800 transition group"><AppIcon name="account-circle" class="w-8 h-8 mx-auto mb-2 text-neutral-400 group-hover:text-emerald-400 group-hover:scale-110 transition-transform" /><span class="text-sm font-medium">My account</span></a>
  </div>
</section>
{/if}
