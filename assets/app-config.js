(function () {
  "use strict";

  const features = Object.freeze({
    mascot: false,
    demoExperience: true,
    pwa: true,
    debugTools: false,
    modularPages: true,
    modularScripts: true,
    cleanUrls: true,
    serviceLayer: true,
    refinedWelcome: true,
    coreWorkflowModules: true,
    workflowValidation: true,
    recommendationEngine: true,
    qaDiagnostics: true,
    analyticsInsight: true,
    costPerCup: true,
    securityHardening: true,
    auditTrail: true,
    roleManagement: true,
    commercialReadiness: true,
    legalPages: true,
    verifiedBackup: true,
    diagnostics: true,
    maintenanceMode: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "43.0.0",
    release: "Commercial Readiness",
    build: "20260714-v43-commercial",
    environment: "production",
    maintenance: Object.freeze({
      enabled: false,
      title: "Pemeliharaan terjadwal",
      message: "Beberapa fitur untuk sementara tidak tersedia. Data lokal tetap tersimpan di browser."
    }),
    features
  });
})();
