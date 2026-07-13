import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const results = [];
let failed = false;

function record(ok, message, detail = "") {
  results.push({ status: ok ? "PASS" : "FAIL", message, detail });
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${message}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function checkSyntax(file) {
  const run = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  record(run.status === 0, `JavaScript syntax: ${file}`, (run.stderr || "").trim());
}

for (const file of [
  "assets/app-config.js",
  "assets/core/routes.js",
  "assets/core/navigation.js",
  "assets/core/runtime.js",
  "assets/services/storage-service.js",
  "assets/core/page-modules.js",
  "assets/services/supabase-service.js",
  "assets/data.js",
  "assets/app.js",
  "sw.js"
]) checkSyntax(file);

for (const page of JSON.parse(read("src/routes.json")).pages) {
  checkSyntax(`assets/pages/${page.route}.js`);
}

const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
record(duplicateIds.length === 0, `${ids.length} unique HTML IDs`, duplicateIds.join(", "));

const tabTags = [...html.matchAll(/<button\b[^>]*class="[^"]*\btab-btn\b[^"]*"[^>]*>/g)].map(match => match[0]);
const tabNames = tabTags.map(tag => tag.match(/data-tab="([^"]+)"/)?.[1]).filter(Boolean);
const panelNames = [...html.matchAll(/id="tab-([^"]+)"[^>]*class="[^"]*\btab-panel\b/g)].map(match => match[1]);
const missingPanels = [...new Set(tabNames)].filter(name => !panelNames.includes(name));
record(missingPanels.length === 0, `${new Set(tabNames).size} tab routes have panels`, missingPanels.join(", "));
record(tabTags.every(tag => /\btype="button"/.test(tag)), "Sidebar navigation buttons use type=button");

const buttonTags = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
const untypedButtons = buttonTags.filter(tag => !/\btype="(?:button|submit|reset)"/.test(tag));
record(untypedButtons.length === 0, `${buttonTags.length} buttons have explicit type`, `${untypedButtons.length} missing`);

const localRefs = [...html.matchAll(/(?:href|src)="((?:assets|manifest)[^"]+)"/g)]
  .map(match => match[1].split("?")[0]);
const missingAssets = [...new Set(localRefs)].filter(ref => !exists(ref));
record(missingAssets.length === 0, "Referenced local assets exist", missingAssets.join(", "));

const imageTags = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
record(imageTags.every(tag => /\balt="[^"]*"/.test(tag)), `${imageTags.length} images include alt text`);

const blankLinks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map(match => match[0]);
const unsafeBlankLinks = blankLinks.filter(tag => !/\brel="[^"]*noopener[^"]*"/.test(tag));
record(unsafeBlankLinks.length === 0, "External new-tab links use rel=noopener");

const scriptSources = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match => match[1].split("?")[0]);
const expectedScriptOrder = [
  "assets/app-config.js",
  "assets/core/routes.js",
  "assets/core/navigation.js",
  "assets/core/runtime.js",
  "assets/services/storage-service.js",
  "assets/core/page-modules.js",
  "assets/pages/beranda.js",
  "assets/pages/pustaka-data.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "assets/supabase-config.js",
  "assets/services/supabase-service.js",
  "assets/data.js",
  "assets/app.js"
];
const scriptOrder = expectedScriptOrder.map(source => scriptSources.indexOf(source));
record(scriptOrder.every((value, index) => value >= 0 && (index === 0 || value > scriptOrder[index - 1])), "Runtime scripts load in safe order", scriptSources.join(" → "));

const appSource = read("assets/app.js");
record(!/\blocalStorage\./.test(appSource), "Application code uses safe storage adapter");
record(!/window\.COFFEE_APP_DEBUG\s*=\s*\{/.test(appSource) || /features\?\.debugTools/.test(appSource), "Debug tools are production-gated");

const configContext = { window: {} };
vm.createContext(configContext);
vm.runInContext(read("assets/app-config.js"), configContext, { filename: "assets/app-config.js" });
const appConfig = configContext.window.COFFEE_APP_CONFIG || {};
record(appConfig.version === "38.0.0", "Application version is 38.0.0", String(appConfig.version || "missing"));
record(appConfig.features?.debugTools === false, "Production debug tools are disabled");
record(appConfig.features?.mascot === false, "Production mascot is disabled");

const packageJson = JSON.parse(read("package.json"));
record(packageJson.version === appConfig.version, "package.json version matches app config", String(packageJson.version || "missing"));
record(html.includes(`v${appConfig.version} · ${appConfig.release}`), "Visible release label matches app config");
record(read("sw.js").includes("coffee-brew-os-v38-services-welcome"), "Service-worker cache name matches v38 release");
record(exists("supabase/schema.sql"), "Canonical Supabase schema exists");
record(exists("supabase/README.md"), "Supabase setup guide exists");

const supabaseContext = { window: {} };
vm.createContext(supabaseContext);
vm.runInContext(read("assets/supabase-config.js"), supabaseContext, { filename: "assets/supabase-config.js" });
const supabaseConfig = supabaseContext.window.SUPABASE_CONFIG || {};
let jwtRole = "";
try {
  const payload = String(supabaseConfig.anonKey || "").split(".")[1];
  jwtRole = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role || "";
} catch {}
record(jwtRole === "anon", "Supabase browser key uses anon role", jwtRole || "unreadable JWT role");
record(!/service_role/i.test(read("assets/supabase-config.js")), "No Supabase service-role key marker in browser config");

const sw = read("sw.js");
const coreAssetBlock = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)?.[1] || "";
const coreAssets = [...coreAssetBlock.matchAll(/"([^"]+)"/g)].map(match => match[1].replace(/^\.\//, ""));
const missingCoreAssets = coreAssets.filter(asset => asset !== "" && !exists(asset));
record(missingCoreAssets.length === 0, `${coreAssets.length} service-worker core assets exist`, missingCoreAssets.join(", "));
for (const critical of [
  "assets/app-config.js",
  "assets/core/routes.js",
  "assets/core/navigation.js",
  "assets/core/runtime.js",
  "assets/services/storage-service.js",
  "assets/core/page-modules.js",
  "assets/styles-v35-1-functional.css",
  "assets/css/welcome.css",
  "assets/services/supabase-service.js",
  "assets/app.js",
  "assets/data.js"
]) {
  record(coreAssets.includes(critical), `Service worker precaches ${critical}`);
}
record(!/catch\([^)]*\)\s*=>\s*caches\.match\("\.\/index\.html"\)/.test(sw), "Asset failures no longer fall back to HTML");

const dataContext = { window: {} };
vm.createContext(dataContext);
vm.runInContext(read("assets/data.js"), dataContext, { filename: "assets/data.js" });
const data = dataContext.window.COFFEE_DATA;
record(Boolean(data), "COFFEE_DATA loads successfully");

for (const [key, field] of Object.entries({
  varieties: "Variety",
  drippers: "DripperName",
  filters: "FilterName",
  processes: "Process",
  roasts: "RoastProfile",
  waters: "Water",
  grinders: "Grinder"
})) {
  const rows = data?.[key] || [];
  const normalized = rows.map(row => String(row[field] || "").trim().toLowerCase());
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  record(duplicates.length === 0, `${key}: ${rows.length} unique records`, [...new Set(duplicates)].join(", "));
}

const accessoryInDrippers = (data?.drippers || []).filter(row =>
  /filter accessory/i.test(String(row.BrewFamily || "")) || /filter paper|paper filter/i.test(String(row.DripperName || ""))
);
record(accessoryInDrippers.length === 0, "Paper filters are not counted as drippers", accessoryInDrippers.map(row => row.DripperName).join(", "));

const expectedCounts = {
  varieties: 180,
  processes: 81,
  drippers: 74,
  filters: 2,
  roasts: 18,
  waters: 15,
  grinders: 16
};
for (const [key, count] of Object.entries(expectedCounts)) {
  record((data?.[key] || []).length === count, `${key} count remains ${count}`, String((data?.[key] || []).length));
}

const report = {
  generatedAt: new Date().toISOString(),
  version: appConfig.version || null,
  summary: {
    pass: results.filter(result => result.status === "PASS").length,
    fail: results.filter(result => result.status === "FAIL").length
  },
  results
};
fs.writeFileSync(path.join(root, "docs/V38_AUDIT_RESULT.json"), JSON.stringify(report, null, 2));
console.log(`\nAudit summary: ${report.summary.pass} passed, ${report.summary.fail} failed.`);
if (failed) process.exit(1);
