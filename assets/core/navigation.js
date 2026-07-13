(function () {
  "use strict";

  const pages = window.COFFEE_PAGES;
  const config = window.COFFEE_APP_CONFIG || {};
  const baseElement = document.querySelector("base[href]");
  const baseUrl = new URL(baseElement?.href || "./", window.location.href);
  const basePath = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  const listeners = new Set();

  function normalizeRoute(value) {
    return String(value || "")
      .trim()
      .replace(/^#\/?/, "")
      .replace(/^\/+|\/+$/g, "")
      .split(/[?#]/, 1)[0]
      .toLowerCase();
  }

  function isKnownRoute(route) {
    return Boolean(pages?.byRoute?.[normalizeRoute(route)]);
  }

  function legacyHashRoute() {
    const hash = String(window.location.hash || "");
    if (!hash.startsWith("#/")) return "";
    const route = normalizeRoute(hash);
    return isKnownRoute(route) ? route : "";
  }

  function routeFromPathname() {
    let pathname = decodeURIComponent(window.location.pathname || "/");
    if (pathname.startsWith(basePath)) pathname = pathname.slice(basePath.length);
    else pathname = pathname.replace(/^\/+/, "");
    const route = normalizeRoute(pathname.replace(/index\.html$/i, ""));
    return isKnownRoute(route) ? route : "";
  }

  function declaredInitialRoute() {
    const route = normalizeRoute(document.body?.dataset.initialRoute || "");
    return isKnownRoute(route) ? route : "";
  }

  function currentRoute() {
    return legacyHashRoute() || routeFromPathname() || declaredInitialRoute();
  }

  function urlFor(route) {
    const normalized = isKnownRoute(route) ? normalizeRoute(route) : "cara-pakai";
    const target = new URL(`${normalized}/`, baseUrl);
    return `${target.pathname}${window.location.search || ""}`;
  }

  function notify(source) {
    const detail = Object.freeze({ route: currentRoute(), source });
    listeners.forEach(listener => {
      try { listener(detail); } catch (error) { console.error(error); }
    });
    document.dispatchEvent(new CustomEvent("coffee:navigation", { detail }));
  }

  function navigate(route, options = {}) {
    const normalized = isKnownRoute(route) ? normalizeRoute(route) : "cara-pakai";
    const nextUrl = urlFor(normalized);
    const currentPath = `${window.location.pathname}${window.location.search || ""}`;
    if (currentPath === nextUrl && !window.location.hash) return false;
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({ coffeeRoute: normalized }, "", nextUrl);
    if (window.location.hash) window.history.replaceState({ coffeeRoute: normalized }, "", nextUrl);
    notify(options.replace ? "replace" : "push");
    return true;
  }

  function migrateLegacyHash() {
    const route = legacyHashRoute();
    if (!route) return false;
    window.history.replaceState({ coffeeRoute: route }, "", urlFor(route));
    notify("legacy-hash-migration");
    return true;
  }

  function listen(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.addEventListener("popstate", () => notify("popstate"));
  window.addEventListener("hashchange", () => {
    if (legacyHashRoute()) migrateLegacyHash();
  });

  window.COFFEE_NAVIGATION = Object.freeze({
    version: config.version || "41.0.0",
    baseUrl: baseUrl.href,
    basePath,
    normalizeRoute,
    isKnownRoute,
    currentRoute,
    urlFor,
    navigate,
    migrateLegacyHash,
    listen
  });
})();
