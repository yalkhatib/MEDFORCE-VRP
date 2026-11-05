import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@medforce/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
});
