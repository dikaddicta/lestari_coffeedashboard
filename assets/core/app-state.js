(function () {
  "use strict";

  const core = window.COFFEE_CORE = window.COFFEE_CORE || {};

  function clone(value) {
    try { return structuredClone(value); }
    catch (_error) { return JSON.parse(JSON.stringify(value)); }
  }

  function createStore({ storage, key, defaults = {} }) {
    if (!storage || typeof storage.readJSON !== "function" || typeof storage.writeJSON !== "function") {
      throw new Error("State store membutuhkan storage service yang valid.");
    }
    const saved = storage.readJSON(key, {});
    const state = { ...clone(defaults), ...(saved && typeof saved === "object" ? saved : {}) };
    Object.keys(defaults).forEach(name => {
      if (Array.isArray(defaults[name]) && !Array.isArray(state[name])) state[name] = [];
    });

    function persist() {
      return storage.writeJSON(key, state);
    }

    function snapshot() {
      return clone(state);
    }

    function patch(partial = {}) {
      if (!partial || typeof partial !== "object") return state;
      Object.assign(state, partial);
      return state;
    }

    return Object.freeze({ state, persist, snapshot, patch });
  }

  core.state = Object.freeze({ createStore });
})();
