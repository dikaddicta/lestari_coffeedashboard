import { spawnSync } from "node:child_process";

const steps = [
  ["Build modular pages", ["scripts/build-pages.mjs"]],
  ["Audit modular pages", ["scripts/modular-pages-audit.mjs"]],
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

console.log("\nRelease check passed. Modular source, generated index, and dashboard functionality are consistent.");
