import { spawnSync } from "node:child_process";
import process from "node:process";

for (const file of ["scripts/build-pages.mjs", "scripts/build-public-pages.mjs"]) {
  const result = spawnSync(process.execPath, [file], { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}
