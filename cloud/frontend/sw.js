const CACHE = 'jarvis-public-v1';
const PUBLIC = ['/style.css','/workspace.css','/features.css','/cloud.css','/app.js','/workspace.js','/features.js','/platform.js','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest','/offline.html'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('jarvis-public-') && key !== CACHE).map(key => caches.delete(key))))); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.headers.has('Authorization') || url.pathname.startsWith('/api/')) return;
  if (PUBLIC.includes(url.pathname) && !url.search) event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; }).catch(() => caches.match(event.request)));
  else if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
