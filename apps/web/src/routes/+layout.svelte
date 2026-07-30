<script>
  import '../app.postcss';
  import { SvelteToast } from '@zerodevx/svelte-toast';
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600;700&display=swap"
    rel="stylesheet"
  />
  <slot name="title">
    <title>Sereni</title>
  </slot>
  <meta name="description" content="Sereni — a calm, trusted marketplace for digital products and services." />
  <meta property="og:title" content="Sereni" />
  <meta property="og:description" content="A calm, trusted marketplace for digital products and services." />
  <meta property="og:type" content="website" />
  <meta name="theme-color" content="#0f766e" />
</svelte:head>

<SvelteToast />

<slot />
