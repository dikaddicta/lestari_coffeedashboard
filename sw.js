const CACHE_NAME = "coffee-brew-os-v43-commercial-readiness";
const ROUTE_ENTRIES = [
  "beranda",
  "cara-pakai",
  "rekomendasi-seduh",
  "input-seduhan",
  "beans",
  "stock",
  "brew-log-qa",
  "hasil-seduhan-publik",
  "data-analytics",
  "notification",
  "export-report",
  "saran",
  "akun-role",
  "pustaka-data",
  "privasi",
  "ketentuan",
  "disclaimer",
  "status",
  "maintenance"
].map(route => `./${route}/`);

const PAGE_MODULES = [
  "beranda",
  "cara-pakai",
  "rekomendasi-seduh",
  "input-seduhan",
  "beans",
  "stock",
  "brew-log-qa",
  "hasil-seduhan-publik",
  "data-analytics",
  "notification",
  "export-report",
  "saran",
  "akun-role",
  "pustaka-data"
].map(name => `./assets/pages/${name}.js`);

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./404.html",
  ...ROUTE_ENTRIES,
  "./assets/app-config.js",
  "./assets/core/routes.js",
  "./assets/core/navigation.js",
  "./assets/core/runtime.js",
  "./assets/core/maintenance.js",
  "./assets/services/storage-service.js",
  "./assets/services/error-service.js",
  "./assets/services/backup-service.js",
  "./assets/services/security-service.js",
  "./assets/services/audit-service.js",
  "./assets/core/event-bus.js",
  "./assets/core/validation.js",
  "./assets/core/app-state.js",
  "./assets/core/page-modules.js",
  ...PAGE_MODULES,
  "./assets/styles.css",
  "./assets/styles-v35-quiet-luxury.css",
  "./assets/styles-v35-1-functional.css",
  "./assets/css/tokens.css",
  "./assets/css/base.css",
  "./assets/css/layout.css",
  "./assets/css/components.css",
  "./assets/css/pages.css",
  "./assets/css/welcome.css",
  "./assets/css/workflow.css",
  "./assets/css/intelligence.css",
  "./assets/css/analytics-insight.css",
  "./assets/css/security-audit.css",
  "./assets/css/commercial-readiness.css",
  "./assets/css/public-pages.css",
  "./assets/app.js",
  "./assets/data.js",
  "./assets/supabase-config.js",
  "./assets/services/supabase-service.js",
  "./assets/services/auth-service.js",
  "./assets/services/stock-service.js",
  "./assets/services/brew-service.js",
  "./assets/services/recommendation-service.js",
  "./assets/services/qa-service.js",
  "./assets/services/analytics-service.js",
  "./assets/services/notification-service.js",
  "./assets/latte-art-icon.png",
  "./assets/public/status-page.js",
  "./assets/public/maintenance-page.js",
  "./manifest.webmanifest",
  "./robots.txt",
  "./sitemap.xml",
  "./.well-known/security.txt"
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
        await putInCache(request, response);
        return response;
      } catch (_error) {
        return (await matchCache(request))
          || (await matchCache(new Request(new URL("./index.html", self.location.href))))
          || Response.error();
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
