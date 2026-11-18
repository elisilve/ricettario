// Service worker: tiene in cache i file dell'app così funziona anche offline.
// Strategia "stale-while-revalidate": mostra subito la versione in cache
// e intanto scarica quella nuova (che vedrai alla prossima apertura).
// Quando cambi la lista dei file, aumenta il numero di versione.
const CACHE = 'ricettario-v28';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/images.js',
  './js/nutrition.js',
  './js/config.js',
  './js/cloud.js',
  './js/account.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Oltre ai file dell'app tengo in cache anche la libreria di Supabase (dal CDN),
// così l'app si apre anche senza connessione. Le richieste al server Supabase
// (dati, accesso, foto) invece passano sempre dalla rete.
const CACHEABLE = [location.origin, 'https://cdn.jsdelivr.net'];

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !CACHEABLE.includes(new URL(e.request.url).origin)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
