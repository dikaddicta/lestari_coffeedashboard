(function () {
  "use strict";

  const core = window.COFFEE_CORE = window.COFFEE_CORE || {};
  const listeners = new Map();

  function on(eventName, handler) {
    if (typeof handler !== "function") return () => {};
    const name = String(eventName || "").trim();
    if (!name) return () => {};
    const bucket = listeners.get(name) || new Set();
    bucket.add(handler);
    listeners.set(name, bucket);
    return () => off(name, handler);
  }

  function once(eventName, handler) {
    const unsubscribe = on(eventName, payload => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  function off(eventName, handler) {
    const bucket = listeners.get(String(eventName || ""));
    if (!bucket) return false;
    const removed = bucket.delete(handler);
    if (!bucket.size) listeners.delete(String(eventName || ""));
    return removed;
  }

  function emit(eventName, payload = {}) {
    const name = String(eventName || "").trim();
    if (!name) return 0;
    const bucket = listeners.get(name);
    if (!bucket?.size) return 0;
    [...bucket].forEach(handler => {
      try { handler(payload); }
      catch (error) { console.error(`Coffee event handler failed: ${name}`, error); }
    });
    return bucket.size;
  }

  core.events = Object.freeze({ on, once, off, emit });
})();
