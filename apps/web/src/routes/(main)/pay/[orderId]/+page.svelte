<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { invalidateAll } from '$app/navigation';
  import QRCode from 'qrcode';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { CheckCircle, Clock, XCircle } from '@steeze-ui/feather-icons';
  import Select from '$lib/components/Select.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let paymentForm = {
    amount: 50,
    currency: 'btc',
    telegramUsername: ''
  };

  let availableCurrencies: string[] = [];
  let currentPayment: any = null;
  let paymentStatus = 'idle'; // idle, creating, pending, confirmed, failed
  let qrCodeDataUrl = '';
  let statusCheckInterval: ReturnType<typeof setInterval>;
  let showPaymentDetails = false;
  
  // Real-time status checking
  let statusCheckCount = 0;
  const MAX_STATUS_CHECKS = 120; // 10 minutes (5s intervals)

  onMount(async () => {
    await loadCurrencies();
  });

  $: if (availableCurrencies.length > 0 && !paymentForm.currency) {
    paymentForm.currency = availableCurrencies[0];
  }

  onDestroy(() => {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
    }
  });

  async function loadCurrencies() {
    try {
      const response = await fetch('/api/payment');
      if (response.ok) {
        const data = await response.json();
        availableCurrencies = data.currencies || [];
        // Set default currency if none selected
        if (availableCurrencies.length > 0 && !paymentForm.currency) {
          paymentForm.currency = availableCurrencies[0];
        }
      }
    } catch (error) {
      console.error('Failed to load currencies:', error);
      toast.push('Failed to load payment methods', { theme: toastThemes.error });
    }
  }

  async function createPayment() {
    if (paymentStatus === 'creating') return;
    
    paymentStatus = 'creating';
    
    try {
      const response = await fetch('/api/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: paymentForm.amount,
          currency: paymentForm.currency,
          telegramUsername: paymentForm.telegramUsername || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Payment creation failed');
      }

      currentPayment = result.payment;
      paymentStatus = 'pending';
      showPaymentDetails = true;
      
      // Generate QR code
      if (currentPayment.pay_address) {
        qrCodeDataUrl = await QRCode.toDataURL(
          `${paymentForm.currency}:${currentPayment.pay_address}?amount=${currentPayment.pay_amount}`,
          { width: 200, margin: 1 }
        );
      }

      // Start status checking
      startStatusChecking();
      
      toast.push('Payment created successfully', { theme: toastThemes.success });
    } catch (error) {
      console.error('Payment creation error:', error);
      toast.push(error.message || 'Failed to create payment', { theme: toastThemes.error });
      paymentStatus = 'idle';
    }
  }

  function startStatusChecking() {
    statusCheckCount = 0;
    statusCheckInterval = setInterval(async () => {
      await checkPaymentStatus();
      statusCheckCount++;
      
      if (statusCheckCount >= MAX_STATUS_CHECKS) {
        clearInterval(statusCheckInterval);
        toast.push('Payment status check timeout', { theme: toastThemes.warning });
      }
    }, 5000);
  }

  async function checkPaymentStatus() {
    if (!currentPayment?.id) return;

    try {
      const response = await fetch(`/api/payment/status?id=${currentPayment.id}`);
      const result = await response.json();

      if (response.ok && result.payment) {
        const payment = result.payment;
        
        if (payment.status === 'confirmed' || payment.local_completed) {
          paymentStatus = 'confirmed';
          clearInterval(statusCheckInterval);
          
          toast.push('Payment confirmed! Your balance has been updated.', { 
            theme: toastThemes.success 
          });
          
          // Refresh the page data to update balance
          await invalidateAll();
          
        } else if (['failed', 'expired', 'refunded'].includes(payment.status)) {
          paymentStatus = 'failed';
          clearInterval(statusCheckInterval);
          
          toast.push(`Payment ${payment.status}`, { theme: toastThemes.error });
        }
        
        // Update current payment with latest data
        currentPayment = { ...currentPayment, ...payment };
      }
    } catch (error) {
      console.error('Status check error:', error);
    }
  }

  function resetPayment() {
    currentPayment = null;
    paymentStatus = 'idle';
    showPaymentDetails = false;
    qrCodeDataUrl = '';
    statusCheckCount = 0;
    
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
    }
  }

  function copyToClipboard(text: string) {
    if (browser) {
      navigator.clipboard.writeText(text).then(() => {
        toast.push('Copied to clipboard', { theme: toastThemes.success });
      });
    }
  }

  function formatCurrency(currency: string): string {
    return currency.toUpperCase();
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'confirmed': return 'text-green-400';
      case 'pending': case 'waiting': return 'text-yellow-400';
      case 'failed': case 'expired': case 'refunded': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'confirmed': return '✅';
      case 'pending': case 'waiting': return '⏳';
      case 'failed': case 'expired': case 'refunded': return '❌';
      default: return '⏱️';
    }
  }
</script>

<svelte:head>
  <title>Payment - {data.orderId}</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-4">
  <div class="mb-6 flex justify-between items-center">
    <div>
      <h1 class="font-montserrat font-bold text-2xl tracking-tight text-white mb-2">Crypto payment</h1>
      <p class="text-neutral-400">Secure in-app cryptocurrency payment processing</p>
    </div>
    <div class="flex space-x-2">
      <a 
        href="/balance/history" 
        class="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
      >
        📋 Payment History
      </a>
      <a 
        href="/balance" 
        class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
      >
        ← Back to Balance
      </a>
    </div>
  </div>

  <div class="grid lg:grid-cols-2 gap-4 sm:gap-6">
    <!-- Payment Form -->
    <div class="card">
      <h2 class="text-lg sm:text-xl font-semibold mb-4">Create Payment</h2>
      
      {#if paymentStatus === 'idle'}
        <div class="space-y-4">
          <div>
            <label for="amount" class="block text-sm font-medium text-gray-300 mb-2">Amount (USD)</label>
            <input
              id="amount"
              type="number"
              min="10"
              max="100000"
              step="0.01"
              bind:value={paymentForm.amount}
              class="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Enter amount"
            />
            <p class="text-xs text-gray-400 mt-1">Minimum: $10, Maximum: $100,000</p>
          </div>

          <div>
            <label for="currency" class="block text-sm font-medium text-gray-300 mb-2">Cryptocurrency</label>
            <Select
              id="currency"
              bind:value={paymentForm.currency}
              searchable
              placeholder="Select currency"
              disabled={availableCurrencies.length === 0}
              options={availableCurrencies.map((c) => ({ value: c, label: formatCurrency(c) }))}
            />
            {#if availableCurrencies.length === 0}
              <p class="text-xs text-gray-400 mt-1">Loading currencies...</p>
            {/if}
          </div>

          <div>
            <label for="telegram" class="block text-sm font-medium text-gray-300 mb-2">
              Telegram Username (Optional)
            </label>
            <input
              id="telegram"
              type="text"
              bind:value={paymentForm.telegramUsername}
              class="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="@yourusername"
            />
            <p class="text-xs text-gray-400 mt-1">
              📱 Get notified on Telegram when your payment is confirmed
            </p>
          </div>

          <button
            type="button"
            on:click={createPayment}
            disabled={!paymentForm.amount || paymentForm.amount < 10 || availableCurrencies.length === 0}
            class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {availableCurrencies.length === 0 ? 'Loading...' : 'Create Payment'}
          </button>
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="flex justify-center mb-3">
            {#if paymentStatus === 'confirmed'}
              <Icon src={CheckCircle} class="w-12 h-12 text-emerald-400" />
            {:else if paymentStatus === 'failed' || paymentStatus === 'expired' || paymentStatus === 'refunded'}
              <Icon src={XCircle} class="w-12 h-12 text-red-400" />
            {:else}
              <Icon src={Clock} class="w-12 h-12 text-amber-400 animate-pulse" />
            {/if}
          </div>
          <p class="text-lg font-medium {getStatusColor(paymentStatus)}">
            {paymentStatus === 'creating' ? 'Creating payment...' : 
             paymentStatus === 'pending' ? 'Waiting for payment...' :
             paymentStatus === 'confirmed' ? 'Payment confirmed!' :
             paymentStatus === 'failed' ? 'Payment failed' : 'Processing...'}
          </p>
          
          {#if paymentStatus === 'confirmed' || paymentStatus === 'failed'}
            <button
              type="button"
              on:click={resetPayment}
              class="mt-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Create New Payment
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Payment Details -->
    {#if showPaymentDetails && currentPayment}
      <div class="card">
        <h2 class="text-xl font-semibold mb-4">Payment Details</h2>
        
        <div class="space-y-4">
          <div class="bg-gray-800 p-4 rounded-lg">
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm text-gray-400">Status</span>
              <span class="font-medium {getStatusColor(currentPayment.status || 'waiting')}">
                {getStatusIcon(currentPayment.status || 'waiting')}
                {(currentPayment.status || 'waiting').toUpperCase()}
              </span>
            </div>
            
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm text-gray-400">Amount</span>
              <span class="font-medium">
                {currentPayment.pay_amount} {formatCurrency(currentPayment.pay_currency)}
              </span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-400">USD Value</span>
              <span class="font-medium">${currentPayment.amount}</span>
            </div>
          </div>

          {#if currentPayment.pay_address}
            <div class="bg-gray-800 p-4 rounded-lg">
              <h3 class="font-semibold mb-3">Payment Address</h3>
              
              {#if qrCodeDataUrl}
                <div class="text-center mb-4">
                  <img src={qrCodeDataUrl} alt="Payment QR Code" class="mx-auto" />
                </div>
              {/if}
              
              <div class="bg-gray-900 p-3 rounded border break-all text-sm">
                {currentPayment.pay_address}
              </div>
              
              <button
                type="button"
                on:click={() => copyToClipboard(currentPayment.pay_address)}
                class="mt-2 w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Copy Address
              </button>
            </div>
          {/if}

          {#if paymentStatus === 'pending'}
            <div class="bg-yellow-900/20 border border-yellow-600 p-4 rounded-lg">
              <h4 class="font-semibold text-yellow-400 mb-2">Instructions</h4>
              <ol class="text-sm text-yellow-200 space-y-1">
                <li>1. Send exactly <strong>{currentPayment.pay_amount} {formatCurrency(currentPayment.pay_currency)}</strong></li>
                <li>2. To the address above</li>
                <li>3. Wait for network confirmation</li>
                <li>4. Your balance will update automatically</li>
              </ol>
              <div class="mt-3 pt-3 border-t border-yellow-600">
                <p class="text-xs text-yellow-300">
                  💡 <strong>You can safely leave this page and check payment status later via:</strong><br>
                  • Balance → Payment History<br>
                  • We'll keep monitoring your payment in the background
                  {#if paymentForm.telegramUsername}
                    <br>• Telegram notifications to @{paymentForm.telegramUsername.replace(/^@/, '')}
                  {/if}
                </p>
              </div>
            </div>

            <!-- Navigation Options -->
            <div class="flex space-x-2">
              <a
                href="/balance/history"
                class="flex-1 text-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                📋 View Payment History
              </a>
              <a
                href="/balance"
                class="flex-1 text-center bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                ← Back to Balance
              </a>
            </div>
          {/if}

          <div class="text-xs text-gray-400">
            <p>Payment ID: {currentPayment.id}</p>
            <p>Status checks: {statusCheckCount}/{MAX_STATUS_CHECKS}</p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Recent Transactions -->
  <div class="mt-8 card">
    <h2 class="text-xl font-semibold mb-4">Security Information</h2>
    <div class="grid md:grid-cols-2 gap-4 text-sm">
      <div class="space-y-2">
        <h3 class="font-semibold text-emerald-400 flex items-center gap-1.5"><Icon src={CheckCircle} class="w-4 h-4" /> Secure features</h3>
        <ul class="text-neutral-300 space-y-1">
          <li>• HTTPS encryption</li>
          <li>• No external redirects</li>
          <li>• Real-time status updates</li>
          <li>• HMAC signature verification</li>
        </ul>
      </div>
      <div class="space-y-2">
        <h3 class="font-semibold text-sky-400">Payment info</h3>
        <ul class="text-neutral-300 space-y-1">
          <li>• Payments are processed via NowPayments</li>
          <li>• Status updates every 5 seconds</li>
          <li>• Balance updates automatically</li>
          <li>• Support for 160+ cryptocurrencies</li>
        </ul>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    background-color: rgb(17 24 39);
    border: 1px solid rgb(55 65 81);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
</style>
