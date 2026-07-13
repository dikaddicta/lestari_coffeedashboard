(function () {
  "use strict";

  const registry = new Map();
  let activeTab = "";

  function register(definition) {
    const tab = String(definition?.tab || "").trim();
    if (!tab) throw new Error("Page module membutuhkan tab.");
    if (registry.has(tab)) throw new Error(`Page module duplikat: ${tab}`);
    const renderers = Object.freeze([...(definition.renderers || [])].map(String));
    registry.set(tab, Object.freeze({
      tab,
      renderers,
      onEnter: typeof definition.onEnter === "function" ? definition.onEnter : null,
      onLeave: typeof definition.onLeave === "function" ? definition.onLeave : null
    }));
  }

  function activate(tab, context = {}) {
    const nextTab = String(tab || "");
    if (activeTab && activeTab !== nextTab) {
      const previous = registry.get(activeTab);
      previous?.onLeave?.(context);
    }
    activeTab = nextTab;
    const module = registry.get(nextTab);
    if (!module) return false;
    module.renderers.forEach(renderer => context.render?.(renderer));
    module.onEnter?.(context);
    document.documentElement.dataset.activeModule = nextTab;
    return true;
  }

  function has(tab) {
    return registry.has(String(tab || ""));
  }

  function list() {
    return Object.freeze([...registry.values()]);
  }

  window.COFFEE_PAGE_MODULES = Object.freeze({
    version: "40.0.0",
    register,
    activate,
    has,
    list
  });
})();
