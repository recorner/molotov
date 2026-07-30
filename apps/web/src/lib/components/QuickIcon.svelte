<script lang="ts">
  // Thin alias kept for backwards compatibility — delegates to the centralized
  // inline AppIcon so nav icons render instantly with no emoji/async load flash.
  import AppIcon from '$lib/components/AppIcon.svelte';

  export let icon: string;
  export let className: string = 'w-4 h-4';
</script>

<AppIcon name={icon} class={className} />
