import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const checks = [];
let failed = false;

function check(condition, label, detail = "") {
  const ok = Boolean(condition);
  checks.push({ ok, label, detail });
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function pngSize(file) {
  const buffer = fs.readFileSync(path.join(root, file));
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const file of [
  "src/site.json",
  "scripts/build-release.mjs",
  "assets/services/release-service.js",
  "assets/services/monitoring-service.js",
  "assets/public/release-page.js",
  "assets/social-preview.png",
  "release.json",
  "docs/V44_PRODUCTION_DEPLOYMENT.md",
  "docs/V44_SUPABASE_EMAIL_SETUP.md",
  "docs/V44_DATABASE_BACKUP_RUNBOOK.md",
  "docs/email-templates/confirmation.html",
  "docs/email-templates/password-reset.html",
  "docs/email-templates/magic-link.html"
]) check(exists(file), `${file} tersedia`);

for (const file of [
  "scripts/build-release.mjs",
  "assets/services/release-service.js",
  "assets/services/monitoring-service.js",
  "assets/public/release-page.js"
]) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(result.status === 0, `${file} valid secara sintaks`, (result.stderr || "").trim());
}

const site = JSON.parse(read("src/site.json"));
const release = JSON.parse(read("release.json"));
const packageJson = JSON.parse(read("package.json"));
const manifest = JSON.parse(read("manifest.webmanifest"));
check(site.version === "44.0.0-rc.1", "Versi sumber adalah v44.0.0-rc.1");
check(packageJson.version === site.version, "Versi package sinkron dengan site config");
check(release.version === site.version && release.build === site.build, "Release manifest sinkron dengan site config");
check(release.releaseStage === "candidate", "Release manifest menandai tahap candidate");
check(/^https:\/\//.test(site.siteUrl), "Site URL menggunakan HTTPS");
check(site.siteUrl.endsWith("/"), "Site URL memiliki trailing slash");
check(manifest.id === site.siteUrl, "PWA manifest memakai site identity final");
check(manifest.start_url === "./" && manifest.scope === "./", "PWA mulai dari landing root");

const image = pngSize("assets/social-preview.png");
check(image?.width === 1200 && image?.height === 630, "Social preview berukuran 1200×630", image ? `${image.width}×${image.height}` : "invalid PNG");

for (const file of ["index.html", "beranda/index.html", "cara-pakai/index.html", "privasi/index.html", "status/index.html", "rilis/index.html"]) {
  check(exists(file), `${file} tersedia`);
  const html = exists(file) ? read(file) : "";
  check(html.includes('property="og:image"'), `${file} memiliki Open Graph image`);
  check(html.includes('name="twitter:card" content="summary_large_image"'), `${file} memiliki Twitter card`);
  check(html.includes('rel="canonical"'), `${file} memiliki canonical URL`);
  check(!html.includes("{{"), `${file} bebas placeholder build`);
}

const index = read("index.html");
check(index.includes("assets/services/release-service.js"), "Dashboard memuat release service");
check(index.includes("assets/services/monitoring-service.js"), "Dashboard memuat monitoring service");
check(index.includes("v44.0.0-rc.1 · Release Candidate 1"), "Label release candidate terlihat dan sinkron");
check(index.includes('href="rilis/"'), "Landing atau shell menautkan catatan rilis");

const publicShell = read("src/public-shell.html");
check(publicShell.includes('href="rilis/"'), "Navigasi publik menautkan catatan rilis");

const appConfig = read("assets/app-config.js");
check(appConfig.includes('"version": "44.0.0-rc.1"'), "Runtime config menggunakan v44 RC1");
check(appConfig.includes('"releaseCandidate": true'), "Feature flag release candidate aktif");
check(appConfig.includes('"enabled": false'), "Monitoring cloud default nonaktif");

const monitoring = read("assets/services/monitoring-service.js");
check(monitoring.includes("disabled-or-unavailable"), "Monitoring menghormati kondisi nonaktif");
check(monitoring.includes("errors?.redact"), "Monitoring menggunakan sanitasi diagnostik");
check(!monitoring.includes("localStorage"), "Monitoring tidak membaca data workspace langsung");

const sw = read("sw.js");
check(sw.includes("coffee-brew-os-v44-rc1"), "Service worker memakai cache v44 RC1");
for (const asset of [
  "./assets/services/release-service.js",
  "./assets/services/monitoring-service.js",
  "./assets/social-preview.png",
  "./release.json",
  "./assets/public/release-page.js"
]) check(sw.includes(asset), `Service worker memuat ${asset}`);
check(sw.includes('"rilis"'), "Service worker memuat route /rilis/");
check(!sw.includes("v43-commercial-readiness"), "Cache v43 tidak tersisa");

check(!exists("CNAME"), "Custom domain belum diaktifkan tanpa keputusan domain final");
check(read("docs/V44_PRODUCTION_DEPLOYMENT.md").toLowerCase().includes("release candidate"), "Panduan deployment menjelaskan status release candidate");
check(read("docs/V44_DATABASE_BACKUP_RUNBOOK.md").includes("tidak menggantikan backup database"), "Runbook membedakan backup lokal dan database");
for (const file of ["confirmation.html", "password-reset.html", "magic-link.html"]) {
  const html = read(`docs/email-templates/${file}`);
  check(html.includes("{{ .ConfirmationURL }}"), `${file} mempertahankan variabel Supabase`);
  check(!/service[_-]?role|api[_-]?key|password\s*[:=]/i.test(html), `${file} tidak memuat secret`);
}

const report = {
  version: site.version,
  generatedAt: new Date().toISOString(),
  passed: checks.filter(item => item.ok).length,
  failed: checks.filter(item => !item.ok).length,
  checks
};
fs.writeFileSync(path.join(root, "docs", "V44_RC_AUDIT_RESULT.json"), JSON.stringify(report, null, 2));
console.log(`\nRelease candidate audit: ${report.passed} passed, ${report.failed} failed.`);
if (failed) process.exit(1);
