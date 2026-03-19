import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Cesium plugin disabled (Cesium removed)

// Large files are served from R2 and removed from dist after build
// See scripts/postbuild-cleanup.cjs

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so assets and public/ resolve under sub-paths and file://
  base: '/',

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
      '/githubraw': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/githubraw/, ''),
      },
      // Proxy Art Institute of Chicago IIIF to bypass CORS/Referer
      '/aic-image': {
        target: 'https://www.artic.edu/iiif/2',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/aic-image/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            // Browsers force Referer for localhost, stripping it helps avoid bot detection
            // Artic.edu allows requests with NO referer better than mismatched ones
            // Update: Some images now require correct Referer
            proxyReq.setHeader('Referer', 'https://www.artic.edu/');
            proxyReq.removeHeader('Origin');
            // Use a standard browser UA
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          });
        }
      },
      // Proxy Firebase Storage to bypass CORS in local development (upload)
      '/firebase-storage-proxy': {
        target: 'https://firebasestorage.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/firebase-storage-proxy/, ''),
      },
      // Proxy FAMSF images to bypass 403 Forbidden (requires specific Referer)
      '/famsf-image': {
        target: 'https://famsf.emuseum.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/famsf-image/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            // FAMSF fails if Referer is missing or localhost
            proxyReq.setHeader('Referer', 'https://www.famsf.org/');
            proxyReq.setHeader('Origin', 'https://www.famsf.org');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          });
        }
      },
      // Proxy MFAH images to bypass 403 Forbidden
      '/mfah-image': {
        target: 'https://emuseum.mfah.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/mfah-image/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Referer', 'https://emuseum.mfah.org/');
            proxyReq.setHeader('Origin', 'https://emuseum.mfah.org');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          });
        }
      },
      '/ghraw': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ghraw\/?/, '/'),
      },
    },
  },
})
