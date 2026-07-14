import { spawnSync } from "node:child_process";

const steps = [
  ["Build application and public pages", ["scripts/build-all.mjs"]],
  ["Audit modular pages", ["scripts/modular-pages-audit.mjs"]],
  ["Audit clean URLs", ["scripts/clean-url-audit.mjs"]],
  ["Audit page modules", ["scripts/page-modules-audit.mjs"]],
  ["Audit service layer", ["scripts/service-layer-audit.mjs"]],
  ["Audit core workflow modules", ["scripts/workflow-modules-audit.mjs"]],
  ["Audit recommendation and QA engine", ["scripts/recommendation-qa-audit.mjs"]],
  ["Audit analytics and cost insight", ["scripts/analytics-insight-audit.mjs"]],
  ["Audit roles, RLS, and activity trail", ["scripts/security-audit.mjs"]],
  ["Audit commercial readiness", ["scripts/commercial-readiness-audit.mjs"]],
  ["Audit release candidate", ["scripts/release-candidate-audit.mjs"]],
  ["Audit visual contrast and public error states", ["scripts/visual-contrast-audit.mjs"]],
  ["Functional audit", ["scripts/functional-audit.mjs"]]
];

for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    console.error(`\nRelease check failed during: ${label}.`);
    process.exit(result.status || 1);
  }
}

console.log("\nRelease check passed. Modular source, clean URLs, page modules, service layer, core workflow modules, recommendation reasoning, QA diagnostics, analytics insight, cost estimation, role safeguards, RLS hardening, append-only audit trail, legal pages, verified backup, diagnostics, maintenance controls, branded metadata, release manifest, opt-in monitoring, public CTA contrast, resilient 404 routing, production runbooks, validation feedback, and dashboard functionality are consistent.");
