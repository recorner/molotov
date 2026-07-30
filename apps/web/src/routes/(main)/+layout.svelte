<script lang="ts">
  import Logo from '$lib/logo.svg';
  import AppIcon from '$lib/components/AppIcon.svelte';
  import QuickIcon from '$lib/components/QuickIcon.svelte';
  import CartDropdown from '$lib/components/CartDropdown.svelte';
  import NotificationBell from '$lib/components/NotificationBell.svelte';
  import { cart } from '$lib/stores/cart';
  import { page } from '$app/stores';
  import type { LayoutServerData } from './$types';
  import classnames from 'classnames';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  export let data: LayoutServerData;
  let mobileMenu = false;
  let isMobile = false;
  let userMenuOpen = false;

  // Admin-configured support link (Settings → telegram_support); falls back to none.
  $: supportUrl = (data as any).supportUrl || '';

  // Initialize cart from server data
  $: if (browser && data.cart) {
    cart.initFromServer(data.cart);
  }

  $: path = $page.url.pathname;
  const isActive = (href: string, exact = false) =>
    exact ? path === href : path === href || path.startsWith(href + '/');

  $: browser && localStorage.setItem('mobileMenu', JSON.stringify(mobileMenu));

  onMount(() => {
    isMobile = window.innerWidth < 768;
    mobileMenu = isMobile ? false : JSON.parse(localStorage.getItem('mobileMenu') || 'false');
  });

  function closeOnMobile() {
    if (isMobile) mobileMenu = false;
  }
</script>

<svelte:window
  on:resize={() => {
    isMobile = window.innerWidth < 768;
    if (!isMobile) {
      mobileMenu = JSON.parse(localStorage.getItem('mobileMenu') || 'false');
    }
  }}
/>

{#if !data.user}
  <!-- Public marketing shell (landing, escrow, BIN lookup) -->
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-neutral-800/80 sticky top-0 z-20 backdrop-blur bg-neutral-950/70">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <img src={Logo} alt="Sereni" class="w-7 h-7" />
          <span class="font-montserrat font-bold tracking-tight">Sereni</span>
        </a>
        <nav class="hidden sm:flex items-center gap-6 text-sm">
          <a href="/escrow" class="text-neutral-300 hover:text-emerald-300 transition" class:text-emerald-400={isActive('/escrow')}>Escrow</a>
          <a href="/bin" class="text-neutral-300 hover:text-emerald-300 transition" class:text-emerald-400={isActive('/bin')}>BIN lookup</a>
        </nav>
        <div class="flex items-center gap-3 text-sm">
          <a href="/auth/login" class="text-neutral-300 hover:text-emerald-300 transition">Sign in</a>
          <a href="/auth/register" class="btn !w-auto px-3 py-1.5">Get started</a>
        </div>
      </div>
    </header>
    <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-8"><slot /></main>
    <footer class="border-t border-neutral-800/80 mt-8">
      <div class="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-2 gap-4 items-center">
        <div class="flex items-center gap-2">
          <img src={Logo} alt="Sereni" class="w-6 h-6" />
          <span class="font-montserrat font-bold">Sereni</span>
          <span class="text-sm text-neutral-500 ml-2">Digital marketplace · escrow · tools</span>
        </div>
        <div class="flex sm:justify-end gap-5 text-sm text-neutral-400">
          <a href="/escrow" class="hover:text-emerald-300">Escrow</a>
          <a href="/bin" class="hover:text-emerald-300">BIN lookup</a>
          <a href="/auth/login" class="hover:text-emerald-300">Sign in</a>
        </div>
      </div>
      <div class="max-w-6xl mx-auto px-4 pb-6 text-xs text-neutral-600">© Sereni — funds held safely until both sides are satisfied.</div>
    </footer>
  </div>
{:else}

<!-- Mobile menu overlay -->
{#if isMobile && mobileMenu}
  <div
    class="fixed inset-0 bg-black/60 z-30"
    role="button"
    tabindex="0"
    on:click={() => (mobileMenu = false)}
    on:keydown={(e) => e.key === 'Escape' && (mobileMenu = false)}
  ></div>
{/if}

<aside
  class={classnames(
    'fixed h-screen left-0 px-3 py-5 bg-neutral-900 border-r border-neutral-800 z-40 overflow-y-auto transition-transform duration-300',
    {
      'w-64': !mobileMenu || (mobileMenu && isMobile),
      'w-20': mobileMenu && !isMobile,
      mobile: mobileMenu,
      '-translate-x-full': isMobile && !mobileMenu,
      'translate-x-0': !isMobile || mobileMenu,
    }
  )}
>
  <a href="/" class="brand flex items-center gap-2.5 px-2 mb-6" on:click={closeOnMobile}>
    <img src={Logo} alt="Sereni" class="w-8 h-8 shrink-0" />
    <span class="brand-name text-lg font-montserrat font-bold tracking-tight">Sereni</span>
  </a>

  <nav class="grid gap-0.5 pb-4">
    <a href="/" class="link" class:active={isActive('/', true)} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:home-rounded" className="icon" />
      <span>Home</span>
    </a>
    <a href="/orders" class="link" class:active={isActive('/orders')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:package-2" className="icon" />
      <span>Orders</span>
    </a>
    <a href="/cart" class="link" class:active={isActive('/cart')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:shopping-cart" className="icon" />
      <span>Cart</span>
    </a>
    <a href="/balance" class="link" class:active={isActive('/balance')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:account-balance-wallet" className="icon" />
      <span>Balance</span>
    </a>
    <a href="/escrow" class="link" class:active={isActive('/escrow')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:handshake-outline" className="icon" />
      <span>Escrow</span>
    </a>
    <a href="/chat" class="link" class:active={isActive('/chat')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:chat-bubble-outline" className="icon" />
      <span>Chat</span>
    </a>
    <a href="/bin" class="link" class:active={isActive('/bin')} on:click={closeOnMobile}>
      <QuickIcon icon="material-symbols:credit-card-outline" className="icon" />
      <span>BIN lookup</span>
    </a>

    <div class="divider"><span>Categories</span></div>
    {#each data.categories as category}
      <a
        href={`/category/${category.id}`}
        class="link"
        class:active={isActive(`/category/${category.id}`)}
        on:click={closeOnMobile}
      >
        {#if category.image}
          <img src={category.image} alt="" class="icon rounded" />
        {:else}
          <AppIcon name="category-outline" class="icon" />
        {/if}
        <span>{category.name}</span>
      </a>
    {:else}
      <span class="px-3 py-2 text-sm text-neutral-500 label">No categories yet</span>
    {/each}

    {#if data.user.role.includes('SELLER')}
      <div class="divider"><span>Seller</span></div>
      <a href="/seller/dashboard" class="link" class:active={isActive('/seller/dashboard')} on:click={closeOnMobile}>
        <AppIcon name="dashboard-outline" class="icon" />
        <span>Dashboard</span>
      </a>
      <a href="/seller/products" class="link" class:active={isActive('/seller/products')} on:click={closeOnMobile}>
        <AppIcon name="inventory-2-outline" class="icon" />
        <span>Products</span>
      </a>
    {/if}

    {#if data.user.role.includes('ADMIN')}
      <div class="divider"><span>Admin</span></div>
      <a href="/admin/users" class="link" class:active={isActive('/admin/users')} on:click={closeOnMobile}>
        <AppIcon name="group-outline" class="icon" />
        <span>Users</span>
      </a>
      <a href="/admin/escrows" class="link" class:active={isActive('/admin/escrows')} on:click={closeOnMobile}>
        <AppIcon name="handshake-outline" class="icon" />
        <span>Escrows</span>
      </a>
      <a href="/admin/chat" class="link" class:active={isActive('/admin/chat')} on:click={closeOnMobile}>
        <AppIcon name="forum-outline" class="icon" />
        <span>Channels</span>
      </a>
      <a href="/admin/deposits" class="link" class:active={isActive('/admin/deposits')} on:click={closeOnMobile}>
        <AppIcon name="receipt-long-outline" class="icon" />
        <span>Deposits</span>
      </a>
      <a href="/admin/payouts" class="link" class:active={isActive('/admin/payouts')} on:click={closeOnMobile}>
        <AppIcon name="payments-outline" class="icon" />
        <span>Payouts</span>
      </a>
      <a href="/admin/settings" class="link" class:active={isActive('/admin/settings')} on:click={closeOnMobile}>
        <AppIcon name="settings-outline" class="icon" />
        <span>Settings</span>
      </a>
    {/if}
  </nav>
</aside>

<div
  class={classnames('min-h-screen transition-all duration-300', {
    'md:pl-64': !mobileMenu && !isMobile,
    'md:pl-20': mobileMenu && !isMobile,
    'pl-0': isMobile,
  })}
>
  <!-- Top bar -->
  <header class="topbar sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="grid place-items-center w-9 h-9 rounded-lg hover:bg-neutral-800 transition"
        on:click={() => (mobileMenu = !mobileMenu)}
        aria-label="Toggle menu"
      >
        <QuickIcon icon="material-symbols:menu-rounded" className="icon text-neutral-300" />
      </button>
    </div>

    <div class="flex gap-1.5 items-center min-w-0">
      {#if supportUrl}
        <a
          href={supportUrl}
          target="_blank"
          rel="noreferrer"
          class="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg text-neutral-300 hover:bg-neutral-800 transition"
          title="Contact support"
        >
          <AppIcon name="telegram" class="w-4 h-4 text-sky-400" />
          <span class="hidden lg:inline">Support</span>
        </a>
      {/if}

      <a
        href="/balance"
        class="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 transition"
        title="Your balance"
      >
        <AppIcon name="account-balance-wallet-outline" class="w-4 h-4 text-emerald-400" />
        <span class="font-medium tabular-nums">${data.user.balance.toFixed(2)}</span>
      </a>

      <CartDropdown />

      <NotificationBell notifications={data.notifications ?? []} unreadCount={data.unreadCount ?? 0} />

      <div class="relative min-w-0">
        <button
          type="button"
          on:click={() => (userMenuOpen = !userMenuOpen)}
          class="flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg hover:bg-neutral-800 transition min-w-0 {userMenuOpen ? 'bg-neutral-800' : ''}"
          aria-expanded={userMenuOpen}
        >
          {#if data.user.avatar}
            <img src={data.user.avatar} alt="" class="w-7 h-7 rounded-full object-cover shrink-0" />
          {:else}
            <span class="grid place-items-center w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold shrink-0">
              {data.user.username.slice(0, 1).toUpperCase()}
            </span>
          {/if}
          <span class="truncate max-w-20 lg:max-w-32" title={data.user.username}>{data.user.username}</span>
        </button>
        {#if userMenuOpen}
          <button class="fixed inset-0 z-20 cursor-default" aria-label="Close menu" on:click={() => (userMenuOpen = false)}></button>
          <div class="absolute z-30 top-12 right-0 w-52 bg-neutral-900 border border-neutral-800 shadow-xl rounded-xl p-1.5">
            <div class="px-3 py-2 text-xs text-neutral-500 truncate border-b border-neutral-800 mb-1" title={data.user.username}>
              Signed in as <span class="text-neutral-300">{data.user.username}</span>
            </div>
            <a href="/account" class="menu-item" on:click={() => (userMenuOpen = false)}>
              <AppIcon name="settings-outline" class="w-4 h-4" /> Account settings
            </a>
            <a href="/balance/history" class="menu-item" on:click={() => (userMenuOpen = false)}>
              <AppIcon name="history" class="w-4 h-4" /> Payment history
            </a>
            {#if supportUrl}
              <a href={supportUrl} target="_blank" rel="noreferrer" class="menu-item" on:click={() => (userMenuOpen = false)}>
                <AppIcon name="telegram" class="w-4 h-4" /> Support
              </a>
            {/if}
            <a href="/auth/logout" class="menu-item text-red-400 hover:bg-red-500/10">
              <AppIcon name="logout" class="w-4 h-4" /> Log out
            </a>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="p-3 sm:p-5 max-w-7xl mx-auto w-full">
    <slot />
  </div>
</div>
{/if}

<style>
  .link {
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: rgb(212 212 212);
    position: relative;
    transition: background-color 0.15s, color 0.15s;
  }

  .link:hover {
    background-color: rgb(38 38 38);
    color: rgb(245 245 245);
  }

  .link.active {
    background-color: rgba(16, 185, 129, 0.12);
    color: rgb(110 231 183);
  }

  .link.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 60%;
    width: 3px;
    background: linear-gradient(to bottom, #2dd4bf, #0d9488);
    border-radius: 0 3px 3px 0;
  }

  .divider {
    padding: 0.75rem 0.75rem 0.25rem;
  }
  .divider > span {
    font-size: 0.6875rem;
    color: rgb(115 115 115);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: rgb(212 212 212);
    transition: background-color 0.15s;
  }
  .menu-item:hover {
    background-color: rgb(38 38 38);
  }

  :global(.icon) {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }

  .topbar {
    background-color: rgba(10, 10, 10, 0.7);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgb(38 38 38);
  }

  /* Collapsed desktop sidebar (w-20): hide text labels, center icons */
  .mobile.w-20 .brand-name,
  .mobile.w-20 .divider > span,
  .mobile.w-20 .label,
  .mobile.w-20 nav a > span {
    display: none;
  }
  .mobile.w-20 .brand {
    justify-content: center;
  }
  :global(.mobile.w-20 nav a) {
    justify-content: center;
  }

  /* On mobile the menu is full width (w-64) — always show labels */
  @media (max-width: 768px) {
    .mobile.w-64 .brand-name,
    .mobile.w-64 .divider > span,
    .mobile.w-64 nav a > span {
      display: inline;
    }
  }
</style>
