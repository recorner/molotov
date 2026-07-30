<script>
  import { Icon } from '@steeze-ui/svelte-icon';
  import { CheckCircle } from '@steeze-ui/feather-icons';
</script>

<svelte:head><title>Payment successful · Sereni</title></svelte:head>

<div class="max-w-md mx-auto card text-center py-12 mt-8">
  <div class="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 grid place-items-center mx-auto mb-4">
    <Icon src={CheckCircle} class="w-8 h-8 text-emerald-400" />
  </div>
  <h1 class="font-montserrat font-bold text-2xl tracking-tight mb-1">Payment successful</h1>
  <p class="text-sm text-neutral-400 mb-6">Your balance has been topped up.</p>
  <div class="flex gap-3 justify-center">
    <a href="/balance" class="btn !w-auto px-6">View balance</a>
    <a href="/" class="px-6 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition text-sm font-medium grid place-items-center">Home</a>
  </div>
</div>
