<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import toastThemes from '$lib/toastThemes';
  import { toast } from '@zerodevx/svelte-toast';
  import ProductInput from '../ProductInput.svelte';
  import type { PageData } from './$types';
  import { Save, ArrowLeft, Eye, Trash2 } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';

  export let data: PageData;
  let isSubmitting = false;
  let isDeleting = false;
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
    <div class="flex items-center gap-4">
      <button 
        on:click={() => goto('/seller/products')}
        class="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
      >
        <Icon src={ArrowLeft} class="w-5 h-5 text-neutral-400" />
      </button>
      <div>
        <h1 class="font-montserrat font-bold text-2xl tracking-tight text-white">Edit product</h1>
        <p class="text-neutral-400">Update your product information and settings</p>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="flex gap-2">
      <a 
        href="/product/{data.product.id}" 
        class="btn bg-neutral-700 hover:bg-neutral-600 flex items-center gap-2 w-max"
        target="_blank"
      >
        <Icon src={Eye} class="w-4 h-4" />
        Preview
      </a>
      <form
        method="post"
        action="?/delete"
        on:submit={(e) => {
          if (!confirm('Delete this product? It will be removed from the store.')) e.preventDefault();
        }}
        use:enhance={() => {
          isDeleting = true;
          return async ({ result }) => {
            isDeleting = false;
            if (result.type === 'success') {
              toast.push('Product deleted', { theme: toastThemes.success });
              await goto('/seller/products');
            } else {
              toast.push('Failed to delete product', { theme: toastThemes.error });
            }
          };
        }}
      >
        <button
          type="submit"
          class="btn !bg-red-600 hover:!bg-red-700 flex items-center gap-2 w-max"
          disabled={isDeleting}
        >
          {#if isDeleting}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Deleting...
          {:else}
            <Icon src={Trash2} class="w-4 h-4" />
            Delete
          {/if}
        </button>
      </form>
    </div>
  </div>

  <!-- Product Info Card -->
  <div class="card bg-gradient-to-r from-emerald-500/10 to-teal-600/10 border border-emerald-500/20">
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
        {data.product.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h3 class="font-semibold text-white">{data.product.name}</h3>
        <p class="text-sm text-neutral-400">Product ID: {data.product.id} • Category: {data.product.category?.name || 'Uncategorized'}</p>
      </div>
    </div>
  </div>

  <!-- Edit Form -->
  <form
    class="card"
    method="post"
    action="?/update"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ result }) => {
        isSubmitting = false;
        
        if (result.type === 'success') {
          toast.push('Product updated successfully!', {
            theme: toastThemes.success,
          });
        } else if (result.type === 'failure') {
          toast.push(result.data?.error || 'Failed to update product', {
            theme: toastThemes.error,
          });
        } else if (result.type === 'error') {
          toast.push(result.error?.message || 'An unexpected error occurred', {
            theme: toastThemes.error,
          });
        }
      };
    }}
  >
    <div class="space-y-6">
      <!-- Product Input Component -->
      <ProductInput categories={data.categories} product={data.product} />
      
      <!-- Action Buttons -->
      <div class="flex flex-col sm:flex-row gap-3 pt-6 border-t border-neutral-700">
        <button 
          type="submit" 
          class="btn flex items-center justify-center gap-2 flex-1 sm:flex-none sm:w-auto"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Saving...
          {:else}
            <Icon src={Save} class="w-4 h-4" />
            Save Changes
          {/if}
        </button>
        
        <button 
          type="button" 
          on:click={() => goto('/seller/products')}
          class="btn bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center gap-2"
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </div>
  </form>
</div>
