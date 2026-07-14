(function () {
  "use strict";

  const summary = document.getElementById("releaseSummary");
  const release = window.COFFEE_SERVICES?.release;
  if (!summary || !release) return;

  release.verify().then(result => {
    const first = summary.querySelector("div:first-child");
    if (!first) return;
    const manifest = result.manifest || release.current();
    first.querySelector("strong").textContent = `v${manifest.version || "unknown"}`;
    first.querySelector("small").textContent = result.ok
      ? `${manifest.release} · build ${manifest.build}`
      : "Manifest rilis belum sinkron dengan konfigurasi runtime.";
    first.dataset.state = result.ok ? "ok" : "warning";
  });
})();
