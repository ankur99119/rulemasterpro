// Rule Master Pro — Service Worker v4
const CACHE_NAME = 'rulemasterpro-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/viewer.html',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('groq.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Network-first for page navigations (HTML) so a freshly deployed
  // index.html is always picked up when online; fall back to cache offline.
  var accept = event.request.headers.get('accept') || '';
  if (event.request.mode === 'navigate' ||
      (event.request.method === 'GET' && accept.includes('text/html'))) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Cache-first for other static assets, with background refresh.
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (event.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
