(function () {
  "use strict";

  const config = window.COFFEE_APP_CONFIG || {};
  const debugEnabled = Boolean(config.features?.debugTools || config.environment === "development");

  function getStorage(kind = "local") {
    try {
      return kind === "session" ? window.sessionStorage : window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function safeGet(key, fallback = null, kind = "local") {
    try {
      const storage = getStorage(kind);
      if (!storage) return fallback;
      const value = storage.getItem(key);
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function safeSet(key, value, kind = "local") {
    try {
      const storage = getStorage(kind);
      if (!storage) return false;
      storage.setItem(key, String(value));
      return true;
    } catch (error) {
      if (debugEnabled) console.warn("Storage write failed", { key, kind, error });
      return false;
    }
  }

  function safeRemove(key, kind = "local") {
    try {
      const storage = getStorage(kind);
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function safeKeys(kind = "local") {
    try {
      const storage = getStorage(kind);
      if (!storage) return [];
      return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function readJSON(key, fallback, kind = "local") {
    const raw = safeGet(key, null, kind);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function writeJSON(key, value, kind = "local") {
    try {
      return safeSet(key, JSON.stringify(value), kind);
    } catch (_error) {
      return false;
    }
  }

  function log(...args) {
    if (debugEnabled) console.log("[Coffee Brew OS]", ...args);
  }

  function warn(...args) {
    if (debugEnabled) console.warn("[Coffee Brew OS]", ...args);
  }

  function setButtonBusy(button, busy, busyLabel = "Memproses...") {
    if (!button) return;
    if (busy) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent || "";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = busyLabel;
      return;
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }

  window.COFFEE_RUNTIME = Object.freeze({
    version: config.version || "0.0.0",
    debugEnabled,
    storage: Object.freeze({
      get: safeGet,
      set: safeSet,
      remove: safeRemove,
      keys: safeKeys,
      readJSON,
      writeJSON
    }),
    log,
    warn,
    setButtonBusy
  });
})();
