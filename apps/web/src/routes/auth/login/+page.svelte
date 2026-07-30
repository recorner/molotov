<script lang="ts">
  import { User, Lock, Hash, Eye, EyeOff } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { ActionData } from './$types';

  export let form: ActionData;

  let isLoading = false;
  let showPassword = false;
</script>

<svelte:head><title>Sign in - Sereni</title></svelte:head>

{#if form?.error == '2fa' || form?.error == 'code'}
  <h2 class="text-2xl font-montserrat font-bold mb-1">Two-factor authentication</h2>
  <p class="text-sm text-neutral-400 mb-6">Enter the 6-digit code from your authenticator app.</p>

  <form
    class="space-y-4"
    method="post"
    action="?/twofactor"
    use:enhance={() => {
      isLoading = true;
      return async ({ result, update }) => {
        isLoading = false;
        if (result.type === 'redirect') goto(result.location);
        else await update();
      };
    }}
  >
    <div>
      <label for="code" class="block text-sm font-medium text-neutral-300 mb-1.5">One-time code</label>
      <div class="input">
        <Icon src={Hash} class="w-5 h-5 text-neutral-400" />
        <input
          id="code"
          class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm tracking-[0.3em] focus:outline-none"
          placeholder="000000"
          name="code"
          type="text"
          inputmode="numeric"
          minlength="6"
          maxlength="6"
          required
          autocomplete="one-time-code"
          disabled={isLoading}
        />
      </div>
      {#if form?.error === 'code'}<span class="error mt-1">Invalid code, try again.</span>{/if}
    </div>

    <button type="submit" class="btn relative" disabled={isLoading}>
      {#if isLoading}
        <span class="absolute inset-0 grid place-items-center">
          <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        </span>
        <span class="opacity-0">Continue</span>
      {:else}Continue{/if}
    </button>
  </form>
{:else}
  <h2 class="text-2xl font-montserrat font-bold mb-1">Welcome back</h2>
  <p class="text-sm text-neutral-400 mb-6">Sign in to your Sereni account.</p>

  <form
    class="space-y-4"
    method="post"
    action="?/login"
    use:enhance={() => {
      isLoading = true;
      return async ({ result, update }) => {
        isLoading = false;
        if (result.type === 'redirect') goto(result.location);
        else await update();
      };
    }}
  >
    <input type="hidden" name="redirect" value={$page.url.searchParams.get('redirect') ?? ''} />
    <div>
      <label for="username" class="block text-sm font-medium text-neutral-300 mb-1.5">Username</label>
      <div class="input">
        <Icon src={User} class="w-5 h-5 text-neutral-400" />
        <input
          id="username"
          class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none"
          placeholder="yourname"
          name="username"
          pattern={'[a-zA-Z0-9_]{3,16}'}
          required
          autocomplete="username"
          disabled={isLoading}
        />
      </div>
    </div>

    <div>
      <label for="password" class="block text-sm font-medium text-neutral-300 mb-1.5">Password</label>
      <div class="input">
        <Icon src={Lock} class="w-5 h-5 text-neutral-400" />
        <input
          id="password"
          class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none"
          placeholder="••••••••"
          name="password"
          type={showPassword ? 'text' : 'password'}
          minlength="6"
          required
          autocomplete="current-password"
          disabled={isLoading}
        />
        <button type="button" class="text-neutral-400 hover:text-neutral-200" on:click={() => (showPassword = !showPassword)} tabindex="-1" aria-label="Toggle password visibility">
          <Icon src={showPassword ? EyeOff : Eye} class="w-4 h-4" />
        </button>
      </div>
    </div>

    {#if form?.error === 'credentials'}
      <span class="error">Incorrect username or password.</span>
    {/if}

    <button type="submit" class="btn relative" disabled={isLoading}>
      {#if isLoading}
        <span class="absolute inset-0 grid place-items-center">
          <span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
        </span>
        <span class="opacity-0">Sign in</span>
      {:else}Sign in{/if}
    </button>
  </form>

  <p class="text-center text-sm text-neutral-400 mt-6">
    Don't have an account?
    <a href="/auth/register" class="text-emerald-400 hover:text-emerald-300 font-medium">Create one</a>
  </p>
  <p class="text-center text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-800">
    Just need to escrow with someone?
    <a href="/escrow" class="text-emerald-400 hover:text-emerald-300">Start a deal without an account →</a>
  </p>
{/if}
