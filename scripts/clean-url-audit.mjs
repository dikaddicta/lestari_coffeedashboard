import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "src/routes.json"), "utf8"));
const navigation = await readFile(path.join(root, "assets/core/navigation.js"), "utf8");
const index = await readFile(path.join(root, "index.html"), "utf8");
const notFound = await readFile(path.join(root, "404.html"), "utf8");
const webManifest = JSON.parse(await readFile(path.join(root, "manifest.webmanifest"), "utf8"));
const failures = [];
let checks = 0;

function check(condition, label) {
  checks += 1;
  if (!condition) failures.push(label);
}

check(index.includes('<base href="./"'), "Root index harus memakai base ./");
check(index.includes('data-initial-route=""'), "Root index harus memiliki initial route kosong");
check(!index.includes("{{BASE_HREF}}") && !index.includes("{{INITIAL_ROUTE}}"), "Root index tidak boleh menyisakan placeholder");
check(notFound.includes('<base href="./"'), "404 fallback harus menunjuk ke root assets");
check(navigation.includes("pushState") && navigation.includes("replaceState"), "Navigation module harus memakai History API");
check(navigation.includes("legacy-hash-migration"), "Navigation module harus memigrasikan hash route lama");
check(webManifest.start_url === "./", "PWA start_url harus membuka landing page root");
check((webManifest.shortcuts || []).every(item => !String(item.url || "").includes("#")), "PWA shortcuts tidak boleh memakai hash route");

for (const page of manifest.pages || []) {
  const routePath = path.join(root, page.route, "index.html");
  let html = "";
  try {
    await stat(routePath);
    html = await readFile(routePath, "utf8");
    check(true, `Route ${page.route} tersedia`);
  } catch {
    check(false, `Route ${page.route} tersedia`);
    continue;
  }
  check(html.includes('<base href="../"'), `${page.route} memakai base ../`);
  check(html.includes(`data-initial-route="${page.route}"`), `${page.route} memiliki initial route`);
  check(!html.includes("{{BASE_HREF}}") && !html.includes("{{INITIAL_ROUTE}}"), `${page.route} bebas placeholder`);
}

console.log(`Clean URL audit: ${checks - failures.length}/${checks} checks passed.`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
