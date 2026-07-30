<script lang="ts">
  import { onMount } from 'svelte';
  import IconifyIcon from '@iconify/svelte';

  // List of icons to preload - these are the most commonly used ones
  const iconsToPreload = [
    'material-symbols:home',
    'material-symbols:package-2',
    'material-symbols:shopping-cart',
    'material-symbols:credit-card',
    'material-symbols:dashboard',
    'material-symbols:inventory-2',
    'material-symbols:upload',
    'material-symbols:group',
    'material-symbols:payments',
    'material-symbols:settings',
    'material-symbols:account-circle',
    'material-symbols:account-balance-wallet',
    'material-symbols:menu',
    'material-symbols:schedule',
    'ic:baseline-telegram'
  ];

  let preloadComplete = false;

  onMount(() => {
    // Preload icons by creating hidden elements
    const preloadContainer = document.createElement('div');
    preloadContainer.style.position = 'absolute';
    preloadContainer.style.left = '-9999px';
    preloadContainer.style.top = '-9999px';
    preloadContainer.style.visibility = 'hidden';
    preloadContainer.style.pointerEvents = 'none';
    document.body.appendChild(preloadContainer);

    // Create promises for each icon
    const preloadPromises = iconsToPreload.map(iconName => {
      return new Promise((resolve) => {
        const iconElement = document.createElement('div');
        iconElement.innerHTML = `<iconify-icon icon="${iconName}"></iconify-icon>`;
        preloadContainer.appendChild(iconElement);
        
        // Wait a bit for the icon to load
        setTimeout(() => {
          resolve(iconName);
        }, 100);
      });
    });

    // Wait for all icons to preload
    Promise.all(preloadPromises).then(() => {
      preloadComplete = true;
      console.log('Icons preloaded successfully');
      
      // Clean up the preload container after a delay
      setTimeout(() => {
        if (preloadContainer.parentNode) {
          preloadContainer.parentNode.removeChild(preloadContainer);
        }
      }, 1000);
    });
  });
</script>

<!-- Hidden preload elements -->
<div style="position: absolute; left: -9999px; top: -9999px; visibility: hidden; pointer-events: none;">
  {#each iconsToPreload as iconName}
    <IconifyIcon icon={iconName} />
  {/each}
</div>
