<script lang="ts">
  import { Check, User } from '@steeze-ui/feather-icons';
  import { Telegram } from '@steeze-ui/simple-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<div class="grid gap-4">
  <div class="card flex gap-6 items-center">
    <div class="rounded-full bg-neutral-800 p-6 relative">
      <Icon src={User} class="w-12 h-12 text-neutral-500" />
      <div class="absolute right-0 bottom-0 rounded-full bg-white p-1">
        <Icon src={Check} class="w-5 h-5 text-neutral-900" />
      </div>
    </div>
    <div>
      <h1 class="font-montserrat font-bold text-xl tracking-tight">{data.seller.username}</h1>
      <span class="text-sm text-neutral-300">Verified Seller</span>
    </div>
    <div class="ml-auto flex gap-3">
      {#if data.seller.telegram}
        <a
          class="flex items-center gap-2 rounded-full hover:bg-neutral-700 transition px-2 py-1.5"
          href="https://t.me/{data.seller.telegram}"
        >
          <Icon src={Telegram} class="w-5 h-5 text-white" />
          <span class="text-sm text-neutral-300">@{data.seller.telegram}</span>
        </a>
      {/if}
    </div>
  </div>
  <table class="card overflow-hidden">
    <thead>
      <tr>
        <th>Name</th>
        <th>Description</th>
        <th>Stock</th>
        <th>Price</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#if data.seller.products}
        {#each data.seller.products as product}
          <tr>
            <td>{product.name}</td>
            <td>{product.shortDesc}</td>
            <td>{product.stock}</td>
            <td>${product.price.toFixed(2)}</td>
            <td class="flex justify-end">
              <a href="/product/{product.id}" class="btn w-max">View</a>
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
