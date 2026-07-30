<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { cart, maxQtyForType } from '$lib/stores/cart';
  import toastThemes from '$lib/toastThemes';
  import { AlertTriangle, ShoppingCart, Trash, Plus, Minus, ArrowLeft } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { toast } from '@zerodevx/svelte-toast';
  import { fade, slide } from 'svelte/transition';
  import type { PageData } from './$types';

  export let data: PageData;

  let isProcessing = false;

  $: subtotal = data.products.reduce((acc, item) => acc + item.price * item.quantity, 0);
  $: totalItems = data.products.reduce((acc, item) => acc + item.quantity, 0);
  $: insufficient = data.user && subtotal > data.user.balance;

  const typeLabel = (t: string) =>
    t === 'DOWNLOAD' ? 'Digital download' : t === 'SERVICE' ? 'Service' : 'License key';

  const maxFor = (item: any) =>
    Math.min(typeof item.stock === 'number' ? item.stock : 99, maxQtyForType(item.type));

  function updateQuantity(productId: number, newQuantity: number) {
    const product = data.products.find((p) => p.id === productId);
    if (!product) return;
    const max = maxFor(product);
    const q = Math.min(Math.max(1, newQuantity), max);
    product.quantity = q;
    data.products = [...data.products];
    cart.updateQuantity(productId, q); // persist to cookie/localStorage
  }

  function removeProduct(productId: number) {
    data.products = data.products.filter((p) => p.id !== productId);
    cart.removeItem(productId, { showToast: false });
    toast.push('Removed from cart', { theme: toastThemes.success });
  }
</script>

<svelte:head>
  <title>Cart ({totalItems}) - Sereni</title>
</svelte:head>

<div class="flex items-center gap-3 mb-6" in:fade={{ duration: 300 }}>
  <a href="/" class="grid place-items-center w-9 h-9 rounded-lg hover:bg-neutral-800 transition" title="Continue shopping">
    <Icon src={ArrowLeft} class="w-5 h-5" />
  </a>
  <div>
    <h1 class="font-montserrat font-bold text-2xl tracking-tight">Your cart</h1>
    <p class="text-sm text-neutral-400">{totalItems} item{totalItems === 1 ? '' : 's'}</p>
  </div>
</div>

{#if data.products.length === 0}
  <div class="card text-center py-16" in:fade={{ duration: 400 }}>
    <div class="w-20 h-20 bg-neutral-800 rounded-full grid place-items-center mx-auto mb-5">
      <Icon src={ShoppingCart} class="w-9 h-9 text-neutral-500" />
    </div>
    <h2 class="text-xl font-bold mb-1">Your cart is empty</h2>
    <p class="text-neutral-400 mb-6 max-w-sm mx-auto text-sm">
      Browse the catalog to find digital products and services.
    </p>
    <a href="/" class="btn !w-auto px-6 inline-flex items-center gap-2 mx-auto">
      <Icon src={ShoppingCart} class="w-4 h-4" /> Start shopping
    </a>
  </div>
{:else}
  <form
    class="grid gap-5 lg:grid-cols-[1fr_22rem] items-start"
    method="post"
    action="?/checkout"
    use:enhance={() => {
      isProcessing = true;
      return async ({ result }) => {
        isProcessing = false;
        if (result.type == 'failure') {
          const e = (result.data as any)?.error;
          if (e === 'changed' || e === 'invalid') {
            toast.push('Some items changed or are no longer available', { theme: toastThemes.error });
            await invalidateAll();
          } else if (e === 'insufficient') {
            toast.push('Insufficient balance — please add funds', { theme: toastThemes.error });
          } else {
            toast.push('Checkout failed, please try again', { theme: toastThemes.error });
          }
        } else if (result.type === 'success') {
          await invalidateAll();
          cart.clear({ showToast: false });
          toast.push('Order placed!', { theme: toastThemes.success });
          goto('/orders');
        }
      };
    }}
  >
    <!-- Items -->
    <div class="card !p-0 divide-y divide-neutral-800">
      {#each data.products as item (item.id)}
        <div class="flex gap-4 p-4" in:slide={{ duration: 250 }}>
          <input type="hidden" name="products" value={item.id} />
          <input type="hidden" name="quantities" value={item.quantity} />

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <a href="/product/{item.id}" class="font-semibold hover:text-emerald-300 transition line-clamp-1">{item.name}</a>
                <div class="flex items-center gap-2 mt-1">
                  <span class="px-2 py-0.5 bg-neutral-800 rounded text-[11px] text-neutral-300">{item.category.name}</span>
                  <span class="text-[11px] text-neutral-500">{typeLabel(item.type)}</span>
                </div>
              </div>
              <button
                type="button"
                on:click={() => removeProduct(item.id)}
                class="p-2 rounded-lg hover:bg-red-500/15 group shrink-0"
                title="Remove"
              >
                <Icon src={Trash} class="w-4 h-4 text-neutral-400 group-hover:text-red-400" />
              </button>
            </div>

            <div class="flex items-center justify-between mt-3">
              <div class="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
                <button type="button" on:click={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1}
                  class="grid place-items-center w-7 h-7 rounded hover:bg-neutral-700 transition disabled:opacity-40">
                  <Icon src={Minus} class="w-3.5 h-3.5" />
                </button>
                <input type="number" value={item.quantity} min="1" max={maxFor(item)}
                  on:change={(e) => updateQuantity(item.id, parseInt((e.target as HTMLInputElement).value) || 1)}
                  class="bg-transparent text-center w-10 text-sm focus:outline-none" />
                <button type="button" on:click={() => updateQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= maxFor(item)}
                  class="grid place-items-center w-7 h-7 rounded hover:bg-neutral-700 transition disabled:opacity-40">
                  <Icon src={Plus} class="w-3.5 h-3.5" />
                </button>
              </div>
              <div class="text-right">
                <div class="font-semibold text-emerald-400">${(item.price * item.quantity).toFixed(2)}</div>
                <div class="text-[11px] text-neutral-500">${item.price.toFixed(2)} each</div>
              </div>
            </div>

            {#if typeof item.stock === 'number' && item.stock < 5}
              <div class="mt-2 flex items-center gap-1.5 text-amber-400 text-xs">
                <Icon src={AlertTriangle} class="w-3.5 h-3.5" /> Only {item.stock} left
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Summary -->
    <div class="card lg:sticky lg:top-20">
      <h2 class="font-bold text-lg mb-4">Order summary</h2>
      <div class="space-y-2.5 text-sm mb-4">
        <div class="flex justify-between"><span class="text-neutral-400">Items ({totalItems})</span><span>${subtotal.toFixed(2)}</span></div>
        <div class="flex justify-between"><span class="text-neutral-400">Fees</span><span class="text-emerald-400">Free</span></div>
        <div class="flex justify-between pt-2.5 border-t border-neutral-800 text-base font-semibold">
          <span>Total</span><span class="text-emerald-400">${subtotal.toFixed(2)}</span>
        </div>
      </div>

      <div class="flex justify-between text-xs text-neutral-400 mb-4">
        <span>Your balance</span><span class="tabular-nums">${data.user.balance.toFixed(2)}</span>
      </div>

      {#if insufficient}
        <div class="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
          <p class="text-red-300 font-medium mb-0.5">Insufficient balance</p>
          <p class="text-xs text-red-300/70 mb-1">Add ${(subtotal - data.user.balance).toFixed(2)} to complete this order.</p>
          <a href="/balance" class="text-xs text-emerald-400 hover:text-emerald-300 underline">Add funds →</a>
        </div>
      {/if}

      <button type="submit" class="btn" disabled={isProcessing || insufficient}>
        {#if isProcessing}Processing…{:else if insufficient}Insufficient balance{:else}Complete order — ${subtotal.toFixed(2)}{/if}
      </button>
      <p class="text-[11px] text-neutral-500 text-center mt-3">Paid instantly from your Sereni balance. Digital items are delivered immediately.</p>
    </div>
  </form>
{/if}
