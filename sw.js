// Offline support: app files are network-first (so updates show up straight away),
// piano samples are cache-first (they never change).
const VERSION = 'v2';
const SHELL_CACHE = 'shell-' + VERSION;
const SAMPLE_CACHE = 'samples-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/audio.js', 'js/piano.js', 'js/theory.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];
const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLES = [
  'A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3',
  'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6',
  'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8',
].map((n) => SAMPLE_BASE + n + '.mp3');

// The page fetches samples before this worker controls it on a first visit,
// so download them here too; otherwise they would only be cached on visit two.
async function cacheSamples() {
  const cache = await caches.open(SAMPLE_CACHE);
  await Promise.all(
    SAMPLES.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) await cache.put(url, res);
      } catch {}
    })
  );
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(cacheSamples)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'tonejs.github.io') e.respondWith(cacheFirst(e.request));
  else if (url.origin === location.origin) e.respondWith(networkFirst(e.request));
});

async function cacheFirst(req) {
  const cache = await caches.open(SAMPLE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
