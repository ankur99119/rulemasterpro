// Rule Master Pro — Service Worker v2
const CACHE_NAME = 'rulemasterpro-v2';
const ASSETS = [
  '/rulemasterpro/',
  '/rulemasterpro/index.html',
  '/rulemasterpro/icon-192.png',
  '/rulemasterpro/icon-512.png',
  '/rulemasterpro/screenshot-1.png',
  '/rulemasterpro/screenshot-2.png',
  '/rulemasterpro/screenshot-3.png'
];

// Install — cache core assets
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate — clean old caches
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

// Fetch — cache first for app, network first for API
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Skip Supabase and Groq API calls — always network
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('groq.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Cache first strategy for app assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/rulemasterpro/index.html');
        }
      });
    })
  );
});

// Background sync for quiz progress
self.addEventListener('sync', function(event) {
  if (event.tag === 'quiz-sync') {
    console.log('Background sync: quiz progress');
  }
});

// Push notifications (future use)
self.addEventListener('push', function(event) {
  if (event.data) {
    self.registration.showNotification('Rule Master Pro', {
      body: event.data.text(),
      icon: '/rulemasterpro/icon-192.png'
    });
  }
});
