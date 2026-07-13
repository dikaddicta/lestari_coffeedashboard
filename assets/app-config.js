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
    qaDiagnostics: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "40.0.0",
    release: "Recommendation & QA Engine",
    build: "20260713-v40-recommendation-qa",
    environment: "production",
    features
  });
})();
