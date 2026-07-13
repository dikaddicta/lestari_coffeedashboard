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
    roleManagement: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "42.2.0",
    release: "Browser Title Hotfix",
    build: "20260713-v42-2-browser-title",
    environment: "production",
    features
  });
})();
