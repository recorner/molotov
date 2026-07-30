<script lang="ts">
  // Delegates to the centralized inline AppIcon (no async load / fallback flash).
  import AppIcon from '$lib/components/AppIcon.svelte';

  export let icon: string;
  export let className: string = '';
</script>

<AppIcon name={icon} class={className} />
