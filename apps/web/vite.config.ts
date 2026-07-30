import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		'import.meta.env.VITE_TELEGRAM_SUPPORT': JSON.stringify(process.env.TELEGRAM_SUPPORT_CONTACT || '@support'),
		'import.meta.env.VITE_ADMIN_USERNAME': JSON.stringify(process.env.ADMIN_USERNAME || 'admin')
	},
	optimizeDeps: {
		include: ['@iconify/svelte', '@iconify-json/material-symbols', '@iconify-json/ic']
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks: {
					icons: ['@iconify/svelte']
				}
			}
		}
	}
});
