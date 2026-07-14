import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
let failed = false;
let passed = 0;

function check(condition, label, detail = "") {
  const ok = Boolean(condition);
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed = true;
}

for (const file of [
  "assets/services/error-service.js",
  "assets/services/backup-service.js",
  "assets/core/maintenance.js",
  "assets/public/status-page.js",
  "assets/public/maintenance-page.js",
  "scripts/build-public-pages.mjs",
  "scripts/build-all.mjs"
]) {
  check(exists(file), `${file} tersedia`);
  const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(syntax.status === 0, `${file} valid secara sintaks`, (syntax.stderr || "").trim());
}

const config = read("assets/app-config.js");
check(config.includes('\"version\": \"44.0.0-rc.1\"'), "Versi aplikasi v44.0.0-rc.1");
check(config.includes('"maintenance": {'), "Konfigurasi maintenance tersedia");
check(config.includes('"commercialReadiness": true'), "Feature flag commercial readiness aktif");

for (const slug of ["privasi", "ketentuan", "disclaimer", "status", "maintenance"]) {
  const file = `${slug}/index.html`;
  check(exists(file), `Halaman /${slug}/ tersedia`);
  const html = exists(file) ? read(file) : "";
  check(html.includes('<link rel="canonical"'), `/${slug}/ memiliki canonical URL`);
  check(!html.includes("{{"), `/${slug}/ bebas placeholder build`);
}

const index = read("index.html");
check(index.includes('href="privasi/"'), "Landing page menampilkan link privasi");
check(index.includes('href="ketentuan/"'), "Landing page menampilkan link ketentuan");
check(index.includes('id="signupConsent"'), "Form daftar memiliki persetujuan kebijakan");
check(index.includes('id="createSecureBackupBtn"'), "Pusat laporan memiliki backup terverifikasi");
check(index.includes('id="restoreBackupBtn"'), "Pusat laporan memiliki pemulihan backup");
check(index.includes('id="downloadDiagnosticsBtn"'), "Panel keamanan memiliki ekspor diagnostik");
check(index.includes('assets/services/error-service.js'), "Error service dimuat oleh dashboard");
check(index.includes('assets/services/backup-service.js'), "Backup service dimuat oleh dashboard");

const app = read("assets/app.js");
check(app.includes("legal_consent_version"), "Versi persetujuan legal disimpan saat daftar");
check(app.includes("BACKUP_SERVICE.create"), "Ekspor menggunakan backup service");
check(app.includes("BACKUP_SERVICE.parse"), "Pemulihan memvalidasi backup");
check(app.includes("ERROR_SERVICE?.capture"), "Runtime error dicatat secara tersanitasi");

const sw = read("sw.js");
check(sw.includes("coffee-brew-os-v44-rc1"), "Cache PWA menggunakan namespace v44 RC1");
for (const route of ["privasi", "ketentuan", "disclaimer", "status", "maintenance"]) {
  check(sw.includes(`"${route}"`), `Service worker memuat route /${route}/`);
}
for (const asset of [
  "./assets/services/error-service.js", "./assets/services/backup-service.js",
  "./assets/css/commercial-readiness.css", "./assets/css/public-pages.css"
]) check(sw.includes(asset), `Service worker memuat ${asset}`);

check(exists("robots.txt"), "robots.txt tersedia");
check(exists("sitemap.xml"), "sitemap.xml tersedia");
check(exists(".well-known/security.txt"), "security.txt tersedia");
check(read("robots.txt").includes("sitemap.xml"), "robots.txt menunjuk sitemap");
check(read("sitemap.xml").includes("/privasi/"), "Sitemap memuat kebijakan privasi");
check(read(".well-known/security.txt").includes("Contact:"), "security.txt memiliki jalur kontak");

console.log(`\nCommercial readiness audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
