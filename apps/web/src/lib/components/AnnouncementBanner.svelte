<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { X, AlertCircle, Info, CheckCircle, AlertTriangle } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { slide, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let announcements: Array<{
    id: number;
    title: string;
    body: string;
    createdAt: string;
    poster: { username: string };
    type?: 'info' | 'warning' | 'success' | 'error';
    dismissible?: boolean;
  }> = [];

  export let maxVisible = 3;
  export let autoRotate = true;
  export let rotateInterval = 8000;
  export let showTimestamp = true;

  // Store for dismissed announcements
  const dismissedStore = writable<number[]>([]);
  let dismissed: number[] = [];
  let currentIndex = 0;
  let rotateTimer: number;

  // Subscribe to dismissed store
  dismissedStore.subscribe(value => dismissed = value);

  // Load dismissed announcements from localStorage
  onMount(() => {
    const stored = localStorage.getItem('dismissed-announcements');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        dismissedStore.set(parsed);
      } catch (e) {
        console.warn('Failed to parse dismissed announcements');
      }
    }

    if (autoRotate && visibleAnnouncements.length > 1) {
      startRotation();
    }

    return () => {
      if (rotateTimer) clearInterval(rotateTimer);
    };
  });

  // Filter out dismissed announcements
  $: visibleAnnouncements = announcements
    .filter(a => !dismissed.includes(a.id))
    .slice(0, maxVisible);

  $: currentAnnouncement = visibleAnnouncements[currentIndex] || null;

  function dismissAnnouncement(id: number) {
    const newDismissed = [...dismissed, id];
    dismissedStore.set(newDismissed);
    localStorage.setItem('dismissed-announcements', JSON.stringify(newDismissed));
    
    // Adjust current index if needed
    if (currentIndex >= visibleAnnouncements.length - 1) {
      currentIndex = 0;
    }
  }

  function startRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = setInterval(() => {
      if (visibleAnnouncements.length > 1) {
        currentIndex = (currentIndex + 1) % visibleAnnouncements.length;
      }
    }, rotateInterval);
  }

  function stopRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
  }

  function getIcon(type: string = 'info') {
    switch (type) {
      case 'warning': return AlertTriangle;
      case 'error': return AlertCircle;
      case 'success': return CheckCircle;
      default: return Info;
    }
  }

  function getTypeClasses(type: string = 'info') {
    switch (type) {
      case 'warning': return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200';
      case 'error': return 'bg-red-500/10 border-red-500/30 text-red-200';
      case 'success': return 'bg-green-500/10 border-green-500/30 text-green-200';
      default: return 'bg-emerald-600/10 border-emerald-500/30 text-emerald-200';
    }
  }

  function getIconColor(type: string = 'info') {
    switch (type) {
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      default: return 'text-emerald-400';
    }
  }

  // Navigation functions
  function goToNext() {
    if (visibleAnnouncements.length > 1) {
      currentIndex = (currentIndex + 1) % visibleAnnouncements.length;
    }
  }

  function goToPrevious() {
    if (visibleAnnouncements.length > 1) {
      currentIndex = currentIndex === 0 ? visibleAnnouncements.length - 1 : currentIndex - 1;
    }
  }
</script>

{#if currentAnnouncement}
  <div 
    class="border rounded-lg p-4 mb-6 {getTypeClasses(currentAnnouncement.type)}"
    role="banner"
    on:mouseenter={stopRotation}
    on:mouseleave={() => autoRotate && startRotation()}
    in:slide={{ duration: 300, easing: quintOut }}
    out:slide={{ duration: 200, easing: quintOut }}
  >
    <div class="flex items-start gap-3">
      <!-- Icon -->
      <div class="flex-shrink-0 mt-0.5">
        <Icon 
          src={getIcon(currentAnnouncement.type)} 
          class="w-5 h-5 {getIconColor(currentAnnouncement.type)}" 
        />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="font-semibold text-white leading-tight">
            {currentAnnouncement.title}
          </h3>
          
          <!-- Navigation & Dismiss -->
          <div class="flex items-center gap-1 flex-shrink-0">
            <!-- Navigation dots -->
            {#if visibleAnnouncements.length > 1}
              <div class="flex gap-1 mr-2">
                {#each visibleAnnouncements as _, index}
                  <button
                    on:click={() => currentIndex = index}
                    class="w-2 h-2 rounded-full transition-colors {index === currentIndex ? 'bg-white' : 'bg-white/30'}"
                    aria-label="Go to announcement {index + 1}"
                  ></button>
                {/each}
              </div>
            {/if}

            <!-- Dismiss button -->
            {#if currentAnnouncement.dismissible !== false}
              <button
                on:click={() => dismissAnnouncement(currentAnnouncement.id)}
                class="p-1 hover:bg-white/10 rounded transition-colors"
                aria-label="Dismiss announcement"
              >
                <Icon src={X} class="w-4 h-4 text-white/60 hover:text-white" />
              </button>
            {/if}
          </div>
        </div>

        <!-- Body -->
        <p class="text-sm leading-relaxed mb-2">
          {currentAnnouncement.body}
        </p>

        <!-- Footer -->
        <div class="flex items-center justify-between text-xs opacity-75">
          <span>
            Posted by {currentAnnouncement.poster.username}
          </span>
          
          {#if showTimestamp}
            <span>
              {new Date(currentAnnouncement.createdAt).toLocaleString('en-GB', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Progress bar for auto-rotation -->
    {#if autoRotate && visibleAnnouncements.length > 1}
      <div class="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
        <div 
          class="h-full bg-white/30 rounded-full animate-progress"
          style="animation-duration: {rotateInterval}ms;"
        ></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes progress {
    from {
      width: 0%;
    }
    to {
      width: 100%;
    }
  }

  .animate-progress {
    animation: progress linear infinite;
  }
</style>
