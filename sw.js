const CACHE_NAME = "coffee-brew-os-v36-modular-pages";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/app-config.js",
  "./assets/core/routes.js",
  "./assets/core/runtime.js",
  "./assets/styles.css",
  "./assets/styles-v35-quiet-luxury.css",
  "./assets/styles-v35-1-functional.css",
  "./assets/css/tokens.css",
  "./assets/css/base.css",
  "./assets/css/layout.css",
  "./assets/css/components.css",
  "./assets/css/pages.css",
  "./assets/app.js",
  "./assets/data.js",
  "./assets/supabase-config.js",
  "./assets/latte-art-icon.png",
  "./manifest.webmanifest"
];

function normalizedRequest(request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), {
    method: "GET",
    credentials: request.credentials === "include" ? "include" : "same-origin",
    redirect: "follow"
  });
}

async function putInCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(normalizedRequest(request), response.clone());
}

async function matchCache(request) {
  return caches.match(normalizedRequest(request), { ignoreSearch: true });
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        await putInCache(new Request(new URL("./index.html", self.location.href)), response);
        return response;
      } catch (_error) {
        return (await matchCache(new Request(new URL("./index.html", self.location.href)))) || Response.error();
      }
    })());
    return;
  }

  if (!sameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await matchCache(request);
    if (cached) {
      event.waitUntil(fetch(request).then(response => putInCache(request, response)).catch(() => null));
      return cached;
    }

    try {
      const response = await fetch(request);
      await putInCache(request, response);
      return response;
    } catch (_error) {
      return Response.error();
    }
  })());
});
