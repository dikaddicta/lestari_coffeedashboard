(function () {
  "use strict";

  const runtimeStorage = window.COFFEE_RUNTIME?.storage;
  const fallbackStorage = {
    get(key, fallback = null, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        const value = storage.getItem(key);
        return value === null ? fallback : value;
      } catch (_error) {
        return fallback;
      }
    },
    set(key, value, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.setItem(key, String(value));
        return true;
      } catch (_error) {
        return false;
      }
    },
    remove(key, kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        storage.removeItem(key);
        return true;
      } catch (_error) {
        return false;
      }
    },
    keys(kind = "local") {
      try {
        const storage = kind === "session" ? window.sessionStorage : window.localStorage;
        return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
      } catch (_error) {
        return [];
      }
    },
    readJSON(key, fallback, kind = "local") {
      const raw = this.get(key, null, kind);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return fallback;
      }
    },
    writeJSON(key, value, kind = "local") {
      try {
        return this.set(key, JSON.stringify(value), kind);
      } catch (_error) {
        return false;
      }
    }
  };

  const base = runtimeStorage || fallbackStorage;
  const service = {
    get: base.get.bind(base),
    set: base.set.bind(base),
    remove: base.remove.bind(base),
    keys: base.keys.bind(base),
    readJSON: base.readJSON.bind(base),
    writeJSON: base.writeJSON.bind(base),
    scopedKey(scope, key) {
      const safeScope = String(scope || "app").trim().replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      return `coffee-brew-os:${safeScope}:${String(key || "value")}`;
    },
    readScopedJSON(scope, key, fallback, kind = "local") {
      return this.readJSON(this.scopedKey(scope, key), fallback, kind);
    },
    writeScopedJSON(scope, key, value, kind = "local") {
      return this.writeJSON(this.scopedKey(scope, key), value, kind);
    }
  };

  service.authAdapter = Object.freeze({
    getItem: key => service.get(key, null),
    setItem: (key, value) => { service.set(key, value); },
    removeItem: key => { service.remove(key); }
  });

  window.COFFEE_SERVICES = Object.freeze({
    ...(window.COFFEE_SERVICES || {}),
    storage: Object.freeze(service)
  });
})();
