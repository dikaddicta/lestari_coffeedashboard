(function () {
  "use strict";

  const errors = window.COFFEE_SERVICES?.errors;
  const grid = document.getElementById("publicStatusGrid");
  const summary = document.getElementById("publicStatusSummary");

  function storageTest() {
    try {
      const key = "coffee-status-test";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch (_error) { return false; }
  }

  const checks = [
    { label: "Koneksi", ok: navigator.onLine, value: navigator.onLine ? "Online" : "Offline", detail: navigator.onLine ? "Browser mendeteksi koneksi jaringan." : "Fitur cloud tidak dapat digunakan." },
    { label: "Penyimpanan Lokal", ok: storageTest(), value: storageTest() ? "Tersedia" : "Terbatas", detail: "Dipakai untuk draft, preferensi, dan pemulihan lokal." },
    { label: "PWA", ok: "serviceWorker" in navigator, value: "serviceWorker" in navigator ? "Didukung" : "Tidak Didukung", detail: "Kemampuan cache dan instalasi aplikasi." },
    { label: "Versi Aplikasi", ok: true, value: `v${window.COFFEE_APP_CONFIG?.version || "unknown"}`, detail: window.COFFEE_APP_CONFIG?.release || "Release tidak terdeteksi." },
    { label: "Mode Pemeliharaan", ok: !window.COFFEE_APP_CONFIG?.maintenance?.enabled, value: window.COFFEE_APP_CONFIG?.maintenance?.enabled ? "Aktif" : "Tidak Aktif", detail: "Dikendalikan melalui app-config.js." },
    { label: "Riwayat Error", ok: (errors?.list?.().length || 0) === 0, value: `${errors?.list?.().length || 0} catatan`, detail: "Hanya diagnostik yang telah disanitasi." }
  ];

  if (grid) {
    grid.innerHTML = checks.map(item => `<article class="status-item" data-state="${item.ok ? "ok" : "warning"}"><span>${item.label}</span><strong>${item.value}</strong><small>${item.detail}</small></article>`).join("");
  }
  const warningCount = checks.filter(item => !item.ok).length;
  if (summary) {
    summary.dataset.state = warningCount ? "warning" : "ok";
    summary.querySelector("strong").textContent = warningCount ? `${warningCount} pemeriksaan perlu perhatian` : "Pemeriksaan browser terlihat normal";
    summary.querySelector("p").textContent = warningCount ? "Buka detail di bawah sebelum melanjutkan aktivitas penting." : "Koneksi, penyimpanan, dan fitur dasar tersedia.";
  }

  document.getElementById("statusDownloadDiagnostics")?.addEventListener("click", () => errors?.download?.({ checks }));
  document.getElementById("statusClearDiagnostics")?.addEventListener("click", () => {
    errors?.clear?.();
    location.reload();
  });
})();
