import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
let failed = false;
let passed = 0;

function check(ok, message) {
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${message}`);
  if (ok) passed += 1;
  else failed = true;
}

const serviceFiles = [
  "assets/services/storage-service.js",
  "assets/services/supabase-service.js",
  "assets/services/auth-service.js",
  "assets/services/stock-service.js",
  "assets/services/brew-service.js",
  "assets/services/recommendation-service.js",
  "assets/services/qa-service.js",
  "assets/services/analytics-service.js",
  "assets/services/notification-service.js"
];

for (const file of serviceFiles) {
  check(exists(file), `${file} exists`);
  const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(syntax.status === 0, `${file} has valid JavaScript syntax`);
}

const shell = read("src/shell.html");
check(shell.indexOf("assets/services/storage-service.js") > shell.indexOf("assets/core/runtime.js"), "Storage service loads after runtime");
check(shell.indexOf("assets/services/storage-service.js") < shell.indexOf("assets/app.js"), "Storage service loads before application code");
check(shell.indexOf("assets/services/supabase-service.js") > shell.indexOf("assets/supabase-config.js"), "Supabase service loads after browser configuration");
check(shell.indexOf("assets/services/supabase-service.js") < shell.indexOf("assets/app.js"), "Supabase service loads before application code");

const context = {
  window: {
    localStorage: new Map(),
    sessionStorage: new Map(),
    COFFEE_RUNTIME: {
      storage: {
        get: () => null,
        set: () => true,
        remove: () => true,
        keys: () => [],
        readJSON: (_key, fallback) => fallback,
        writeJSON: () => true
      }
    }
  },
  URL
};
vm.createContext(context);
vm.runInContext(read("assets/services/storage-service.js"), context, { filename: "storage-service.js" });
vm.runInContext(read("assets/services/supabase-service.js"), context, { filename: "supabase-service.js" });
vm.runInContext(read("assets/services/analytics-service.js"), context, { filename: "analytics-service.js" });

const services = context.window.COFFEE_SERVICES || {};
check(Boolean(services.storage), "Storage service registers globally");
check(typeof services.storage?.readJSON === "function", "Storage service exposes JSON helpers");
check(typeof services.storage?.authAdapter?.getItem === "function", "Storage service exposes Supabase auth adapter");
check(Boolean(services.supabase), "Supabase service registers globally");
check(Boolean(services.analytics), "Analytics service registers globally");
check(services.supabase?.getProjectUrl({ url: "https://example.supabase.co" }) === "https://example.supabase.co", "Supabase service validates project URL");
check(services.supabase?.isConfigured({ enabled: true, url: "https://example.supabase.co", anonKey: "anon" }) === true, "Supabase service detects complete configuration");

const app = read("assets/app.js");
check(app.includes("SERVICES.storage || RUNTIME.storage"), "Application consumes storage service with runtime fallback");
check(app.includes("SUPABASE_SERVICE.createClient"), "Application delegates Supabase client creation to service layer");

const welcome = read("assets/css/welcome.css");
check(welcome.includes(".welcome-primary") && welcome.includes(".welcome-guide"), "Welcome layout has dedicated modular stylesheet");
check(!read("assets/styles-v35-quiet-luxury.css").includes(".welcome-screen__card"), "Legacy visual stylesheet no longer owns welcome layout");

console.log(`\nService-layer audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
