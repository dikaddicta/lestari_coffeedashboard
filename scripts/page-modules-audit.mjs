import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "src/routes.json"), "utf8"));
const app = await readFile(path.join(root, "assets/app.js"), "utf8");
const shell = await readFile(path.join(root, "src/shell.html"), "utf8");
const registry = await readFile(path.join(root, "assets/core/page-modules.js"), "utf8");
const pageFiles = (await readdir(path.join(root, "assets/pages"))).filter(file => file.endsWith(".js"));
const failures = [];
let checks = 0;

function check(condition, label) {
  checks += 1;
  if (!condition) failures.push(label);
}

check(pageFiles.length === manifest.pages.length, `Jumlah page module harus ${manifest.pages.length}, ditemukan ${pageFiles.length}`);
check(registry.includes("function register") && registry.includes("function activate"), "Registry page module harus memiliki register dan activate");
check(app.includes("PAGE_MODULES?.activate") && app.includes("PAGE_RENDERERS"), "App harus mengaktifkan page module dan renderer map");
check(app.includes("renderPageModule(name)"), "Navigasi harus merender modul halaman aktif");

for (const page of manifest.pages || []) {
  const moduleFile = path.join(root, "assets/pages", `${page.route}.js`);
  let source = "";
  try {
    source = await readFile(moduleFile, "utf8");
    check(true, `Module ${page.route} tersedia`);
  } catch {
    check(false, `Module ${page.route} tersedia`);
    continue;
  }
  check(source.includes(`tab: "${page.tab}"`), `Module ${page.route} terhubung ke tab ${page.tab}`);
  check(shell.includes(`assets/pages/${page.route}.js`), `Shell memuat module ${page.route}`);
}

console.log(`Page modules audit: ${checks - failures.length}/${checks} checks passed.`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
