import { spawnSync } from "node:child_process";

const steps = [
  ["Build modular pages", ["scripts/build-pages.mjs"]],
  ["Audit modular pages", ["scripts/modular-pages-audit.mjs"]],
  ["Audit clean URLs", ["scripts/clean-url-audit.mjs"]],
  ["Audit page modules", ["scripts/page-modules-audit.mjs"]],
  ["Audit service layer", ["scripts/service-layer-audit.mjs"]],
  ["Audit core workflow modules", ["scripts/workflow-modules-audit.mjs"]],
  ["Audit recommendation and QA engine", ["scripts/recommendation-qa-audit.mjs"]],
  ["Audit analytics and cost insight", ["scripts/analytics-insight-audit.mjs"]],
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

console.log("\nRelease check passed. Modular source, clean URLs, page modules, service layer, core workflow modules, recommendation reasoning, QA diagnostics, analytics insight, cost estimation, validation feedback, and dashboard functionality are consistent.");
