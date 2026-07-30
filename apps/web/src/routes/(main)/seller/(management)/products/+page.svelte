<script lang="ts">
  import type { PageData } from './$types';
  import { Package, Plus, Eye, Edit3, TrendingUp, AlertCircle, CheckCircle, XCircle } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';

  export let data: PageData;

  // DOWNLOAD and SERVICE are unlimited; only LICENSE tracks stock.
  function getStockStatus(stock: any, type: string) {
    if (type !== 'LICENSE') return { status: 'unlimited', color: 'text-emerald-400', icon: CheckCircle };
    const numStock = typeof stock === 'string' ? parseInt(stock) : stock;
    if (numStock === 0) return { status: 'out-of-stock', color: 'text-red-400', icon: XCircle };
    if (numStock < 10) return { status: 'low-stock', color: 'text-amber-400', icon: AlertCircle };
    return { status: 'in-stock', color: 'text-emerald-400', icon: CheckCircle };
  }

  function getStatusText(stock: any, type: string) {
    if (type !== 'LICENSE') return 'Unlimited';
    const numStock = typeof stock === 'string' ? parseInt(stock) : stock;
    if (numStock === 0) return 'Out of Stock';
    if (numStock < 10) return 'Low Stock';
    return 'In Stock';
  }

  const typeLabel = (t: string) => (t === 'DOWNLOAD' ? 'Download' : t === 'SERVICE' ? 'Service' : 'License');

  const stockNum = (s: any) => (typeof s === 'string' ? parseInt(s) : s);
  $: inStock = data.products.filter((p) => p.type !== 'LICENSE' || stockNum(p.stock) > 0).length;
  $: lowStock = data.products.filter((p) => p.type === 'LICENSE' && stockNum(p.stock) > 0 && stockNum(p.stock) < 10).length;
  $: outStock = data.products.filter((p) => p.type === 'LICENSE' && stockNum(p.stock) === 0).length;
</script>

<div class="space-y-6">
  <!-- Header with Stats -->
  <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
    <div>
      <h1 class="font-montserrat font-bold text-2xl tracking-tight">Products</h1>
      <p class="text-sm text-neutral-400">Manage your products, inventory and performance.</p>
    </div>
    <a href="/seller/products/new" class="btn flex items-center gap-2 w-max">
      <Icon src={Plus} class="w-4 h-4" />
      New product
    </a>
  </div>

  <!-- Quick Stats -->
  <div class="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-800/80 border-y border-neutral-800/80">
    <div class="py-5 px-4"><p class="text-xs text-neutral-500">Total products</p><p class="font-montserrat font-bold text-2xl tabular-nums">{data.products.length}</p></div>
    <div class="py-5 px-4"><p class="text-xs text-neutral-500">In stock</p><p class="font-montserrat font-bold text-2xl tabular-nums text-emerald-400">{inStock}</p></div>
    <div class="py-5 px-4 border-t md:border-t-0 border-neutral-800/80"><p class="text-xs text-neutral-500">Low stock</p><p class="font-montserrat font-bold text-2xl tabular-nums {lowStock ? 'text-amber-400' : ''}">{lowStock}</p></div>
    <div class="py-5 px-4 border-t md:border-t-0 border-neutral-800/80"><p class="text-xs text-neutral-500">Out of stock</p><p class="font-montserrat font-bold text-2xl tabular-nums {outStock ? 'text-red-400' : ''}">{outStock}</p></div>
  </div>

  <!-- Products Table -->
  {#if data.products.length === 0}
    <div class="card text-center py-12">
      <Icon src={Package} class="w-16 h-16 text-neutral-500 mx-auto mb-4" />
      <h3 class="text-xl font-semibold text-neutral-300 mb-2">No Products Yet</h3>
      <p class="text-neutral-400 mb-6">Start by creating your first product to begin selling</p>
      <a href="/seller/products/new" class="btn w-max mx-auto flex items-center gap-2">
        <Icon src={Plus} class="w-4 h-4" />
        Create Your First Product
      </a>
    </div>
  {:else}
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-neutral-700">
              <th class="text-left py-4 px-4 font-semibold text-sm text-neutral-300">Product</th>
              <th class="text-left py-4 px-4 font-semibold text-sm text-neutral-300">Category</th>
              <th class="text-left py-4 px-4 font-semibold text-sm text-neutral-300">Type</th>
              <th class="text-left py-4 px-4 font-semibold text-sm text-neutral-300">Price</th>
              <th class="text-left py-4 px-4 font-semibold text-sm text-neutral-300">Stock Status</th>
              <th class="text-right py-4 px-4 font-semibold text-sm text-neutral-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.products as product, index}
              {@const stockStatus = getStockStatus(product.stock, product.type)}
              <tr class="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                <td class="py-4 px-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 grid place-items-center text-neutral-300 font-bold text-sm shrink-0">
                      {#if product.image}
                        <img src={product.image} alt={product.name} class="w-full h-full object-cover" />
                      {:else}
                        {product.name.charAt(0).toUpperCase()}
                      {/if}
                    </div>
                    <div>
                      <h4 class="font-medium text-white">{product.name}</h4>
                      <p class="text-xs text-neutral-400">ID: {product.id}</p>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-700 text-neutral-300">
                    {product.category.name}
                  </span>
                </td>
                <td class="py-4 px-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {product.type === 'LICENSE' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
                    {typeLabel(product.type)}
                  </span>
                </td>
                <td class="py-4 px-4">
                  <span class="font-mono tabular-nums text-emerald-400 font-semibold">${product.price.toFixed(2)}</span>
                </td>
                <td class="py-4 px-4">
                  <div class="flex items-center gap-2">
                    <Icon src={stockStatus.icon} class="w-4 h-4 {stockStatus.color}" />
                    <span class="text-sm {stockStatus.color}">
                      {getStatusText(product.stock, product.type)}
                    </span>
                    {#if product.type === 'LICENSE'}
                      <span class="text-xs text-neutral-500">({product.stock})</span>
                    {/if}
                  </div>
                </td>
                <td class="py-4 px-4">
                  <div class="flex justify-end gap-2">
                    <a 
                      href="/product/{product.id}" 
                      class="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm transition-colors"
                      title="View Product"
                    >
                      <Icon src={Eye} class="w-3 h-3" />
                      View
                    </a>
                    <a 
                      href="/seller/products/{product.id}"
                      class="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm transition-colors"
                      title="Edit Product"
                    >
                      <Icon src={Edit3} class="w-3 h-3" />
                      Edit
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  table {
    border-collapse: separate;
    border-spacing: 0;
  }
  
  th {
    position: sticky;
    top: 0;
    background: rgb(38 38 38);
    z-index: 10;
  }
  
  tbody tr:last-child {
    border-bottom: none;
  }
</style>
