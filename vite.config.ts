import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  root: 'apps/web',
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PORT ?? 3001}`,
      '/ws': { target: `ws://127.0.0.1:${process.env.PORT ?? 3001}`, ws: true },
    },
  },
});
