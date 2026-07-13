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
    workflowValidation: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "39.0.0",
    release: "Core Workflow Modules",
    build: "20260713-v39-core-workflow",
    environment: "production",
    features
  });
})();
