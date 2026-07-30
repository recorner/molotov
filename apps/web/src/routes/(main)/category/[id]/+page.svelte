<script lang="ts">
  import { goto } from '$app/navigation';
  import { ChevronLeft, ChevronRight, Frown } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import ProductGrid from '$lib/components/ProductGrid.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const goToPage = (page: number) => {
    if (page < 1 || page > data.pages || page === data.page) return;
    // set the page number in the URL search params
    goto(`/category/${data.category.id}?page=${page}`);
  };
</script>

<svelte:head>
  <title>{data.category.name} - Category</title>
</svelte:head>

<!-- Category Header -->
<div class="mb-6">
  <h1 class="font-montserrat font-bold text-3xl tracking-tight mb-2">{data.category.name}</h1>
  <p class="text-neutral-400">
    {data.category.products?.length || 0} product{data.category.products?.length === 1 ? '' : 's'} 
    {data.pages > 1 ? `(Page ${data.page} of ${data.pages})` : ''}
  </p>
</div>

{#if data.category?.products?.length === 0}
  <div class="flex items-center justify-center flex-col pt-12">
    <Icon src={Frown} class="w-16 h-16 text-neutral-500 mb-2" />
    <h2 class="font-bold text-xl mb-2">No Products Found</h2>
    <span class="text-sm mb-4 block text-neutral-300">There are no products in this category yet. Check back later!</span>
    <a href="/" class="btn bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors">
      Browse Other Categories
    </a>
  </div>
{:else}
  <!-- Product Grid -->
  <ProductGrid 
    products={data.category.products || []} 
    columns={4}
    showLayoutToggle={true}
    layout="grid"
    emptyMessage="No products in this category"
    emptySubMessage="Try browsing other categories or check back later"
  />

  <!-- Pagination -->
  {#if data.pages > 1}
    <div class="mt-8 card p-4">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <p class="text-sm text-neutral-400">Page</p>
          <input
            type="number"
            value={data.page}
            min={1}
            max={data.pages}
            class="bg-neutral-850 rounded-lg px-2 py-1 w-16 border border-neutral-700 text-center"
            on:change={(e) => goToPage(Number((e.target as HTMLInputElement).value))}
          />
          <p class="text-sm text-neutral-400">of {data.pages}</p>
        </div>
        
        <div class="flex items-center gap-2">
          <button 
            class="page-btn flex items-center gap-1 px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors disabled:opacity-50"
            disabled={data.page <= 1}
            on:click={() => goToPage(data.page - 1)}
          >
            <Icon src={ChevronLeft} class="w-4 h-4" />
            <span class="hidden sm:inline">Previous</span>
          </button>

          <span class="text-sm text-neutral-400 px-2">
            {data.page} / {data.pages}
          </span>

          <button 
            class="page-btn flex items-center gap-1 px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors disabled:opacity-50"
            disabled={data.page >= data.pages}
            on:click={() => goToPage(data.page + 1)}
          >
            <span class="hidden sm:inline">Next</span>
            <Icon src={ChevronRight} class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .card {
    background-color: rgb(23 23 23);
    border-radius: 0.5rem;
    border: 1px solid rgb(64 64 64);
  }

  .btn {
    font-weight: 500;
    transition: all 0.2s;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .page-btn:disabled {
    cursor: not-allowed;
  }
</style>
