import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSearchText } from './scripts/vite-local-search'
// Cesium plugin disabled (Cesium removed)

// Large files are served from R2 and removed from dist after build
// See scripts/postbuild-cleanup.cjs

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so assets and public/ resolve under sub-paths and file://
  base: '/',

  // localSearchText: 개발 서버에서 색인 로딩 전 검색 후보를 로컬 데이터로 답한다(POST /__search-text).
  // 프로덕션 D1 은 지난 배포 시점 데이터라, 로컬에서 고친 게 처음 목록에 안 보였다.
  plugins: [react(), localSearchText(path.dirname(fileURLToPath(import.meta.url)))],
  // Exclude large files from public folder copy (they're served from R2)
  publicDir: 'public',
  build: {
    rollupOptions: {
      // Don't copy large files to dist
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    watch: {
      // public/data는 1.5GB JSON — HMR watch 대상에서 제외 (CPU 절약)
      ignored: [
        '**/public/data/**',
        '**/embedding_results/**',
        '**/siglip_processed_ids.txt',
        '**/siglip_state.json',
        '**/EMBEDDING_PROGRESS.md',
        '**/logs/**',
        '**/workers/semantic-search/.local-search.sqlite*',
      ],
    },
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
