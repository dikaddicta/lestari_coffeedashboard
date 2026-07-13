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
    costPerCup: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "41.0.0",
    release: "Analytics & Cost Insight",
    build: "20260713-v41-analytics-cost",
    environment: "production",
    features
  });
})();
