/* HIRONO Collection service worker.
 * Built by scripts/build.mjs, which replaces __BUILD_ID__ and __PRECACHE__.
 *
 * Caches (kept separate so each can be versioned on its own):
 *   hirono-shell-<build>   index.html, offline page, manifest, icons  (replaced every app release)
 *   hirono-static-<build>  hashed JS/CSS bundles                      (replaced every app release)
 *   hirono-catalog-v1      catalog/catalog.json                       (network first, survives app updates)
 *   hirono-images-v1       product images under images/               (cache first, survives app updates)
 *   hirono-fonts-v1        Google Fonts                               (cache first, survives app updates)
 *
 * Personal data never goes through the service worker: it lives in IndexedDB
 * and is not touched when caches are replaced.
 */
const BUILD = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const SHELL = `hirono-shell-${BUILD}`;
const STATIC = `hirono-static-${BUILD}`;
const CATALOG = 'hirono-catalog-v1';
const IMAGES = 'hirono-images-v1';
const FONTS = 'hirono-fonts-v1';
const KEEP = new Set([SHELL, STATIC, CATALOG, IMAGES, FONTS]);
const BASE = new URL('./', self.location).href;
const abs = (p) => new URL(p, BASE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(PRECACHE.shell.map(abs));
      const stat = await caches.open(STATIC);
      await stat.addAll(PRECACHE.static.map(abs));
      // Seed the catalog cache only if empty, so a newer downloaded catalog is not replaced by an older bundled one.
      const cat = await caches.open(CATALOG);
      if (!(await cat.match(abs('catalog/catalog.json')))) {
        try {
          await cat.add(abs('catalog/catalog.json'));
        } catch (e) {
          /* offline during install: the app will show that the catalog is not ready */
        }
      }
    })(),
  );
  // No skipWaiting here: the page decides when to switch (see app/pwa.ts).
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hirono-') && !KEEP.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(cacheName, request, { maxEntries } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    await cache.put(request, res.clone());
    if (maxEntries) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(k);
    }
  }
  return res;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONTS, req, { maxEntries: 60 }).catch(() => new Response('', { status: 504 })));
    return;
  }
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;

  // App navigation: always the index.html of *this* build, so HTML and JS versions match.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const shell = await caches.open(SHELL);
        const cached = await shell.match(abs('index.html'));
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch (e) {
          return (await shell.match(abs('offline.html'))) || new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  const path = url.href.slice(BASE.length);
  if (path.startsWith('catalog/')) {
    event.respondWith(networkFirst(CATALOG, req));
    return;
  }
  if (path.startsWith('images/')) {
    event.respondWith(cacheFirst(IMAGES, req, { maxEntries: 800 }));
    return;
  }
  if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(STATIC, req));
    return;
  }
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || fetch(req);
    })(),
  );
});
