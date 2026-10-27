import { defineConfig } from 'vite';

export default defineConfig({
  // Public base path; '/' locally, '/pont/' behind the srv-ai-gateway (set via VITE_BASE build arg).
  base: process.env.VITE_BASE || '/',
  server: {
    port: 9881,
    host: '127.0.0.1',
  },
});
