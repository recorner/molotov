<script lang="ts">
  import { Icon } from '@steeze-ui/svelte-icon';
  import { MessageCircle } from '@steeze-ui/feather-icons';
</script>

<div class="flex-1 grid place-items-center text-center p-8">
  <div>
    <div class="w-16 h-16 rounded-2xl bg-neutral-800 grid place-items-center mx-auto mb-4">
      <Icon src={MessageCircle} class="w-7 h-7 text-neutral-500" />
    </div>
    <p class="font-semibold mb-1">Your messages</p>
    <p class="text-sm text-neutral-400 max-w-xs mx-auto">Select a chat, message a user, or browse channels. Messages are encrypted at rest.</p>
  </div>
</div>
