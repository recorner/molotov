<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import { fade } from 'svelte/transition';
  import QRCode from 'qrcode';
  import { buildPaymentUri, currencyName } from '$lib/nowpayments';
  import CurrencyPicker from '$lib/components/CurrencyPicker.svelte';

  const dispatch = createEventDispatcher();

  export let initialAmount = 50;

  type Stage = 'form' | 'creating' | 'pending' | 'confirmed' | 'failed';

  let stage: Stage = 'form';
  let amount: number = initialAmount;
  let currency = 'btc';
  let telegramUsername = '';
  let errorMsg = '';

  const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

  // --- currencies ---
  let currencies: string[] = [];
  let popular: string[] = [];
  let currenciesLoading = true;

  // --- active payment ---
  let payment: any = null;
  let status = 'waiting';
  let qr = '';
  let copied = '';
  let pollTimer: ReturnType<typeof setInterval>;
  let countdownTimer: ReturnType<typeof setInterval>;
  let secondsLeft = 0;

  const STATUS_LABEL: Record<string, string> = {
    waiting: 'Waiting for your payment',
    confirming: 'Confirming on-chain…',
    confirmed: 'Confirmed — finalizing…',
    sending: 'Finalizing…',
    partially_paid: 'Partially paid — send the remainder',
    finished: 'Payment received',
    failed: 'Payment failed',
    expired: 'Payment window expired',
    refunded: 'Payment refunded',
  };

  loadCurrencies();

  onDestroy(() => {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
  });

  async function loadCurrencies() {
    currenciesLoading = true;
    try {
      const res = await fetch('/api/payment');
      if (!res.ok) throw new Error();
      const data = await res.json();
      currencies = data.currencies || [];
      popular = data.popular || [];
      if (currencies.length && !currencies.includes(currency)) currency = currencies[0];
    } catch {
      errorMsg = 'Could not load payment methods. Please refresh and try again.';
    } finally {
      currenciesLoading = false;
    }
  }

  async function createPayment() {
    errorMsg = '';
    if (!amount || amount < 10) {
      errorMsg = 'Minimum deposit is $10.';
      return;
    }
    stage = 'creating';
    try {
      const res = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          telegramUsername: telegramUsername || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the payment.');

      payment = data.payment;
      status = payment.payment_status || 'waiting';

      // Show the payment details immediately; the QR is best-effort so a QR
      // failure never hides the address/amount the user actually needs.
      stage = 'pending';
      startCountdown();
      startPolling();

      generateQr();
    } catch (e: any) {
      errorMsg = e?.message || 'Something went wrong creating your payment.';
      stage = 'form';
    }
  }

  async function generateQr() {
    if (!payment?.pay_address) return;
    try {
      qr = await QRCode.toDataURL(
        buildPaymentUri(payment.pay_currency, payment.pay_address, payment.pay_amount),
        { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b3b34', light: '#ffffff' } }
      );
    } catch {
      qr = ''; // address + amount are still shown without the QR
    }
  }

  function startCountdown() {
    secondsLeft = 20 * 60; // 20-minute window
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1);
      if (secondsLeft === 0) clearInterval(countdownTimer);
    }, 1000);
  }

  function startPolling() {
    clearInterval(pollTimer);
    checkStatus();
    pollTimer = setInterval(checkStatus, 4000);
  }

  async function checkStatus() {
    if (!payment?.id) return;
    try {
      const res = await fetch(`/api/payment/status?id=${payment.id}`);
      const data = await res.json();
      if (res.ok && data.payment) {
        status = data.payment.status || status;
        if (data.payment.local_completed || status === 'finished' || status === 'confirmed') {
          stage = 'confirmed';
          clearInterval(pollTimer);
          clearInterval(countdownTimer);
          dispatch('paymentConfirmed');
        } else if (['failed', 'expired', 'refunded'].includes(status)) {
          stage = 'failed';
          clearInterval(pollTimer);
          clearInterval(countdownTimer);
        }
      }
    } catch {
      /* transient network error — keep polling silently */
    }
  }

  function copy(text: string, key: string) {
    if (!browser) return;
    navigator.clipboard.writeText(text).then(() => {
      copied = key;
      setTimeout(() => (copied = key === copied ? '' : copied), 1500);
    });
  }

  function reset() {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
    payment = null;
    qr = '';
    status = 'waiting';
    errorMsg = '';
    stage = 'form';
  }

  $: mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  $: isSuccessStatus = status === 'finished' || status === 'confirmed';
</script>

<div class="card h-max">
  <div class="flex items-center justify-between mb-1">
    <h2 class="font-montserrat font-bold text-lg tracking-tight">Add funds</h2>
    {#if stage !== 'form'}
      <button type="button" class="text-xs text-neutral-400 hover:text-neutral-200 transition" on:click={reset}>
        ← Start over
      </button>
    {/if}
  </div>
  <p class="text-sm text-neutral-400 mb-4">Top up your balance with 160+ cryptocurrencies. No account needed at the coin.</p>

  {#if errorMsg}
    <div class="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" transition:fade={{ duration: 150 }}>
      <span>⚠️</span><span>{errorMsg}</span>
    </div>
  {/if}

  {#if stage === 'form'}
    <!-- Amount -->
    <label for="dep-amount" class="block text-xs font-medium text-neutral-400 mb-1.5">Amount (USD)</label>
    <div class="input mb-2">
      <span class="text-neutral-400">$</span>
      <input
        id="dep-amount"
        type="number"
        min="10"
        step="1"
        bind:value={amount}
        class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none"
        placeholder="50"
      />
    </div>
    <div class="flex flex-wrap gap-2 mb-5">
      {#each QUICK_AMOUNTS as q}
        <button
          type="button"
          on:click={() => (amount = q)}
          class="px-3 py-1 rounded-full text-xs border transition {amount === q
            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
            : 'border-neutral-700 text-neutral-300 hover:border-neutral-600'}"
        >
          ${q}
        </button>
      {/each}
    </div>

    <!-- Currency picker (icons, searchable) -->
    <span class="block text-xs font-medium text-neutral-400 mb-1.5">Pay with</span>
    {#if currenciesLoading}
      <div class="input text-sm text-neutral-500">Loading coins…</div>
    {:else}
      <CurrencyPicker bind:value={currency} currencies={currencies} />
    {/if}

    <!-- Telegram (optional) -->
    <label for="dep-tg" class="block text-xs font-medium text-neutral-400 mt-5 mb-1.5">Telegram username <span class="text-neutral-600">(optional — for confirmation)</span></label>
    <div class="input mb-5">
      <span class="text-neutral-400">@</span>
      <input
        id="dep-tg"
        type="text"
        bind:value={telegramUsername}
        class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none"
        placeholder="yourname"
      />
    </div>

    <button type="button" class="btn" on:click={createPayment} disabled={currenciesLoading}>
      Continue to payment
    </button>

  {:else if stage === 'creating'}
    <div class="py-12 text-center">
      <div class="mx-auto mb-4 w-9 h-9 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin"></div>
      <p class="text-sm text-neutral-300">Generating a secure payment address…</p>
    </div>

  {:else if stage === 'pending' && payment}
    <!-- Status banner -->
    <div class="flex items-center gap-3 rounded-lg border border-emerald-600/25 bg-emerald-500/5 px-3 py-2.5 mb-4">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
      </span>
      <div class="flex-1">
        <p class="text-sm font-medium text-emerald-300">{STATUS_LABEL[status] || 'Waiting for your payment'}</p>
        <p class="text-[11px] text-neutral-400">We update automatically — you can leave this page open.</p>
      </div>
      <span class="text-sm font-mono tabular-nums {secondsLeft < 120 ? 'text-amber-400' : 'text-neutral-400'}">{mmss}</span>
    </div>

    <!-- QR -->
    {#if qr}
      <div class="flex justify-center mb-4">
        <div class="rounded-xl bg-white p-3 shadow-lg">
          <img src={qr} alt="Payment QR code" class="w-44 h-44 sm:w-52 sm:h-52" />
        </div>
      </div>
    {/if}

    <!-- Send exactly -->
    <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800 text-sm">
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <span class="text-neutral-400">Send exactly</span>
        <button type="button" class="group flex items-center gap-2 font-mono text-emerald-300 hover:text-emerald-200" on:click={() => copy(String(payment.pay_amount), 'amt')}>
          {payment.pay_amount} {payment.pay_currency?.toUpperCase()}
          <span class="text-[10px] text-neutral-500 group-hover:text-neutral-300">{copied === 'amt' ? 'copied' : 'copy'}</span>
        </button>
      </div>
      <div class="px-3 py-2.5">
        <div class="flex items-center justify-between mb-1">
          <span class="text-neutral-400">To this {currencyName(payment.pay_currency)} address</span>
          <button type="button" class="text-[10px] text-neutral-500 hover:text-neutral-300" on:click={() => copy(payment.pay_address, 'addr')}>
            {copied === 'addr' ? 'copied ✓' : 'copy'}
          </button>
        </div>
        <p class="font-mono text-xs text-neutral-200 break-all">{payment.pay_address}</p>
      </div>
      <div class="flex items-center justify-between px-3 py-2.5">
        <span class="text-neutral-400">You'll be credited</span>
        <span class="font-medium text-neutral-100">${payment.amount}</span>
      </div>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-neutral-500">
      Send the exact amount in one transaction. Sending a different amount or wrong coin may delay or
      forfeit the deposit. Your balance updates automatically once the network confirms.
    </p>

    <a href="/balance/history" class="mt-4 block text-center text-xs text-neutral-400 hover:text-neutral-200">View payment history →</a>

  {:else if stage === 'confirmed'}
    <div class="py-12 text-center" in:fade>
      <div class="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 text-3xl">✓</div>
      <p class="text-lg font-semibold text-emerald-300 mb-1">Payment received</p>
      <p class="text-sm text-neutral-400">Your balance has been updated.</p>
      <button type="button" class="btn mt-6 max-w-xs mx-auto" on:click={reset}>Make another deposit</button>
    </div>

  {:else if stage === 'failed'}
    <div class="py-12 text-center" in:fade>
      <div class="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-full bg-red-500/10 text-red-400 text-3xl">×</div>
      <p class="text-lg font-semibold text-red-300 mb-1">{STATUS_LABEL[status] || 'Payment failed'}</p>
      <p class="text-sm text-neutral-400 mb-6">No funds were deducted. You can try again with the same or a different coin.</p>
      <button type="button" class="btn max-w-xs mx-auto" on:click={reset}>Try again</button>
    </div>
  {/if}
</div>
