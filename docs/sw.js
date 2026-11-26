/* Linge viltobs – service worker
 * - Appen åpner uten nett (siden hentes fra nettet først, ellers fra lageret).
 * - Kartbilder du har sett lagres på enheten og brukes når de finnes (maks MAX_TILES).
 * - Værdata (Open-Meteo) hentes alltid fra nettet og lagres ikke her.
 */
const SHELL = 'viltobs-shell-v8';
const TILES = 'viltobs-tiles-v1';
const MAX_TILES = 4000;
const NAV_TIMEOUT_MS = 5000;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
const TILE_HOSTS = ['server.arcgisonline.com', 'cache.kartverket.no', 'tile.openstreetmap.org'];
const ASSET_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(u =>
      cache.add(new Request(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('viltobs-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) { event.respondWith(page(req)); return; }
  if (TILE_HOSTS.includes(url.hostname)) { event.respondWith(tile(req)); return; }
  if (url.origin === self.location.origin || ASSET_HOSTS.includes(url.hostname)) { event.respondWith(asset(req)); return; }
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

// Siden: nettet først (så oppdateringer kommer fram), lageret ved dårlig eller ingen dekning
async function page(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (res && res.ok) { cache.put('./', res.clone()); return res; }
    return (await cache.match('./')) || res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
  }
}

// Kartbiblioteket, skrifter og ikoner: lageret først, oppdateres i bakgrunnen
async function asset(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

// Kartbilder: lagret bilde hvis det finnes, ellers fra nettet. Lagres bare når serveren tillater det (CORS).
let puts = 0;
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) cache.put(req.url, res.clone()).then(trim).catch(() => null);
    return res;
  } catch (e) {
    try { return await fetch(req); } catch (e2) { return Response.error(); }
  }
}
async function trim() {
  if (++puts % 50) return;
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
