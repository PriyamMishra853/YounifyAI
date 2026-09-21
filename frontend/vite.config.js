import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The API runs on :8787 (Phase 2). Same-origin in dev keeps cookies simple.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1600 },
})
