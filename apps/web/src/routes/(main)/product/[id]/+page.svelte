<script lang="ts">
  import { applyAction, enhance } from '$app/forms';
  import { Minus, Plus, ShoppingCart, Heart, Share, Star, Download, Key, CheckCircle, AlertCircle } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { toast } from '@zerodevx/svelte-toast';
  import { marked, Renderer } from 'marked';
  import { cart, isInCart } from '$lib/stores/cart';
  import type { PageData } from './$types';
  import toastThemes from '$lib/toastThemes';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let data: PageData;
  let quantity = 1;
  let addingToCart = false;

  // Check if product is in cart
  $: productInCart = $isInCart(data.product.id);

  marked.use({
    renderer: {
      // image(string href, string title, string text)
      image: (href, title, text) => {
        if (!href) return '';

        if (!href.includes('://') || new URL(href).origin === 'http://localhost:9000') {
          return `<img src="${href}" alt="${text || ''}" title="${title || ''}" class="max-w-full h-auto rounded-lg" />`;
        }
      },
    },
  });

  function handleAddToCart() {
    addingToCart = true;
    cart.addItem(data.product.id, quantity, {
      name: data.product.name,
      price: data.product.price,
      stock: data.product.stock,
      type: data.product.type
    }, {
      showToast: true,
      preventDuplicates: false, // Allow multiple quantities
      toastMessage: `Added ${quantity}x ${data.product.name} to cart`
    });
    
    // Reset quantity after adding
    quantity = 1;
    addingToCart = false;
  }

  function shareProduct() {
    if (navigator.share) {
      navigator.share({
        title: data.product.name,
        text: (data.product as any).shortDesc || data.product.name,
        url: window.location.href,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast.push('Product link copied to clipboard!', {
          theme: toastThemes.success,
        });
      });
    }
  }
</script>

<svelte:head>
  <title>{data.product.name} - ${data.product.price.toFixed(2)}</title>
  <meta name="description" content={(data.product as any).shortDesc || data.product.name} />
</svelte:head>

<div class="flex gap-6 flex-col-reverse lg:flex-row" in:fade={{ duration: 400 }}>
  <!-- Product Details -->
  <div class="card w-full h-max flex-1">
    <!-- Preview image -->
    {#if (data.product as any).image}
      <div class="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 mb-6 aspect-[16/9]">
        <img src={(data.product as any).image} alt={data.product.name} class="w-full h-full object-cover" />
      </div>
    {/if}
    <!-- Product Header -->
    <div class="mb-6">
      <div class="flex items-start justify-between gap-4 mb-3">
        <div class="flex-1">
          <h1 class="font-montserrat font-bold text-3xl tracking-tight mb-2 leading-tight">{data.product.name}</h1>
          <p class="text-neutral-300 flex items-center gap-2">
            Sold by
            <a 
              href="/seller/{data.product.seller.id}" 
              class="hover:underline text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              {data.product.seller.username}
            </a>
          </p>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex gap-2">
          <button
            on:click={shareProduct}
            class="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
            title="Share Product"
          >
            <Icon src={Share} class="w-5 h-5 text-neutral-400" />
          </button>
          <button
            class="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
            title="Add to Wishlist"
          >
            <Icon src={Heart} class="w-5 h-5 text-neutral-400 hover:text-red-400" />
          </button>
        </div>
      </div>

      <!-- Product Badges -->
      <div class="flex flex-wrap gap-2 mb-4">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-full">
          <Icon src={data.product.type === 'DOWNLOAD' ? Download : Key} class="w-3.5 h-3.5" />
          {data.product.type === 'DOWNLOAD' ? 'Digital download' : 'License key'}
        </span>
        {#if data.product.stock === '∞'}
          <span class="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">
            <Icon src={CheckCircle} class="w-3.5 h-3.5" /> Unlimited stock
          </span>
        {:else if (typeof data.product.stock === 'number' && data.product.stock > 0) || (typeof data.product.stock === 'string' && parseInt(data.product.stock) > 0)}
          <span class="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-full">
            <Icon src={AlertCircle} class="w-3.5 h-3.5" /> {data.product.stock} left
          </span>
        {/if}
      </div>

      <!-- Short Description -->
      {#if (data.product as any).shortDesc}
        <p class="text-lg text-neutral-300 leading-relaxed mb-4 p-4 bg-neutral-800/50 rounded-lg border-l-4 border-emerald-500">
          {(data.product as any).shortDesc}
        </p>
      {/if}
    </div>

    <!-- Product Description -->
    <div class="prose prose-invert max-w-none">
      <h2 class="text-xl font-semibold mb-4 text-white">Product Description</h2>
      <div class="prose-content">
        {@html marked.parse(data.product.description, {})}
      </div>
    </div>
  </div>

  <!-- Purchase Panel -->
  <div class="lg:w-96 xl:w-[28rem] flex-shrink-0">
    <div class="card h-max sticky top-4">
      {#if typeof data.product.stock == 'number' && data.product.stock <= 0}
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon src={ShoppingCart} class="w-8 h-8 text-red-400" />
          </div>
          <h3 class="font-semibold text-xl mb-2">Out of Stock</h3>
          <p class="text-neutral-400">This product is currently unavailable</p>
        </div>
      {:else}
        <!-- Price Section -->
        <div class="text-center mb-6">
          <div class="font-montserrat font-bold text-4xl tabular-nums text-emerald-400 mb-2">
            ${(data.product.price * quantity).toFixed(2)}
          </div>
          {#if quantity > 1}
            <p class="text-sm text-neutral-400">
              ${data.product.price.toFixed(2)} each × {quantity}
            </p>
          {/if}
        </div>

        <!-- Quantity Selector -->
        {#if data.product.stock == '∞' || (typeof data.product.stock === 'string' ? parseInt(data.product.stock) : data.product.stock) > 0}
          {@const max = data.product.stock == '∞' ? 10 : (typeof data.product.stock === 'string' ? parseInt(data.product.stock) : data.product.stock)}
          {@const updateQuantity = (value) => {
            if (value < 1) quantity = 1;
            else if (value > max) quantity = max;
            else quantity = value;
          }}
          
          {#if max > 1}
            <div class="mb-6">
              <label for="quantity-input" class="block text-sm font-medium mb-2">Quantity</label>
              <div class="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 border border-neutral-700">
                <button 
                  class="p-1 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                  on:click={() => updateQuantity(quantity - 1)} 
                  type="button"
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <Icon src={Minus} class="w-4 h-4" />
                </button>

                <input
                  id="quantity-input"
                  type="number"
                  class="bg-transparent text-center w-full font-mono"
                  bind:value={quantity}
                  max={max}
                  min={1}
                />

                <button 
                  class="p-1 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                  on:click={() => updateQuantity(quantity + 1)} 
                  type="button"
                  disabled={quantity >= max}
                  aria-label="Increase quantity"
                >
                  <Icon src={Plus} class="w-4 h-4" />
                </button>
              </div>
              <p class="text-xs text-neutral-400 mt-1">
                Maximum: {max} {max === 1 ? 'item' : 'items'}
              </p>
            </div>
          {/if}
        {/if}

        <!-- Add to Cart Button -->
        <div class="space-y-3 mb-6">
          <button
            on:click={handleAddToCart}
            disabled={addingToCart || productInCart}
            class="w-full btn bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-400 text-white py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium"
            in:scale={{ duration: 200, easing: quintOut }}
          >
            <Icon src={ShoppingCart} class="w-5 h-5" />
            {#if addingToCart}
              Adding...
            {:else if productInCart}
              Already in Cart
            {:else}
              Add to Cart
            {/if}
          </button>

          {#if productInCart}
            <a 
              href="/cart"
              class="w-full btn bg-neutral-700 hover:bg-neutral-600 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              View Cart
            </a>
          {/if}
        </div>

        <!-- Product Info -->
        <div class="border-t border-neutral-700 pt-4 space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-neutral-400">Type:</span>
            <span>{data.product.type === 'DOWNLOAD' ? 'Digital Download' : 'License Key'}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-neutral-400">Delivery:</span>
            <span>Instant</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-neutral-400">Support:</span>
            <span>24/7</span>
          </div>
        </div>

        <!-- Security Badge -->
        <div class="mt-6 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div class="flex items-center gap-2 text-green-400 text-sm">
            <Icon src={Star} class="w-4 h-4" />
            <span class="font-medium">Secure Purchase Guaranteed</span>
          </div>
          <p class="text-xs text-green-300/80 mt-1">
            Your payment is protected and your download is guaranteed.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .card {
    background-color: rgb(23 23 23);
    border-radius: 0.5rem;
    border: 1px solid rgb(64 64 64);
    padding: 1.5rem;
  }

  .btn {
    font-weight: 500;
    transition: all 0.2s;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn:disabled {
    cursor: not-allowed;
  }

  /* Enhanced prose styling */
  :global(.prose-content h1) {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 2rem;
    margin-bottom: 1rem;
    color: white;
  }

  :global(.prose-content h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: white;
  }

  :global(.prose-content h3) {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    color: white;
  }

  :global(.prose-content p) {
    margin-bottom: 1rem;
    line-height: 1.6;
    color: rgb(212 212 212);
  }

  :global(.prose-content ul, .prose-content ol) {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  :global(.prose-content li) {
    margin-bottom: 0.25rem;
    color: rgb(212 212 212);
  }

  :global(.prose-content code) {
    background-color: rgb(38 38 38);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: ui-monospace, monospace;
    font-size: 0.875rem;
  }

  :global(.prose-content pre) {
    background-color: rgb(23 23 23);
    border: 1px solid rgb(64 64 64);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    margin: 1rem 0;
  }

  :global(.prose-content blockquote) {
    border-left: 4px solid rgb(59 130 246);
    padding-left: 1rem;
    margin: 1rem 0;
    font-style: italic;
    color: rgb(163 163 163);
  }

  :global(.prose-content img) {
    border-radius: 0.5rem;
    margin: 1rem 0;
  }
</style>
