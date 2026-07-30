<script lang="ts">
  import { applyAction, enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import toastThemes from '$lib/toastThemes';
  import { toast } from '@zerodevx/svelte-toast';
  import ProductInput from '../ProductInput.svelte';
  import type { PageData } from './$types';
  import { Plus, ArrowLeft, Save } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';

  export let data: PageData;
  let isSubmitting = false;
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <button 
      on:click={() => goto('/seller/products')}
      class="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
    >
      <Icon src={ArrowLeft} class="w-5 h-5 text-neutral-400" />
    </button>
    <div>
      <h1 class="font-montserrat font-bold text-2xl tracking-tight text-white">Create new product</h1>
      <p class="text-neutral-400">Add a new product to your marketplace</p>
    </div>
  </div>

  <!-- Form -->
  <form
    class="card"
    method="post"
    action="?/publish"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ result }) => {
        isSubmitting = false;
        
        if (result.type === 'success') {
          toast.push('Product created successfully!', {
            theme: toastThemes.success,
          });
          // Redirect to product list after success
          await goto('/seller/products');
        } else if (result.type === 'failure') {
          toast.push(result.data?.error || 'Failed to create product', {
            theme: toastThemes.error,
          });
        } else if (result.type === 'error') {
          toast.push(result.error?.message || 'An unexpected error occurred', {
            theme: toastThemes.error,
          });
        }

        await applyAction(result);
      };
    }}
  >
    <div class="space-y-6">
      <!-- Product Input Component -->
      <ProductInput categories={data.categories} />
      
      <!-- Action Buttons -->
      <div class="flex flex-col sm:flex-row gap-3 pt-6 border-t border-neutral-700">
        <button 
          type="submit" 
          class="btn flex items-center justify-center gap-2 flex-1 sm:flex-none sm:w-auto"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Publishing...
          {:else}
            <Icon src={Save} class="w-4 h-4" />
            Publish Product
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

  <!-- Tips Section -->
  <div class="card bg-emerald-500/5 border border-emerald-500/20">
    <h3 class="font-semibold text-emerald-400 mb-3">💡 Tips for Success</h3>
    <ul class="space-y-2 text-sm text-neutral-300">
      <li class="flex items-start gap-2">
        <span class="text-emerald-400 mt-0.5">•</span>
        <span><strong>Clear naming:</strong> Use descriptive product names that customers can easily search for</span>
      </li>
      <li class="flex items-start gap-2">
        <span class="text-emerald-400 mt-0.5">•</span>
        <span><strong>Detailed descriptions:</strong> Include features, benefits, and what customers will receive</span>
      </li>
      <li class="flex items-start gap-2">
        <span class="text-emerald-400 mt-0.5">•</span>
        <span><strong>Proper categorization:</strong> Choose the most relevant category for better discoverability</span>
      </li>
      <li class="flex items-start gap-2">
        <span class="text-emerald-400 mt-0.5">•</span>
        <span><strong>Stock management:</strong> For licenses, ensure each line contains a valid, unique item</span>
      </li>
    </ul>
  </div>
</div>
