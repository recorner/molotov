<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { Copy, Download, Check, Eye, EyeOff, Lock } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { goto } from '$app/navigation';

  let md2faCodes: string[] = [];
  let username = '';
  let copied = false;
  let codesVisible = false;
  let currentStep = 1;
  let isGenerating = true;
  let showCodes = false;

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const md2faCodesParam = urlParams.get('codes');
    const usernameParam = urlParams.get('username');
    
    if (md2faCodesParam) {
      // Add a realistic delay to show the generation animation
      setTimeout(() => {
        md2faCodes = md2faCodesParam.split(',').sort();
        username = usernameParam || '';
        isGenerating = false;
        // Add a small delay before showing the codes with animation
        setTimeout(() => {
          showCodes = true;
        }, 300);
      }, 2000);
    } else {
      // If no codes, redirect to registration
      goto('/auth/register');
    }
  });

  const copyCodes = async () => {
    const concatenatedCodes = md2faCodes.join('\n');
    try {
      await navigator.clipboard.writeText(concatenatedCodes);
      copied = true;
      toast.push('Recovery codes copied to clipboard!', { theme: toastThemes.success });
      setTimeout(() => { copied = false; }, 2000);
    } catch (err) {
      toast.push('Failed to copy codes', { theme: toastThemes.error });
    }
  };

  const downloadCodes = () => {
    const content = `Security Recovery Codes for ${username}\n\nGenerated on: ${new Date().toLocaleString()}\n\nCodes:\n${md2faCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nIMPORTANT:\n- Store these codes securely\n- Each code can only be used once\n- You will need them to access your account`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}_recovery_codes.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.push('Recovery codes downloaded!', { theme: toastThemes.success });
  };

  const proceedToLogin = () => {
    goto('/auth/login');
  };
</script>

<svelte:head>
  <title>Save Your Recovery Codes</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-neutral-900 to-neutral-800">
  <div class="w-full max-w-2xl">
    <div class="text-center mb-8">
      <h1 class="font-montserrat font-bold text-3xl tracking-tight text-white mb-2">Account created</h1>
      <p class="text-neutral-400">Welcome, <span class="text-emerald-400 font-semibold">{username}</span></p>
    </div>

    <div class="bg-neutral-900 rounded-xl p-8 shadow-2xl border border-neutral-800">
      {#if isGenerating}
        <!-- Generation Animation -->
        <div class="text-center py-12">
          <div class="relative mb-6">
            <div class="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-500"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-8 h-8 bg-emerald-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Generating Security Codes</h2>
          <p class="text-neutral-400 mb-4">Creating your recovery codes for account security...</p>
          <div class="mt-6 flex justify-center space-x-2">
            <div class="w-3 h-3 bg-emerald-500 rounded-full animate-bounce"></div>
            <div class="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
            <div class="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
          </div>
          <div class="mt-6 bg-neutral-800 rounded-lg p-4">
            <div class="text-sm text-neutral-400 space-y-2">
              <div class="flex items-center justify-center gap-2">
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span>Generating cryptographic keys...</span>
              </div>
              <div class="flex items-center justify-center gap-2">
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" style="animation-delay: 0.5s"></div>
                <span>Creating secure backup codes...</span>
              </div>
              <div class="flex items-center justify-center gap-2">
                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" style="animation-delay: 1s"></div>
                <span>Finalizing account setup...</span>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <!-- Recovery Codes Display with fade-in animation -->
        <div class="space-y-6 {showCodes ? 'animate-fade-in' : 'opacity-0'}">
          <div class="text-center">
            <h2 class="font-montserrat font-bold text-2xl tracking-tight text-white mb-2">Save your recovery codes</h2>
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
              <p class="text-amber-200 text-sm">
                <strong>Secure by design:</strong> your recovery codes are generated and ready to save.
                Copy or download them without displaying them on screen for maximum security.
              </p>
            </div>
          </div>

          <!-- Codes Container -->
          <div class="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
            <div class="p-4 border-b border-neutral-700 flex items-center justify-between">
              <h3 class="font-semibold text-white">Your recovery codes</h3>
              <div class="flex items-center gap-2 text-sm text-emerald-400">
                <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span>Ready to save</span>
              </div>
            </div>
            
            <div class="p-4">
              <div class="text-center py-8 bg-neutral-900 rounded border-2 border-dashed border-neutral-600">
                <div class="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon src={Lock} class="w-8 h-8 text-white" />
                </div>
                <h4 class="text-white font-semibold mb-2">Codes Generated Securely</h4>
                <p class="text-neutral-400 text-sm mb-4">Your {md2faCodes.length} recovery codes are ready</p>
                <p class="text-neutral-500 text-xs">Click Copy or Download to save them safely</p>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              on:click={copyCodes}
              class="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
            >
              <Icon src={copied ? Check : Copy} class="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Codes'}
            </button>
            
            <button
              on:click={downloadCodes}
              class="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
            >
              <Icon src={Download} class="w-4 h-4" />
              Download Codes
            </button>
          </div>

          <!-- Security Checklist -->
          <div class="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2">
              <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
              Security Reminder
            </h4>
            <div class="space-y-3 text-sm text-neutral-300">
              <div class="flex items-start gap-3">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span>These codes are automatically secured and ready to use</span>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span>You can copy or download them without revealing them on screen</span>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span>Store them in a secure location like a password manager</span>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span>Each code can only be used once for account recovery</span>
              </div>
            </div>
          </div>

          <!-- Continue Button -->
          <button
            on:click={proceedToLogin}
            class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
          >
            Continue to Login
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(-25%);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: translateY(0);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
  }
  
  .animate-bounce {
    animation: bounce 1s infinite;
  }

  @keyframes fadeIn {
    from { 
      opacity: 0; 
      transform: translateY(20px);
    }
    to { 
      opacity: 1; 
      transform: translateY(0);
    }
  }
  
  .animate-fade-in {
    animation: fadeIn 0.6s ease-out forwards;
  }
</style>
