import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const checks = [];
let failed = false;
function check(ok, label, detail = "") {
  checks.push({ ok: Boolean(ok), label, detail });
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

const app = read("assets/app.js");
const modules = read("assets/core/page-modules.js");
const status = read("assets/public/status-page.js");
const sw = read("sw.js");
const localServer = read("scripts/serve-local.mjs");
const site = JSON.parse(read("src/site.json"));

check(site.version === "44.0.0-rc.4", "RC4 version configured");
check(site.build === "20260820-v44-rc4-routing-stability", "RC4 build id configured");
check(!/function renderAdminWorkspaceModule\(\)\s*\{\s*renderWorkspaceUI\(\)/.test(app), "Admin page renderer no longer re-enters renderWorkspaceUI");
check(app.includes('!(activeTab === "admin" && authIntent)'), "Guest login intent does not redirect the admin/auth panel into itself");
check(app.includes('showTab("guide", { replaceRoute: true })'), "Invalid guest private route falls back to guide");
check(modules.includes("activatingTabs.has(nextTab)"), "Page-module re-entrancy guard exists");
check(modules.includes("finally") && modules.includes("activatingTabs.delete(nextTab)"), "Page-module guard always releases");
check(status.includes('label: "Riwayat Diagnostik", ok: true'), "Historical diagnostics are informational, not an active health failure");
check(exists("404.html"), "Root GitHub Pages 404 exists");
check(exists("404/index.html"), "Explicit /404/ alias exists");
check(exists(".nojekyll"), ".nojekyll exists for deterministic static publishing");
check(sw.includes('"./404/"'), "PWA precaches the explicit 404 route");
check(sw.includes("lestari-coffee-dashboard-v44-rc4-routing-stability"), "PWA cache namespace bumped for RC4");
check(localServer.includes('path.join(root, "404.html")') && localServer.includes('response.writeHead(404'), "Local server mirrors custom 404 behavior for regression testing");

const result = { passed: checks.filter(x => x.ok).length, failed: checks.filter(x => !x.ok).length, checks };
fs.writeFileSync(path.join(root, "docs", "V44_RC4_ROUTING_AUDIT_RESULT.json"), `${JSON.stringify(result, null, 2)}\n`);
if (failed) process.exit(1);
console.log(`RC4 routing stability audit passed: ${result.passed}/${checks.length}.`);
