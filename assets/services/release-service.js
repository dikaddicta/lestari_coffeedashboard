(function () {
  "use strict";

  const services = window.COFFEE_SERVICES || {};
  const config = window.COFFEE_APP_CONFIG || {};
  let manifestPromise = null;

  function rootUrl(path = "") {
    const base = document.baseURI || location.href;
    return new URL(path, base).toString();
  }

  async function load(options = {}) {
    if (!manifestPromise || options.refresh) {
      manifestPromise = fetch(rootUrl("release.json"), { cache: options.refresh ? "reload" : "no-cache" })
        .then(response => {
          if (!response.ok) throw new Error(`Release manifest HTTP ${response.status}`);
          return response.json();
        });
    }
    return manifestPromise;
  }

  async function verify() {
    try {
      const manifest = await load();
      const expected = {
        version: String(config.version || ""),
        build: String(config.build || ""),
        release: String(config.release || "")
      };
      const matches = manifest.version === expected.version
        && manifest.build === expected.build
        && manifest.release === expected.release;
      return { ok: matches, manifest, expected, reason: matches ? "consistent" : "mismatch" };
    } catch (error) {
      return { ok: false, manifest: null, expected: config, reason: "unavailable", error };
    }
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...services,
    release: Object.freeze({ load, verify, current: () => ({
      version: config.version || "unknown",
      release: config.release || "unknown",
      build: config.build || "unknown",
      commit: config.commit || "unknown",
      releasedAt: config.releasedAt || null
    }) })
  });
})();
