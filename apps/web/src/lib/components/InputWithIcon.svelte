<script lang="ts">
  import { Icon } from '@steeze-ui/svelte-icon';
  import type { IconSource } from '@steeze-ui/svelte-icon';
  import classnames from 'classnames';

  export let icon: IconSource;
</script>

<div class="input">
  {#if icon}
    <Icon src={icon} class="w-5 h-5 text-neutral-400" />
  {/if}
  <input
    {...$$props}
    class={classnames('w-full bg-transparent text-neutral-100 placeholder:text-neutral-400 text-sm', $$props.class)}
  />
</div>
