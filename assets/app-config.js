(function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  window.COFFEE_APP_CONFIG = deepFreeze({
  "version": "44.0.0-rc.2",
  "release": "Release Candidate 2",
  "build": "20260714-v44-rc2",
  "commit": "not-recorded",
  "releasedAt": "2026-07-14T09:20:00Z",
  "environment": "production",
  "site": {
    "url": "https://dikaddicta.github.io/lestari_coffeedashboard/",
    "productName": "Coffee Brew OS",
    "brandName": "Lestari Coffee",
    "applicationName": "Coffee Brew OS",
    "tagline": "Seduh lebih rapi. Hasil lebih konsisten.",
    "description": "Susun resep, catat percobaan, pantau stok, dan evaluasi hasil seduh dalam satu dashboard.",
    "socialImage": "https://dikaddicta.github.io/lestari_coffeedashboard/assets/social-preview.png",
    "supportUrl": "https://dikaddicta.github.io/lestari_coffeedashboard/saran/",
    "legalVersion": "1.0"
  },
  "monitoring": {
    "enabled": false,
    "endpoint": "",
    "sampleRate": 1,
    "timeoutMs": 5000
  },
  "maintenance": {
    "enabled": false,
    "title": "Pemeliharaan terjadwal",
    "message": "Beberapa fitur untuk sementara tidak tersedia. Data lokal tetap tersimpan di browser."
  },
  "features": {
    "mascot": false,
    "demoExperience": true,
    "pwa": true,
    "debugTools": false,
    "modularPages": true,
    "modularScripts": true,
    "cleanUrls": true,
    "serviceLayer": true,
    "refinedWelcome": true,
    "coreWorkflowModules": true,
    "workflowValidation": true,
    "recommendationEngine": true,
    "qaDiagnostics": true,
    "analyticsInsight": true,
    "costPerCup": true,
    "securityHardening": true,
    "auditTrail": true,
    "roleManagement": true,
    "commercialReadiness": true,
    "legalPages": true,
    "verifiedBackup": true,
    "diagnostics": true,
    "maintenanceMode": true,
    "releaseCandidate": true,
    "brandedMetadata": true,
    "releaseManifest": true,
    "productionMonitoring": true
  }
});
})();
