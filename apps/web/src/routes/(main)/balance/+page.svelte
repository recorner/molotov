<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import CryptoDeposit from '$lib/components/CryptoDeposit.svelte';
  import toastThemes from '$lib/toastThemes';
  import { DollarSign, User } from '@steeze-ui/feather-icons';
  import { toast } from '@zerodevx/svelte-toast';
  import type { PageData } from './$types';

  export let data: PageData;

  function onPaymentConfirmed() {
    toast.push('Balance updated', { theme: toastThemes.success });
    invalidateAll();
  }
</script>

<svelte:head>
  <title>Balance - Sereni</title>
</svelte:head>

<!-- Balance summary -->
<div class="card mb-4 flex items-center justify-between">
  <div>
    <p class="text-xs text-neutral-500">Available balance</p>
    <p class="font-montserrat font-bold text-3xl tabular-nums text-emerald-400">${data.user.balance.toFixed(2)}</p>
  </div>
  <a href="/balance/history" class="text-sm text-neutral-400 hover:text-emerald-300 transition">History →</a>
</div>

<div class="grid md:grid-cols-2 gap-4 items-start">
  <!-- In-page crypto deposit -->
  <CryptoDeposit initialAmount={50} on:paymentConfirmed={onPaymentConfirmed} />

  <!-- Transfer -->
  <form
    action="?/transfer"
    method="post"
    class="card h-max"
    use:enhance={({ formElement }) =>
      async ({ result }) => {
        if (result.type == 'success') {
          toast.push('Transfer successful', { theme: toastThemes.success });
          formElement.reset();
          await invalidateAll();
        } else if (result.type == 'error') {
          toast.push(result.error.message, { theme: toastThemes.error });
        } else if (result.type == 'failure') {
          const errorMessages = {
            amount: 'Insufficient funds',
            user: 'Invalid username',
          };
          toast.push(
            errorMessages[result.data.error as keyof typeof errorMessages] || 'An error occurred',
            { theme: toastThemes.error }
          );
        }
      }}
  >
    <h2 class="font-bold text-lg mb-1">Transfer</h2>
    <p class="text-sm mb-4 text-neutral-400">Send balance to another Sereni user instantly.</p>
    <div class="space-y-2">
      <InputWithIcon icon={User} placeholder="Username" type="text" name="username" />
      <InputWithIcon
        icon={DollarSign}
        placeholder="Amount"
        type="number"
        name="amount"
        min={1}
        max={data.user.balance}
      />
      <button type="submit" class="btn">Transfer</button>
    </div>
  </form>
</div>
