(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};
  const errors = services.errors;
  const config = window.COFFEE_APP_CONFIG?.monitoring || {};
  let sent = 0;
  let failed = 0;
  let lastAttempt = null;

  function state() {
    return Object.freeze({
      enabled: Boolean(config.enabled),
      configured: Boolean(config.enabled && config.endpoint),
      endpoint: config.endpoint ? "configured" : "not-configured",
      sent,
      failed,
      lastAttempt
    });
  }

  function eligible() {
    if (!config.enabled || !config.endpoint || !navigator.onLine) return false;
    const rate = Math.min(1, Math.max(0, Number(config.sampleRate ?? 1)));
    return Math.random() <= rate;
  }

  async function send(event = {}) {
    if (!eligible()) return { sent: false, reason: "disabled-or-unavailable" };
    lastAttempt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(config.timeoutMs || 5000));
    try {
      const payload = {
        product: window.COFFEE_APP_CONFIG?.site?.productName || "Lestari Coffee Dashboard",
        version: window.COFFEE_APP_CONFIG?.version || "unknown",
        build: window.COFFEE_APP_CONFIG?.build || "unknown",
        environment: window.COFFEE_APP_CONFIG?.environment || "unknown",
        event: {
          at: event.at || new Date().toISOString(),
          type: errors?.redact?.(event.type || "runtime") || "runtime",
          message: errors?.redact?.(event.message || "Unknown error") || "Unknown error",
          source: errors?.redact?.(event.source || "application") || "application",
          route: errors?.redact?.(event.route || location.pathname) || location.pathname,
          online: navigator.onLine
        }
      };
      const response = await fetch(config.endpoint, {
        method: "POST",
        mode: "cors",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Monitoring HTTP ${response.status}`);
      sent += 1;
      return { sent: true };
    } catch (error) {
      failed += 1;
      return { sent: false, reason: error?.name === "AbortError" ? "timeout" : "request-failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  window.addEventListener("coffee:diagnostic", event => {
    send(event.detail || {}).catch(() => null);
  });

  window.COFFEE_SERVICES = Object.freeze({
    ...services,
    monitoring: Object.freeze({ send, state })
  });
})();
