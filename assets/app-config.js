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
    refinedWelcome: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "38.0.0",
    release: "Services & Welcome Refinement",
    build: "20260713-v38-services-welcome",
    environment: "production",
    features
  });
})();
