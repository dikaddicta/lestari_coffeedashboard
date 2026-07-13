import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const manifest = JSON.parse(await readFile(path.join(root, "src/routes.json"), "utf8"));
const shell = await readFile(path.join(root, "src/shell.html"), "utf8");
const index = await readFile(path.join(root, "index.html"), "utf8");
const routesJs = await readFile(path.join(root, "assets/core/routes.js"), "utf8");
const appJs = await readFile(path.join(root, "assets/app.js"), "utf8");
const pageFiles = (await readdir(path.join(root, "src/pages"))).filter(file => file.endsWith(".html"));

check("Manifest memiliki 14 halaman", manifest.pages?.length === 14, String(manifest.pages?.length || 0));
check("Folder src/pages memiliki 14 file", pageFiles.length === 14, String(pageFiles.length));
check("Shell memiliki placeholder build", shell.includes("PAGE_CONTENT: generated from src/pages"));
check("Index memuat registry route", index.includes("assets/core/routes.js"));
check("App memakai registry modular", appJs.includes("window.COFFEE_PAGES"));
check("Registry memuat semua route", manifest.pages.every(page => routesJs.includes(`\"route\": \"${page.route}\"`)));

const tabs = new Set();
const routes = new Set();
const sectionIds = new Set();
for (const page of manifest.pages) {
  const fragmentPath = path.join(root, "src", page.file);
  const fragment = await readFile(fragmentPath, "utf8");
  check(`Fragment ${page.route} memiliki section`, fragment.includes(`id="${page.sectionId}"`));
  tabs.add(page.tab);
  routes.add(page.route);
  sectionIds.add(page.sectionId);
  check(`Index memuat ${page.sectionId}`, index.includes(`id="${page.sectionId}"`));
}
check("Tab unik", tabs.size === manifest.pages.length, String(tabs.size));
check("Route unik", routes.size === manifest.pages.length, String(routes.size));
check("Section ID unik", sectionIds.size === manifest.pages.length, String(sectionIds.size));

const passed = checks.filter(item => item.ok).length;
console.log(`Modular pages audit: ${passed}/${checks.length} checks passed.`);
for (const item of checks.filter(item => !item.ok)) console.error(`FAIL ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
