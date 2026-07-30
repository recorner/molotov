<script lang="ts">
  import { ShoppingCart, User, Eye, Tag, Package } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { cart } from '$lib/stores/cart';

  export let product: {
    id: number;
    name: string;
    shortDesc?: string;
    price: number;
    stock: string | number;
    type?: string;
    image?: string | null;
    seller?: { id: number; username: string };
    category?: { name: string };
  };

  export let showAddToCart = true;
  export let layout: 'card' | 'list' = 'card';
  export const size: 'sm' | 'md' | 'lg' = 'md';

  $: inStock =
    product.stock === '∞' ||
    (typeof product.stock === 'number' && product.stock > 0) ||
    (typeof product.stock === 'string' && parseInt(product.stock) > 0);

  function handleAddToCart() {
    cart.addItem(
      product.id,
      1,
      { name: product.name, price: product.price, stock: product.stock, type: product.type },
      { showToast: true, preventDuplicates: false, toastMessage: `Added ${product.name} to cart` }
    );
  }
</script>

{#if layout === 'card'}
  <div class="group flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900/70 overflow-hidden hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all duration-300">
    <!-- Image -->
    <a href="/product/{product.id}" class="relative block aspect-[4/3] bg-neutral-950 overflow-hidden">
      {#if product.image}
        <img src={product.image} alt={product.name} loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      {:else}
        <div class="w-full h-full grid place-items-center text-neutral-700">
          <Icon src={Package} class="w-10 h-10" />
        </div>
      {/if}
      {#if product.category}
        <span class="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-neutral-200">
          <Icon src={Tag} class="w-3 h-3" />{product.category.name}
        </span>
      {/if}
      {#if !inStock}
        <span class="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-red-500/80 text-white">Sold out</span>
      {:else if product.stock !== '∞'}
        <span class="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-amber-300">{product.stock} left</span>
      {/if}
    </a>

    <!-- Body -->
    <div class="flex flex-col flex-1 p-4">
      <h3 class="font-semibold leading-snug line-clamp-1">
        <a href="/product/{product.id}" class="hover:text-emerald-400 transition-colors">{product.name}</a>
      </h3>
      <p class="text-sm text-neutral-400 mt-1 line-clamp-2 min-h-[2.5rem]">
        {product.shortDesc || 'No description provided.'}
      </p>

      <!-- Footer pinned to bottom -->
      <div class="flex items-end justify-between gap-2 mt-4 pt-3 border-t border-neutral-800/70">
        <div class="min-w-0">
          <p class="font-montserrat font-bold text-xl tabular-nums text-emerald-400">${product.price.toFixed(2)}</p>
          {#if product.seller}
            <a href="/seller/{product.seller.id}" class="text-xs text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1 truncate">
              <Icon src={User} class="w-3 h-3" />{product.seller.username}
            </a>
          {/if}
        </div>
        <div class="flex gap-1.5 shrink-0">
          <a href="/product/{product.id}" class="grid place-items-center w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition" title="View details">
            <Icon src={Eye} class="w-4 h-4" />
          </a>
          {#if showAddToCart && inStock}
            <button on:click={handleAddToCart} class="grid place-items-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition" title="Add to cart">
              <Icon src={ShoppingCart} class="w-4 h-4" />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

{:else}
  <!-- list -->
  <div class="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 hover:border-neutral-700 transition">
    <a href="/product/{product.id}" class="w-16 h-16 rounded-lg bg-neutral-950 overflow-hidden grid place-items-center shrink-0">
      {#if product.image}
        <img src={product.image} alt={product.name} loading="lazy" class="w-full h-full object-cover" />
      {:else}
        <Icon src={Package} class="w-6 h-6 text-neutral-700" />
      {/if}
    </a>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <a href="/product/{product.id}" class="font-semibold truncate hover:text-emerald-400">{product.name}</a>
        {#if product.category}<span class="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 shrink-0">{product.category.name}</span>{/if}
      </div>
      {#if product.shortDesc}<p class="text-sm text-neutral-400 truncate">{product.shortDesc}</p>{/if}
      {#if product.seller}
        <a href="/seller/{product.seller.id}" class="text-xs text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1 mt-0.5"><Icon src={User} class="w-3 h-3" />{product.seller.username}</a>
      {/if}
    </div>
    <div class="flex items-center gap-4 shrink-0">
      <span class="font-montserrat font-bold tabular-nums text-emerald-400">${product.price.toFixed(2)}</span>
      <div class="flex gap-1.5">
        <a href="/product/{product.id}" class="grid place-items-center w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition"><Icon src={Eye} class="w-4 h-4" /></a>
        {#if showAddToCart && inStock}
          <button on:click={handleAddToCart} class="grid place-items-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"><Icon src={ShoppingCart} class="w-4 h-4" /></button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
