(function () {
  "use strict";

  const features = Object.freeze({
    mascot: false,
    demoExperience: true,
    pwa: true,
    debugTools: false,
    modularPages: true
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "36.0.0",
    release: "Modular Pages Architecture",
    build: "20260713-v36-modular",
    environment: "production",
    features
  });
})();
