<script lang="ts">
  export let type: 'card' | 'list' | 'text' | 'avatar' = 'card';
  export let width = 'w-full';
  export let height = 'h-48';
  export let className = '';
  export let count = 1;
  export let animate = true;
</script>

{#if type === 'card'}
  {#each Array(count) as _, i}
    <div class="bg-neutral-850 border border-neutral-700 rounded-lg p-4 {className}">
      <div class="animate-pulse space-y-3">
        <!-- Header -->
        <div class="h-4 bg-neutral-700 rounded {width}"></div>
        <div class="h-3 bg-neutral-700 rounded w-3/4"></div>
        
        <!-- Content area -->
        <div class="space-y-2 py-2">
          <div class="h-2 bg-neutral-700 rounded w-full"></div>
          <div class="h-2 bg-neutral-700 rounded w-5/6"></div>
          <div class="h-2 bg-neutral-700 rounded w-4/6"></div>
        </div>
        
        <!-- Footer -->
        <div class="flex justify-between items-center pt-2">
          <div class="h-6 bg-neutral-700 rounded w-16"></div>
          <div class="h-8 bg-neutral-700 rounded w-20"></div>
        </div>
      </div>
    </div>
  {/each}

{:else if type === 'list'}
  {#each Array(count) as _, i}
    <div class="bg-neutral-850 border border-neutral-700 rounded-lg p-4 flex items-center gap-4 {className}">
      <div class="animate-pulse flex items-center gap-4 w-full">
        <!-- Avatar/Icon placeholder -->
        <div class="w-12 h-12 bg-neutral-700 rounded-lg flex-shrink-0"></div>
        
        <!-- Content -->
        <div class="flex-1 space-y-2">
          <div class="h-4 bg-neutral-700 rounded w-3/4"></div>
          <div class="h-3 bg-neutral-700 rounded w-1/2"></div>
        </div>
        
        <!-- Action area -->
        <div class="flex gap-2">
          <div class="w-16 h-8 bg-neutral-700 rounded"></div>
          <div class="w-8 h-8 bg-neutral-700 rounded"></div>
        </div>
      </div>
    </div>
  {/each}

{:else if type === 'text'}
  {#each Array(count) as _, i}
    <div class="animate-pulse space-y-2 {className}">
      <div class="h-4 bg-neutral-700 rounded {width}"></div>
      <div class="h-3 bg-neutral-700 rounded w-5/6"></div>
      <div class="h-3 bg-neutral-700 rounded w-4/6"></div>
    </div>
  {/each}

{:else if type === 'avatar'}
  {#each Array(count) as _, i}
    <div class="animate-pulse flex items-center gap-3 {className}">
      <div class="w-10 h-10 bg-neutral-700 rounded-full flex-shrink-0"></div>
      <div class="space-y-1 flex-1">
        <div class="h-3 bg-neutral-700 rounded w-3/4"></div>
        <div class="h-2 bg-neutral-700 rounded w-1/2"></div>
      </div>
    </div>
  {/each}
{/if}

<style>
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
