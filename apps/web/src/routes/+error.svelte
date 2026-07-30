<script lang="ts">
  import { page } from '$app/stores';
  import Logo from '$lib/logo.svg';

  $: status = $page.status;

  const COPY: Record<number, { title: string; body: string; icon: string }> = {
    400: { title: 'Bad request', body: 'Something about that request wasn’t quite right. Try again.', icon: '🙃' },
    401: { title: 'Sign in required', body: 'You need to be signed in to view this page.', icon: '🔑' },
    403: { title: 'No access', body: 'You don’t have permission to view this page.', icon: '🚫' },
    404: { title: 'Page not found', body: 'The page you’re looking for doesn’t exist or has moved.', icon: '🧭' },
    429: { title: 'Slow down', body: 'Too many requests in a short time. Please wait a moment and retry.', icon: '⏳' },
    500: { title: 'Something went wrong', body: 'An unexpected error occurred on our side. It’s been logged — please try again.', icon: '🛠️' },
    502: { title: 'Bad gateway', body: 'We had trouble reaching an upstream service. Please try again shortly.', icon: '🔌' },
    503: { title: 'Temporarily unavailable', body: 'We’re briefly unavailable, likely under maintenance. Please try again in a moment.', icon: '🧰' },
    504: { title: 'Timed out', body: 'That took too long to respond. Please try again.', icon: '⌛' },
  };

  $: info = COPY[status] ?? {
    title: 'Unexpected error',
    body: 'Something went wrong. Please try again or head back home.',
    icon: '⚠️',
  };
</script>

<svelte:head><title>{status} · {info.title} — Sereni</title></svelte:head>

<div class="min-h-screen grid place-items-center px-6 py-12 bg-neutral-950 relative overflow-hidden">
  <div class="absolute inset-0 opacity-40 pointer-events-none"
    style="background-image: radial-gradient(40rem 40rem at 80% -10%, rgba(45,212,191,0.10), transparent 60%), radial-gradient(36rem 36rem at -10% 110%, rgba(13,148,136,0.10), transparent 60%);"></div>

  <div class="relative text-center max-w-md">
    <a href="/" class="inline-flex items-center gap-2 mb-8 opacity-90">
      <img src={Logo} alt="Sereni" class="w-8 h-8" />
      <span class="font-montserrat font-bold tracking-tight text-lg">Sereni</span>
    </a>

    <div class="text-6xl mb-4">{info.icon}</div>
    <p class="text-7xl font-montserrat font-black tracking-tight bg-gradient-to-br from-emerald-300 to-teal-500 bg-clip-text text-transparent">{status}</p>
    <h1 class="text-2xl font-bold mt-2 mb-2">{info.title}</h1>
    <p class="text-neutral-400 mb-2">{info.body}</p>
    {#if $page.error?.message && $page.error.message !== info.title && status !== 500}
      <p class="text-sm text-neutral-500 mb-6">{$page.error.message}</p>
    {:else}
      <div class="mb-6"></div>
    {/if}

    <div class="flex items-center justify-center gap-3">
      <a href="/" class="btn !w-auto px-5">Go home</a>
      <button type="button" class="px-5 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-800 transition" on:click={() => history.back()}>Go back</button>
      {#if status === 401}
        <a href="/auth/login" class="px-5 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-800 transition">Sign in</a>
      {/if}
    </div>

    <p class="mt-8 text-xs text-neutral-600">Need an escrow? <a href="/escrow" class="text-emerald-400 hover:text-emerald-300">Start a deal →</a></p>
  </div>
</div>
