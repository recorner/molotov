import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    // Deploy on Vercel using the Node.js serverless runtime
    // (argon2 / sharp / canvas need the Node runtime, not edge).
    adapter: adapter({
      runtime: 'nodejs22.x',
    }),
    csrf: {
      checkOrigin: false,
    },
  },
};

export default config;
