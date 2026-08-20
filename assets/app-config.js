(function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  window.COFFEE_APP_CONFIG = deepFreeze({
  "version": "44.0.0-rc.4",
  "release": "Release Candidate 4",
  "build": "20260820-v44-rc4-routing-stability",
  "commit": "not-recorded",
  "releasedAt": "2026-08-20T03:20:00Z",
  "environment": "production",
  "site": {
    "url": "https://dikaddicta.github.io/lestari_coffeedashboard/",
    "productName": "Lestari Coffee Dashboard",
    "brandName": "Lestari",
    "applicationName": "Lestari",
    "tagline": "Jelajahi berbagai rekomendasi seduh dan bagikan pengalaman seduhmu.",
    "description": "Dashboard yang dibuat dari kebutuhan pribadi untuk membantu proses seduh menjadi lebih rapi, terukur, dan mudah dibagikan.",
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
