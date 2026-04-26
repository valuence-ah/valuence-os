// ─── Valuence OS — Service Worker ────────────────────────────────────────────
// Turbopack-compatible: plain static file, no webpack/workbox build step.
//
// Caching strategy
//   /_next/static/*  + image assets  →  Cache-first  (immutable hashed filenames)
//   HTML pages                       →  Network-first, stale-while-revalidate
//   /api/*                           →  Network-only  (always fresh, never cached)
//   All other GETs                   →  Network-first with cache fallback

const CACHE = "valuence-os-v2";

const PRECACHE = [
  "/dashboard",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
];

// ── Install: pre-cache key shell assets ──────────────────────────────────────
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // /api/* — network-only, skip cache entirely
  if (url.pathname.startsWith("/api/")) return;

  // Next.js static chunks + images — cache-first (hashed → immutable)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        cached => cached || fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        })
      )
    );
    return;
  }

  // Pages — network-first, fall back to cache when offline
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE).then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
