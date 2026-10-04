/* =========================================================
   Fokus – Service Worker
   WICHTIG: Bei jeder neuen Veröffentlichung CACHE_VERSION
   erhöhen (z. B. v2 → v3), damit das iPhone das Update lädt.
   ========================================================= */

const CACHE_VERSION = 'fokus-v12';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './stats.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Safari mag keine umgeleiteten Antworten bei Navigationen → saubere Kopie */
async function cleanResponse(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/**
 * Netzwerk zuerst (mit Zeitlimit), damit Updates sofort ankommen.
 * Offline oder bei schlechtem Netz: Antwort aus dem Cache.
 */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const isNav = req.mode === 'navigate';

    const network = fetch(req, { cache: 'no-cache' })
      .then(cleanResponse)
      .then(res => {
        if (res.ok) cache.put(isNav ? './index.html' : req, res.clone());
        return res;
      });
    network.catch(() => {});   // Fehler wird unten behandelt

    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));

    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) {
      /* offline → Cache */
    }

    const cached = isNav
      ? (await cache.match('./index.html')) || (await cache.match('./'))
      : await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return network;   // letzter Versuch, falls nichts im Cache liegt
  })());
});
