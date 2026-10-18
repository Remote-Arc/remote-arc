const CACHE_NAME = 'remote-arc-shell-v2';
const SHELL = ['/offline.html', '/remote-arc.svg', '/remote-arc-192.png', '/remote-arc-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('remote-arc-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never persist APIs, conversations, account data, OAuth or authenticated HTML.
  if (/^\/(?:api(?:\/|$)|auth(?:\/|$)|oauth(?:\/|$)|mcp(?:\/|$))/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }
  const asset = /^\/(?:assets|fonts|app-brands|platform-brands)\//.test(url.pathname) || /^\/remote-arc(?:-app-icon)?\.svg$/.test(url.pathname) || /^\/remote-arc-(?:180|192|512)\.png$/.test(url.pathname);
  if (!asset) return;
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(async response => {
      if (response.ok && response.type !== 'opaque' && !response.headers.get('cache-control')?.includes('no-store')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > 100) await cache.delete(keys.find(key => !SHELL.includes(new URL(key.url).pathname)) || keys[0]);
      }
      return response;
    });
  }));
});
