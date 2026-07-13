(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};

  function summarize(items = []) {
    const normalized = items.map(item => String(item?.severity || item || "").toLowerCase());
    const critical = normalized.filter(value => /critical|kritis|error|required|missing/.test(value)).length;
    const warning = normalized.filter(value => /warning|peringatan|low|kurang|empty|kosong/.test(value)).length;
    return { critical, warning, info: Math.max(0, normalized.length - critical - warning), total: normalized.length };
  }

  services.notification = Object.freeze({ summarize });
})();
