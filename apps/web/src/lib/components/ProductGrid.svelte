<script lang="ts">
  import ProductCard from './ProductCard.svelte';
  import { Grid, List, Square } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let products: any[] = [];
  export let layout: 'grid' | 'list' = 'grid';
  export let columns: 1 | 2 | 3 | 4 | 5 = 4;
  export let showLayoutToggle = true;
  export let showAddToCart = true;
  export let loading = false;
  export let emptyMessage = "No products found";
  export let emptySubMessage = "Try adjusting your search or filters";

  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
  };
</script>

<div class="space-y-4">
  <!-- Header with Layout Controls -->
  {#if showLayoutToggle}
    <div class="flex items-center justify-between">
      <div class="text-sm text-neutral-400">
        {products.length} product{products.length === 1 ? '' : 's'}
      </div>
      
      <div class="flex items-center gap-2">
        <span class="text-sm text-neutral-400">View:</span>
        <div class="flex bg-neutral-800 rounded-lg p-1">
          <button
            on:click={() => layout = 'grid'}
            class="p-2 rounded transition-colors {layout === 'grid' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}"
            title="Grid View"
          >
            <Icon src={Square} class="w-4 h-4" />
          </button>
          <button
            on:click={() => layout = 'list'}
            class="p-2 rounded transition-colors {layout === 'list' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}"
            title="List View"
          >
            <Icon src={List} class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="grid {columnClasses[columns]} gap-4">
      {#each Array(8) as _, i}
        <div 
          class="card p-4 animate-pulse"
          in:fade={{ duration: 300, delay: i * 50 }}
        >
          <div class="h-4 bg-neutral-700 rounded mb-2"></div>
          <div class="h-3 bg-neutral-700 rounded w-3/4 mb-4"></div>
          <div class="flex justify-between items-center">
            <div class="h-6 bg-neutral-700 rounded w-16"></div>
            <div class="h-8 bg-neutral-700 rounded w-20"></div>
          </div>
        </div>
      {/each}
    </div>
  
  <!-- Empty State -->
  {:else if products.length === 0}
    <div 
      class="flex flex-col items-center justify-center py-16 text-center"
      in:fade={{ duration: 400 }}
    >
      <div class="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
        <Icon src={Grid} class="w-8 h-8 text-neutral-500" />
      </div>
      <h3 class="text-xl font-semibold text-neutral-300 mb-2">{emptyMessage}</h3>
      <p class="text-neutral-500 max-w-md">{emptySubMessage}</p>
    </div>

  <!-- Products Display -->
  {:else if layout === 'grid'}
    <div class="grid {columnClasses[columns]} gap-4">
      {#each products as product, i}
        <div
          in:fly={{ y: 20, duration: 300, delay: i * 50, easing: quintOut }}
        >
          <ProductCard 
            {product} 
            layout="card" 
            {showAddToCart}
            size={columns >= 4 ? 'sm' : 'md'}
          />
        </div>
      {/each}
    </div>
  {:else}
    <div class="space-y-2">
      {#each products as product, i}
        <div
          in:fly={{ x: -20, duration: 300, delay: i * 30, easing: quintOut }}
        >
          <ProductCard 
            {product} 
            layout="list" 
            {showAddToCart}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .card {
    @apply bg-neutral-850 border border-neutral-700 rounded-lg;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
