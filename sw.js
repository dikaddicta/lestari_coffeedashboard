const CACHE_NAME = "coffee-brew-os-v33-0-redesign";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/styles/main.css",
  "./assets/styles/00-tokens.css",
  "./assets/styles/01-base.css",
  "./assets/styles/02-layout.css",
  "./assets/styles/03-components.css",
  "./assets/styles/04-pages.css",
  "./assets/styles/05-mobile.css",
  "./assets/styles/06-legacy-compat.css",
  "./assets/app.js",
  "./assets/data.js",
  "./assets/images/latte-art-icon.png",
  "./assets/images/barista-mascot.png",
  "./assets/images/barista-banner.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy)).catch(() => null);
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (!sameOrigin) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => null);
        }
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
