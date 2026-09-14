import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4173';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxyTarget,
      '/assets': apiProxyTarget,
      '/uploads': apiProxyTarget
    }
  },
  build: {
    outDir: 'dist/client'
  }
});
