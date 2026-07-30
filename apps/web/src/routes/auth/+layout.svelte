<script lang="ts">
  import Logo from '$lib/logo.svg';
</script>

<div class="grid lg:grid-cols-[1fr_1.1fr] min-h-screen">
  <!-- Form side -->
  <div class="flex flex-col justify-center px-6 py-10 sm:px-10">
    <div class="w-full max-w-sm mx-auto">
      <a href="/" class="flex items-center gap-2.5 mb-8">
        <img src={Logo} alt="Sereni" class="w-8 h-8" />
        <span class="text-xl font-montserrat font-bold tracking-tight">Sereni</span>
      </a>
      <slot />
    </div>
  </div>

  <!-- Brand side -->
  <div class="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white">
    <div class="absolute inset-0 bg-gradient-to-br from-emerald-600 via-teal-700 to-neutral-950"></div>
    <div
      class="absolute inset-0 opacity-30"
      style="background-image: radial-gradient(40rem 40rem at 80% 10%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(30rem 30rem at 10% 90%, rgba(13,148,136,0.5), transparent 60%);"
    ></div>

    <div class="relative">
      <img src={Logo} alt="" class="w-12 h-12 mb-6 drop-shadow" />
      <h2 class="text-3xl font-montserrat font-bold leading-tight max-w-sm">
        A calmer way to buy &amp; sell digital goods and services.
      </h2>
    </div>

    <ul class="relative space-y-4 max-w-sm">
      {#each [['🔒', 'Secure by default', '2FA, hashed credentials, and crypto payments.'], ['⚡', 'Instant delivery', 'Digital products and services delivered the moment you pay.'], ['🪙', '160+ cryptocurrencies', 'Top up your balance with the coin you already hold.']] as [icon, title, body]}
        <li class="flex items-start gap-3">
          <span class="grid place-items-center w-9 h-9 rounded-lg bg-white/15 text-lg shrink-0">{icon}</span>
          <div>
            <p class="font-semibold">{title}</p>
            <p class="text-sm text-white/70">{body}</p>
          </div>
        </li>
      {/each}
    </ul>

    <p class="relative text-sm text-white/50">© Sereni</p>
  </div>
</div>
