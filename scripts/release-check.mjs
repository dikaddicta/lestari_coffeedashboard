import { spawnSync } from "node:child_process";

const audit = spawnSync(process.execPath, ["scripts/functional-audit.mjs"], {
  stdio: "inherit",
  shell: false
});

if (audit.status !== 0) {
  console.error("\nRelease check failed. Fix the audit findings before commit or deployment.");
  process.exit(audit.status || 1);
}

console.log("\nRelease check passed. The dashboard is ready for local review and deployment.");
