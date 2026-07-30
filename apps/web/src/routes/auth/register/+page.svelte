<script lang="ts">
  import { User, Lock, Eye, EyeOff, Check, X, Send } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { enhance } from '$app/forms';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import type { ActionData } from './$types';

  export let form: ActionData;

  let isLoading = false;
  let showPassword = false;
  let username = '';
  let password = '';
  let confirmPassword = '';
  let telegram = '';

  // live validation
  $: usernameValid = /^[a-zA-Z0-9_]{3,16}$/.test(username);
  $: telegramClean = telegram.replace(/^@/, '');
  $: telegramValid = /^[a-zA-Z0-9_]{4,32}$/.test(telegramClean);
  $: pwRules = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  $: passwordValid = pwRules.length && pwRules.lower && pwRules.upper && pwRules.special;
  $: passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  $: pwStrength = Object.values(pwRules).filter(Boolean).length; // 0..4
  $: canSubmit = usernameValid && telegramValid && passwordValid && passwordsMatch && !isLoading;

  const strengthLabel = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColor = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500'];

  const serverErrors: Record<string, string> = {
    username: 'Username is invalid.',
    taken: 'That username is already taken.',
    telegram: 'Enter a valid Telegram handle (4–32 letters, numbers or _).',
    password: "Password doesn't meet the requirements.",
    confirmPassword: "Passwords don't match.",
    missing: 'Please fill in all required fields.',
    server: 'Something went wrong. Please try again.',
  };
</script>

<svelte:head><title>Create account · Sereni</title></svelte:head>

<h2 class="text-2xl font-montserrat font-bold tracking-tight mb-1">Create your account</h2>
<p class="text-sm text-neutral-400 mb-6">Join Sereni — it only takes a moment.</p>

<form
  class="space-y-4"
  method="post"
  action="?/register"
  use:enhance={() => {
    isLoading = true;
    return async ({ result, update }) => {
      isLoading = false;
      if (result.type === 'redirect') {
        toast.push('Welcome to Sereni!', { theme: toastThemes.success });
      } else if (result.type === 'failure') {
        toast.push(serverErrors[(result.data as any)?.error] || 'Could not create account.', { theme: toastThemes.error });
      }
      await update();
    };
  }}
>
  <!-- Username -->
  <div>
    <label for="username" class="block text-sm font-medium text-neutral-300 mb-1.5">Username</label>
    <div class="input">
      <Icon src={User} class="w-5 h-5 text-neutral-400" />
      <input id="username" class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none" placeholder="yourname" name="username" bind:value={username} required autocomplete="username" disabled={isLoading} />
      {#if username.length > 0}
        <Icon src={usernameValid ? Check : X} class="w-4 h-4 {usernameValid ? 'text-emerald-400' : 'text-red-400'}" />
      {/if}
    </div>
    {#if form?.error === 'username' || form?.error === 'taken'}
      <span class="error mt-1">{serverErrors[form.error]}</span>
    {:else}
      <p class="text-xs text-neutral-500 mt-1">3–16 characters · letters, numbers, underscores.</p>
    {/if}
  </div>

  <!-- Telegram (mandatory) -->
  <div>
    <label for="telegramUsername" class="block text-sm font-medium text-neutral-300 mb-1.5">Telegram handle</label>
    <div class="input">
      <Icon src={Send} class="w-5 h-5 text-neutral-400" />
      <span class="text-neutral-500 text-sm">@</span>
      <input id="telegramUsername" class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none" placeholder="yourhandle" name="telegramUsername" bind:value={telegram} required autocomplete="off" disabled={isLoading} />
      {#if telegram.length > 0}
        <Icon src={telegramValid ? Check : X} class="w-4 h-4 {telegramValid ? 'text-emerald-400' : 'text-red-400'}" />
      {/if}
    </div>
    {#if form?.error === 'telegram'}
      <span class="error mt-1">{serverErrors.telegram}</span>
    {:else}
      <p class="text-xs text-neutral-500 mt-1">Required — used for notifications and account recovery.</p>
    {/if}
  </div>

  <!-- Password -->
  <div>
    <label for="password" class="block text-sm font-medium text-neutral-300 mb-1.5">Password</label>
    <div class="input">
      <Icon src={Lock} class="w-5 h-5 text-neutral-400" />
      <input id="password" class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none" placeholder="Create a strong password" name="password" type={showPassword ? 'text' : 'password'} bind:value={password} required autocomplete="new-password" disabled={isLoading} />
      <button type="button" class="text-neutral-400 hover:text-neutral-200" on:click={() => (showPassword = !showPassword)} tabindex="-1" aria-label="Toggle password visibility">
        <Icon src={showPassword ? EyeOff : Eye} class="w-4 h-4" />
      </button>
    </div>

    {#if password.length > 0}
      <!-- strength meter -->
      <div class="flex gap-1 mt-2">
        {#each Array(4) as _, i}
          <div class="h-1 flex-1 rounded-full {i < pwStrength ? strengthColor[pwStrength] : 'bg-neutral-800'}"></div>
        {/each}
      </div>
      <p class="text-[11px] mt-1 text-neutral-400">{strengthLabel[pwStrength]}</p>
      <!-- rules checklist -->
      <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
        {#each [['length', '8+ characters'], ['lower', 'Lowercase letter'], ['upper', 'Uppercase letter'], ['special', 'Special character']] as [k, label]}
          <div class="flex items-center gap-1.5 text-[11px] {pwRules[k] ? 'text-emerald-400' : 'text-neutral-500'}">
            <Icon src={pwRules[k] ? Check : X} class="w-3 h-3 shrink-0" /> {label}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Confirm -->
  <div>
    <label for="confirmPassword" class="block text-sm font-medium text-neutral-300 mb-1.5">Confirm password</label>
    <div class="input">
      <Icon src={Lock} class="w-5 h-5 text-neutral-400" />
      <input id="confirmPassword" class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none" placeholder="Re-enter your password" name="confirmPassword" type={showPassword ? 'text' : 'password'} bind:value={confirmPassword} required autocomplete="new-password" disabled={isLoading} />
      {#if confirmPassword.length > 0}
        <Icon src={passwordsMatch ? Check : X} class="w-4 h-4 {passwordsMatch ? 'text-emerald-400' : 'text-red-400'}" />
      {/if}
    </div>
    {#if confirmPassword.length > 0 && !passwordsMatch}<span class="error mt-1">Passwords don't match.</span>{/if}
  </div>

  <button type="submit" class="btn relative" disabled={!canSubmit}>
    {#if isLoading}
      <span class="absolute inset-0 grid place-items-center"><span class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span></span>
      <span class="opacity-0">Create account</span>
    {:else}Create account{/if}
  </button>
</form>

<p class="text-center text-sm text-neutral-400 mt-6">
  Already have an account?
  <a href="/auth/login" class="text-emerald-400 hover:text-emerald-300 font-medium">Sign in</a>
</p>
