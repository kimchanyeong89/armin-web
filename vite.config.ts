import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Cesium plugin disabled (Cesium removed)

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so assets and public/ resolve under sub-paths and file://
  base: './',
  plugins: [react()],
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
