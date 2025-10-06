// Basic service worker for image runtime caching & stale-while-revalidate
const VERSION = 'v1';
const IMG_EXT = /\.(?:png|jpg|jpeg|webp|avif)$/i;
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only runtime-cache external original images & proxy images
  if (IMG_EXT.test(url.pathname) || url.hostname.includes('firebasestorage.googleapis.com') || url.hostname.includes('images.weserv.nl')) {
    event.respondWith((async () => {
      const cache = await caches.open('images-' + VERSION);
      const match = await cache.match(req, { ignoreVary: true });
      const fetchPromise = fetch(req).then(res => {
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          cache.put(req, res.clone()).catch(()=>{});
        }
        return res;
      }).catch(() => match || Response.error());
      return match || fetchPromise;
    })());
  }
});
