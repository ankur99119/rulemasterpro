/* Rule Master Pro — service worker
 *
 * Bump SHELL_VERSION whenever index.html changes.
 * Bump DATA_VERSION only when a file under data/ changes.
 *
 * They are separate on purpose. The manual data is ~8MB; previously it lived
 * inside index.html, so editing one line of CSS forced every user to re-download
 * all of it. Now a shell update re-fetches ~700KB and leaves the data cache alone.
 */
const SHELL_VERSION = 'shell-v12';
const DATA_VERSION  = 'data-v9';

const SHELL_CACHE = 'rmp-' + SHELL_VERSION;
const DATA_CACHE  = 'rmp-' + DATA_VERSION;
const ASSET_CACHE = 'rmp-assets-v1';   // runtime cache for PDFs and images

// NOTE: the icons live at the repo root, not in an icons/ folder. The previous
// service worker precached './icons/icon-192.png', which 404s. Because it used
// cache.addAll(), that single missing file rejected the whole install, so the
// worker never activated and offline mode never worked. Paths corrected here,
// and the shell is cached file-by-file below so one bad URL can't do it again.
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './pdf-page-viewer.html',
  './figures.js',
  './tables.js',
  './reader.js',
  './home.js',
  './hindi.js',
  './read.js'
];

const DATA_ASSETS = [
  './data/gsr.js',
  './data/gsr_app.js',
  './data/om.js',
  './data/bwm.js',
  './data/acc.js',
  './data/ira.js',
  './data/irsem.js',
  './data/irpwm.js',
  './data/mcq.js',
  './data/figures-gsr.js',
  './data/figures-om.js',
  './data/tables-gsr.js',
  './data/tables-om.js',
  './data/figures-acc.js',
  './data/figures-irsem.js',
  './data/figures-irpwm.js',
  './data/figures-bwm.js',
  './data/tables-acc.js',
  './data/tables-irsem.js',
  './data/tables-irpwm.js',
  './data/pages-bwm.js',
  './data/pages-ira.js'
];

const ALL_CACHES = [SHELL_CACHE, DATA_CACHE, ASSET_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Data first: without it the app renders an empty shell.
    const dataCache = await caches.open(DATA_CACHE);
    await dataCache.addAll(DATA_ASSETS);

    const shellCache = await caches.open(SHELL_CACHE);
    // Individually, so one missing icon does not fail the whole install.
    await Promise.all(SHELL_ASSETS.map((url) =>
      shellCache.add(url).catch((err) => console.warn('[sw] skipped', url, err))
    ));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('rmp-') && !ALL_CACHES.includes(n))
           .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function cacheFor(url) {
  if (url.pathname.includes('/data/')) return DATA_CACHE;
  if (/\.(pdf|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)) return ASSET_CACHE;
  return SHELL_CACHE;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API traffic. Supabase auth, edge functions and REST must always
  // hit the network — a cached session response would be both stale and unsafe.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/functions/')) return;

  const targetCache = cacheFor(url);

  // Navigations: network first, so a deployed update is picked up promptly,
  // falling back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) ||
               (await caches.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first. These are all content-addressed by cache
  // version, so a stale hit only happens when the version has not been bumped.
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(targetCache);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
