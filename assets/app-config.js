(function () {
  "use strict";

  const features = Object.freeze({
    mascot: false,
    demoExperience: true,
    pwa: true,
    debugTools: false
  });

  window.COFFEE_APP_CONFIG = Object.freeze({
    version: "35.1.0",
    release: "Functional Stabilization",
    build: "20260713-v35-1-functional",
    environment: "production",
    features
  });
})();
