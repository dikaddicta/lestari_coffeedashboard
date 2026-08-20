(function () {
  "use strict";

  const errors = window.COFFEE_SERVICES?.errors;
  const release = window.COFFEE_SERVICES?.release;
  const monitoring = window.COFFEE_SERVICES?.monitoring;
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

  async function run() {
    const storageOk = storageTest();
    const releaseCheck = await release?.verify?.() || { ok: false, reason: "service-unavailable" };
    const monitorState = monitoring?.state?.() || { enabled: false, configured: false, sent: 0, failed: 0 };
    const secure = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
    const checks = [
      { label: "Koneksi", ok: navigator.onLine, value: navigator.onLine ? "Online" : "Offline", detail: navigator.onLine ? "Browser mendeteksi koneksi jaringan." : "Fitur cloud tidak dapat digunakan." },
      { label: "Konteks Aman", ok: secure, value: secure ? "HTTPS" : "Tidak Aman", detail: secure ? "Service worker dan API browser dapat berjalan dalam secure context." : "Gunakan HTTPS sebelum deployment produksi." },
      { label: "Penyimpanan Lokal", ok: storageOk, value: storageOk ? "Tersedia" : "Terbatas", detail: "Dipakai untuk draft, preferensi, backup lokal, dan diagnostik." },
      { label: "PWA", ok: "serviceWorker" in navigator, value: "serviceWorker" in navigator ? "Didukung" : "Tidak Didukung", detail: "Kemampuan cache dan instalasi aplikasi." },
      { label: "Manifest Rilis", ok: Boolean(releaseCheck.ok), value: releaseCheck.ok ? "Sinkron" : "Perlu Diperiksa", detail: releaseCheck.ok ? `v${releaseCheck.manifest.version} · ${releaseCheck.manifest.build}` : "release.json tidak tersedia atau berbeda dari runtime." },
      { label: "Versi Aplikasi", ok: true, value: `v${window.COFFEE_APP_CONFIG?.version || "unknown"}`, detail: [window.COFFEE_APP_CONFIG?.release || "Release tidak terdeteksi.", window.COFFEE_APP_CONFIG?.commit && window.COFFEE_APP_CONFIG.commit !== "not-recorded" ? window.COFFEE_APP_CONFIG.commit : ""].filter(Boolean).join(" · ") },
      { label: "Mode Pemeliharaan", ok: !window.COFFEE_APP_CONFIG?.maintenance?.enabled, value: window.COFFEE_APP_CONFIG?.maintenance?.enabled ? "Aktif" : "Tidak Aktif", detail: "Dikendalikan melalui src/site.json dan build release." },
      { label: "Monitoring", ok: true, value: monitorState.configured ? "Aktif" : "Lokal Saja", detail: monitorState.configured ? `${monitorState.sent} terkirim · ${monitorState.failed} gagal.` : "Tidak ada diagnostik yang dikirim keluar secara default." },
      { label: "Riwayat Diagnostik", ok: true, value: (errors?.list?.().length || 0) ? `${errors.list().length} catatan historis` : "Tidak ada catatan", detail: (errors?.list?.().length || 0) ? "Catatan lama tetap tersedia untuk troubleshooting, tetapi tidak dihitung sebagai gangguan aktif. Gunakan Hapus Riwayat Error setelah perbaikan terverifikasi." : "Belum ada diagnostik error yang tersimpan di browser." }
    ];

    if (grid) {
      grid.innerHTML = checks.map(item => `<article class="status-item" data-state="${item.ok ? "ok" : "warning"}"><span>${item.label}</span><strong>${item.value}</strong><small>${item.detail}</small></article>`).join("");
    }
    const warningCount = checks.filter(item => !item.ok).length;
    if (summary) {
      summary.dataset.state = warningCount ? "warning" : "ok";
      summary.querySelector("strong").textContent = warningCount ? `${warningCount} pemeriksaan perlu perhatian` : "Pemeriksaan browser terlihat normal";
      summary.querySelector("p").textContent = warningCount ? "Buka detail di bawah sebelum melanjutkan aktivitas penting." : "Koneksi, release manifest, penyimpanan, dan fitur dasar tersedia.";
    }

    document.getElementById("statusDownloadDiagnostics")?.addEventListener("click", () => errors?.download?.({ checks, release: releaseCheck, monitoring: monitorState }));
    document.getElementById("statusClearDiagnostics")?.addEventListener("click", () => {
      errors?.clear?.();
      location.reload();
    });
  }

  run().catch(error => {
    errors?.capture?.({ error, source: "status-page" });
    if (summary) {
      summary.dataset.state = "warning";
      summary.querySelector("strong").textContent = "Pemeriksaan tidak selesai";
      summary.querySelector("p").textContent = "Muat ulang halaman atau unduh diagnostik untuk pemeriksaan lebih lanjut.";
    }
  });
})();
