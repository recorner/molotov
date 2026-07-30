<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';

  let configStatus = {
    configured: false,
    botToken: false,
    adminChat: false,
    adminGroup: false
  };

  let loading = false;

  onMount(async () => {
    await loadConfigStatus();
  });

  async function loadConfigStatus() {
    loading = true;
    try {
      const response = await fetch('/api/admin/telegram-status');
      if (response.ok) {
        const data = await response.json();
        configStatus = data.status;
      } else {
        toast.push('Failed to load Telegram configuration status', { theme: toastThemes.error });
      }
    } catch (error) {
      console.error('Failed to load status:', error);
      toast.push('Failed to load configuration status', { theme: toastThemes.error });
    } finally {
      loading = false;
    }
  }

  async function testNotification() {
    try {
      const response = await fetch('/api/admin/telegram-test', {
        method: 'POST'
      });

      if (response.ok) {
        toast.push('Test notification sent! Check your Telegram.', { theme: toastThemes.success });
      } else {
        const error = await response.json();
        toast.push(error.error || 'Failed to send test notification', { theme: toastThemes.error });
      }
    } catch (error) {
      console.error('Failed to send test:', error);
      toast.push('Failed to send test notification', { theme: toastThemes.error });
    }
  }
</script>

<svelte:head>
  <title>Telegram Configuration - Admin Panel</title>
</svelte:head>

<div class="container mx-auto p-6 max-w-4xl">
  <!-- Header -->
  <div class="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg p-6 text-white mb-6">
    <h1 class="font-montserrat font-bold text-3xl tracking-tight mb-2">Telegram Notifications</h1>
    <p class="text-emerald-100">Monitor automatic payment notifications via Telegram bot</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center p-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      <span class="ml-3 text-gray-300">Loading configuration status...</span>
    </div>
  {:else}
    <div class="grid gap-6">
      <!-- Configuration Status -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">Configuration Status</h2>
        
        <div class="space-y-4">
          <!-- Overall Status -->
          <div class="flex items-center gap-3">
            <div class={`w-4 h-4 rounded-full ${configStatus.configured ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span class="text-lg font-medium {configStatus.configured ? 'text-green-400' : 'text-red-400'}">
              {configStatus.configured ? '✅ Fully Configured' : '❌ Needs Configuration'}
            </span>
          </div>

          <!-- Individual Components -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div class="bg-gray-700 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class={`w-3 h-3 rounded-full ${configStatus.botToken ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <h3 class="font-semibold text-white">Bot Token</h3>
              </div>
              <p class="text-sm text-gray-300">
                {configStatus.botToken ? 'Configured' : 'Not set'}
              </p>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class={`w-3 h-3 rounded-full ${configStatus.adminChat ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <h3 class="font-semibold text-white">Admin Chat</h3>
              </div>
              <p class="text-sm text-gray-300">
                {configStatus.adminChat ? 'Configured' : 'Not set'}
              </p>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class={`w-3 h-3 rounded-full ${configStatus.adminGroup ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <h3 class="font-semibold text-white">Admin Group</h3>
              </div>
              <p class="text-sm text-gray-300">
                {configStatus.adminGroup ? 'Configured' : 'Optional'}
              </p>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-4 mt-6">
          <button
            on:click={loadConfigStatus}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            🔄 Refresh Status
          </button>

          <button
            on:click={testNotification}
            disabled={!configStatus.configured}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            📨 Send Test Message
          </button>
        </div>
      </div>

      <!-- Configuration Instructions -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">Environment Configuration</h2>
        
        <div class="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 mb-4">
          <p class="text-yellow-200 text-sm">
            ⚠️ Telegram bot configuration is managed via environment variables in the .env file.
            Changes require a restart of the bot service.
          </p>
        </div>

        <div class="space-y-4 text-gray-300">
          <div>
            <h3 class="font-semibold text-emerald-400 mb-2">Required Environment Variables</h3>
            <div class="bg-gray-900 rounded-lg p-4 font-mono text-sm">
              <div class="space-y-1">
                <div class="flex justify-between">
                  <span class="text-gray-400">TELEGRAM_BOT_TOKEN=</span>
                  <span class={configStatus.botToken ? 'text-green-400' : 'text-red-400'}>
                    {configStatus.botToken ? '✅ Set' : '❌ Missing'}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">TELEGRAM_ADMIN_CHAT_ID=</span>
                  <span class={configStatus.adminChat ? 'text-green-400' : 'text-red-400'}>
                    {configStatus.adminChat ? '✅ Set' : '❌ Missing'}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">TELEGRAM_ADMIN_GROUP_ID=</span>
                  <span class={configStatus.adminGroup ? 'text-green-400' : 'text-amber-400'}>
                    {configStatus.adminGroup ? '✅ Set' : '⚠️ Optional'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Notification Examples -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">Notification Examples</h2>
        
        <div class="space-y-4">
          <!-- Payment Created -->
          <div class="bg-gray-700 rounded-lg p-4">
            <h3 class="font-semibold text-emerald-400 mb-2">💰 Payment Created</h3>
            <div class="text-sm text-gray-300 font-mono whitespace-pre-line">💰 New Payment Created

👤 User: johndoe
💵 Amount: $50.00
🪙 Currency: BTC
🆔 Payment ID: 12345678
📱 Telegram: @johndoe

⏳ Waiting for payment confirmation...</div>
          </div>

          <!-- Payment Confirmed -->
          <div class="bg-gray-700 rounded-lg p-4">
            <h3 class="font-semibold text-green-400 mb-2">✅ Payment Confirmed</h3>
            <div class="text-sm text-gray-300 font-mono whitespace-pre-line">✅ Payment Confirmed!

👤 User: johndoe
💰 Amount: $50.00
🪙 Currency: BTC
🆔 Payment ID: 12345678
💳 New Balance: $150.00

🎉 Balance updated successfully!</div>
          </div>
        </div>
      </div>

      <!-- Setup Instructions -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">Setup Instructions</h2>
        
        <div class="space-y-4 text-gray-300">
          <div>
            <h3 class="font-semibold text-emerald-400 mb-2">1. Create Telegram Bot</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Message @BotFather on Telegram</li>
              <li>Send /newbot and follow instructions</li>
              <li>Copy the bot token to your .env file</li>
            </ul>
          </div>

          <div>
            <h3 class="font-semibold text-emerald-400 mb-2">2. Get Your Chat ID</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Message @userinfobot to get your chat ID</li>
              <li>Or start your bot and check the logs</li>
              <li>Add your chat ID to the .env file</li>
            </ul>
          </div>

          <div>
            <h3 class="font-semibold text-emerald-400 mb-2">3. Setup Group (Optional)</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Add your bot to a Telegram group</li>
              <li>Make the bot an admin (or allow it to send messages)</li>
              <li>Get the group ID (starts with -) and add to .env</li>
            </ul>
          </div>

          <div>
            <h3 class="font-semibold text-emerald-400 mb-2">4. Restart Services</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Update your .env file with the configuration</li>
              <li>Restart the bot service: <code class="bg-gray-700 px-1 rounded">docker-compose restart telegram-bot</code></li>
              <li>Check this page to verify the configuration</li>
              <li>Send a test message to confirm it works</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
