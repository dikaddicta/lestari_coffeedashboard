(function () {
  "use strict";
  const maintenance = window.COFFEE_APP_CONFIG?.maintenance || {};
  const title = document.getElementById("maintenanceTitle");
  const message = document.getElementById("maintenanceMessage");
  if (title && maintenance.title) title.textContent = maintenance.title;
  if (message && maintenance.message) message.textContent = maintenance.message;
})();
