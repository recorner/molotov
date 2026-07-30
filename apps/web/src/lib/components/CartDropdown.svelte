<script lang="ts">
  import { cart, cartTotals, maxQtyForType } from '$lib/stores/cart';
  import { ShoppingCart, Plus, Minus, X } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { slide } from 'svelte/transition';

  let isOpen = false;

  $: cartItems = $cart;
  $: totals = $cartTotals;

  function dec(item: any) {
    cart.updateQuantity(item.id, item.quantity - 1);
  }
  function inc(item: any) {
    if (item.quantity < maxQtyForType(item.type)) cart.updateQuantity(item.id, item.quantity + 1);
  }
  function remove(id: number) {
    cart.removeItem(id, { showToast: false });
  }
</script>

<div class="relative">
  <!-- Trigger (no overflow clipping so the badge shows) -->
  <button
    type="button"
    on:click={() => (isOpen = !isOpen)}
    class="relative grid place-items-center w-9 h-9 rounded-lg hover:bg-neutral-800 transition {isOpen ? 'bg-neutral-800' : ''}"
    aria-label="Cart"
  >
    <Icon src={ShoppingCart} class="w-5 h-5 text-neutral-300" />
    {#if totals.quantity > 0}
      <span class="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 grid place-items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
        {totals.quantity > 9 ? '9+' : totals.quantity}
      </span>
    {/if}
  </button>

  {#if isOpen}
    <button class="fixed inset-0 z-30 cursor-default" aria-label="Close cart" on:click={() => (isOpen = false)}></button>
    <div class="absolute z-40 right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden" transition:slide={{ duration: 160 }}>
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
        <span class="font-semibold text-sm">Your cart</span>
        <span class="text-xs text-neutral-500">{totals.quantity} item{totals.quantity === 1 ? '' : 's'}</span>
      </div>

      <div class="max-h-72 overflow-y-auto">
        {#if cartItems.length === 0}
          <div class="px-4 py-10 text-center">
            <Icon src={ShoppingCart} class="w-10 h-10 text-neutral-600 mx-auto mb-2" />
            <p class="text-sm text-neutral-400">Your cart is empty</p>
          </div>
        {:else}
          {#each cartItems as item (item.id)}
            <div class="flex items-center gap-3 px-3 py-2.5 border-b border-neutral-800/50">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">{item.name || `Product #${item.id}`}</p>
                <p class="text-xs text-neutral-500">${(item.price || 0).toFixed(2)} each</p>
              </div>
              <div class="flex items-center gap-1 bg-neutral-800 rounded-lg p-0.5 shrink-0">
                <button type="button" class="grid place-items-center w-6 h-6 rounded hover:bg-neutral-700 disabled:opacity-40" on:click={() => dec(item)} disabled={item.quantity <= 1}>
                  <Icon src={Minus} class="w-3 h-3" />
                </button>
                <span class="w-6 text-center text-xs font-mono">{item.quantity}</span>
                <button type="button" class="grid place-items-center w-6 h-6 rounded hover:bg-neutral-700 disabled:opacity-40" on:click={() => inc(item)} disabled={item.quantity >= maxQtyForType(item.type)}>
                  <Icon src={Plus} class="w-3 h-3" />
                </button>
              </div>
              <button type="button" class="grid place-items-center w-7 h-7 rounded-lg hover:bg-red-500/15 text-neutral-400 hover:text-red-400 shrink-0" on:click={() => remove(item.id)} title="Remove">
                <Icon src={X} class="w-3.5 h-3.5" />
              </button>
            </div>
          {/each}
        {/if}
      </div>

      {#if cartItems.length > 0}
        <div class="p-3 border-t border-neutral-800 space-y-2">
          <div class="flex justify-between items-center text-sm font-semibold">
            <span>Total</span><span class="text-emerald-400">${totals.total.toFixed(2)}</span>
          </div>
          <a href="/cart" class="btn block text-center" on:click={() => (isOpen = false)}>View cart &amp; checkout</a>
        </div>
      {/if}
    </div>
  {/if}
</div>
