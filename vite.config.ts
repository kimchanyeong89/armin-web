import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Cesium plugin disabled (Cesium removed)

// Large files are served from R2 and removed from dist after build
// See scripts/postbuild-cleanup.cjs

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so assets and public/ resolve under sub-paths and file://
  base: './',
  plugins: [react()],
  // Exclude large files from public folder copy (they're served from R2)
  publicDir: 'public',
  build: {
    rollupOptions: {
      // Don't copy large files to dist
    },
  },
  server: {
    proxy: {
      // Proxy GeoBoundaries to avoid browser CORS in dev
      '/geoboundaries': {
        target: 'https://www.geoboundaries.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/geoboundaries/, ''),
      },
      // Proxy GitHub raw content (for gbOpen download URLs)
      '/ghraw': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ghraw\/?/, '/'),
      },
    },
  },
})
