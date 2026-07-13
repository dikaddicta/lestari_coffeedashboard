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

const files = [
  "assets/services/security-service.js",
  "assets/services/audit-service.js",
  "assets/css/security-audit.css",
  "supabase/migration_v42_security_audit_rls.sql"
];
files.forEach(file => check(exists(file), `${file} exists`));

for (const file of files.filter(file => file.endsWith(".js"))) {
  const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(syntax.status === 0, `${file} has valid JavaScript syntax`);
}

const storageMap = new Map();
const context = {
  window: {
    COFFEE_SERVICES: {
      storage: {
        readJSON: (_key, fallback) => storageMap.get(_key) ?? fallback,
        writeJSON: (key, value) => { storageMap.set(key, value); return true; }
      }
    }
  },
  navigator: { userAgent: "Security Audit Browser" },
  localStorage: {
    getItem: key => storageMap.get(key) ?? null,
    setItem: (key, value) => storageMap.set(key, value)
  },
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  JSON,
  Map,
  Set,
  Promise
};
vm.createContext(context);
vm.runInContext(read("assets/services/security-service.js"), context, { filename: "security-service.js" });
vm.runInContext(read("assets/services/audit-service.js"), context, { filename: "audit-service.js" });
const security = context.window.COFFEE_SERVICES.security;
const audit = context.window.COFFEE_SERVICES.audit;

check(typeof security?.can === "function", "Security service exposes permission checks");
check(security.can("admin", "members:manage") === true, "Admin can manage workspace members");
check(security.can("brewer", "members:manage") === false, "Brewer cannot manage workspace members");
check(security.can("qa", "moderation:review") === true, "QA can moderate brew and QA data");
check(security.permissionRows().length >= 6, "Permission matrix contains core capabilities");
const sanitized = security.sanitizeMetadata({ token: "secret", password: "secret", safe: "value" });
check(sanitized.token === "[redacted]" && sanitized.password === "[redacted]", "Sensitive metadata keys are redacted");
check(sanitized.safe === "value", "Non-sensitive audit metadata is preserved");
check(typeof audit?.record === "function" && typeof audit?.list === "function", "Audit service exposes record and list methods");

const localEvent = await audit.record({ action: "security.test", category: "security", message: "Local audit test" });
check(localEvent.source === "local", "Audit service provides browser fallback when RPC is unavailable");
check(audit.readLocal().length === 1, "Local audit fallback is persisted");

const shell = read("src/shell.html");
check(shell.includes("assets/css/security-audit.css"), "Security stylesheet is loaded");
check(shell.includes("assets/services/security-service.js"), "Security service is loaded");
check(shell.includes("assets/services/audit-service.js"), "Audit service is loaded");
check(shell.indexOf("security-service.js") < shell.indexOf("audit-service.js"), "Security service loads before audit service");
check(shell.indexOf("audit-service.js") < shell.indexOf("assets/app.js"), "Audit service loads before application code");

const page = read("src/pages/13-akun-role.html");
for (const id of [
  "securityScoreMetric", "securitySessionList", "securityCheckList", "permissionMatrixTable",
  "auditTrailTable", "auditCategoryFilter", "auditSeverityFilter", "auditPeriodFilter",
  "refreshSecuritySessionBtn", "refreshAuditTrail"
]) check(page.includes(`id="${id}"`), `Access page includes ${id}`);
check(!/Access Active|Request Akses Workspace|Tinjaued/.test(page), "Access page avoids translated or inconsistent labels");

const app = read("assets/app.js");
check(app.includes("SECURITY_SERVICE = SERVICES.security"), "Application consumes security service");
check(app.includes("AUDIT_SERVICE = SERVICES.audit"), "Application consumes audit service");
check(app.includes("renderSecurityAuditModule"), "Application exposes security audit page renderer");
check(app.includes('data-workspace-user-action="role"'), "Workspace admin can update member roles");
check(app.includes("Admin aktif terakhir"), "UI protects the last active admin");
check(app.includes("password.length < 8"), "Signup enforces an eight-character password minimum in the client");

const sql = read("supabase/migration_v42_security_audit_rls.sql");
for (const token of [
  "create table if not exists public.audit_events",
  "alter table public.audit_events enable row level security",
  "write_audit_event",
  "protect_last_workspace_admin",
  "Audit events read own or workspace admin",
  "Workspaces read public or member",
  "Suggestions controlled insert",
  "get_workspace_security_summary"
]) check(sql.includes(token), `Security migration contains ${token}`);
check(!/create policy[^;]+audit_events[^;]+for (update|delete)/is.test(sql), "Audit events have no client update or delete policy");
check(sql.includes("revoke insert, update, delete on public.audit_events from anon, authenticated"), "Direct client mutation of audit events is revoked");
check(sql.includes("set search_path = ''"), "New security-definer functions pin an empty search path");
check(sql.includes("(select auth.uid())"), "New RLS policies use explicit authenticated checks");

const config = read("assets/supabase-config.js");
check(!/service[_-]?role/i.test(config), "Browser configuration does not include a service-role key label");
const keyMatches = config.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
check(keyMatches.length <= 1, "Browser configuration exposes at most one public Supabase token");

const sw = read("sw.js");
check(sw.includes("coffee-brew-os-v42-1-landing-route"), "Service worker uses the v42.1 cache name");
check(sw.includes("assets/services/security-service.js") && sw.includes("assets/services/audit-service.js"), "Service worker precaches security services");
check(sw.includes("assets/css/security-audit.css"), "Service worker precaches security styles");

console.log(`\nSecurity audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
