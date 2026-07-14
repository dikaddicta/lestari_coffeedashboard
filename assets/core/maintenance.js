(function () {
  "use strict";

  const config = window.COFFEE_APP_CONFIG?.maintenance || {};
  if (!config.enabled) return;

  const path = location.pathname.toLowerCase();
  const allowed = ["/maintenance/", "/status/", "/privasi/", "/ketentuan/", "/disclaimer/"];
  if (allowed.some(item => path.endsWith(item))) return;

  const baseHref = document.querySelector("base")?.href || new URL("./", location.href).href;
  location.replace(new URL("maintenance/", baseHref).href);
})();
