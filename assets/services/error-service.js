(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};
  const STORAGE_KEY = "coffeeBrewOsDiagnosticsV1";
  const LIMIT = 25;
  const storage = services.storage || window.COFFEE_RUNTIME?.storage;

  function redact(value) {
    return String(value ?? "")
      .replace(/(bearer\s+)[a-z0-9._-]+/ig, "$1[redacted]")
      .replace(/(apikey|api_key|token|password|secret|authorization)([\s:=]+)[^\s,;]+/ig, "$1$2[redacted]")
      .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
      .slice(0, 1200);
  }

  function read() {
    const rows = storage?.readJSON?.(STORAGE_KEY, []) || [];
    return Array.isArray(rows) ? rows.slice(0, LIMIT) : [];
  }

  function write(rows) {
    return storage?.writeJSON?.(STORAGE_KEY, rows.slice(0, LIMIT)) ?? false;
  }

  function capture(input = {}) {
    const error = input.error || input.reason || input;
    const row = {
      id: `diag-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: new Date().toISOString(),
      type: redact(input.type || error?.name || "runtime"),
      message: redact(input.message || error?.message || error || "Unknown error"),
      source: redact(input.source || input.filename || "application"),
      line: Number(input.line || input.lineno || 0) || null,
      column: Number(input.column || input.colno || 0) || null,
      stack: redact(error?.stack || input.stack || ""),
      route: redact(location.pathname),
      online: navigator.onLine,
      version: String(window.COFFEE_APP_CONFIG?.version || "unknown")
    };
    write([row, ...read()]);
    window.dispatchEvent(new CustomEvent("coffee:diagnostic", { detail: row }));
    return row;
  }

  function clear() {
    storage?.remove?.(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("coffee:diagnostic-cleared"));
  }

  function snapshot(extra = {}) {
    return {
      product: "Coffee Brew OS",
      generatedAt: new Date().toISOString(),
      app: {
        version: window.COFFEE_APP_CONFIG?.version || "unknown",
        release: window.COFFEE_APP_CONFIG?.release || "unknown",
        build: window.COFFEE_APP_CONFIG?.build || "unknown"
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        online: navigator.onLine,
        serviceWorker: "serviceWorker" in navigator,
        storageAvailable: Boolean(storage?.available?.("local") ?? true),
        path: location.pathname
      },
      errors: read(),
      ...extra
    };
  }

  function download(extra = {}) {
    const content = JSON.stringify(snapshot(extra), null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `coffee-brew-os-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...services,
    errors: Object.freeze({ capture, clear, download, list: read, snapshot, redact })
  });
})();
