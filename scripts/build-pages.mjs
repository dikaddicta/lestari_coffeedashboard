import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcDir = path.join(root, "src");
const shellPath = path.join(srcDir, "shell.html");
const manifestPath = path.join(srcDir, "routes.json");
const sitePath = path.join(srcDir, "site.json");
const outputPath = path.join(root, "index.html");
const notFoundPath = path.join(root, "404.html");
const routesOutputPath = path.join(root, "assets", "core", "routes.js");
const pagePlaceholder = "<!-- PAGE_CONTENT: generated from src/pages via npm run build -->";
const basePlaceholder = "{{BASE_HREF}}";
const routePlaceholder = "{{INITIAL_ROUTE}}";
const titlePlaceholder = "{{DOCUMENT_TITLE}}";
const descriptionPlaceholder = "{{DOCUMENT_DESCRIPTION}}";
const canonicalPlaceholder = "{{CANONICAL_URL}}";


function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jsString(value) {
  return JSON.stringify(value, null, 2);
}

function renderDocument(shell, pageContent, site, { baseHref, initialRoute, title, description, canonicalUrl }) {
  const socialImageUrl = new URL(site.socialImage, site.siteUrl).toString();
  return shell
    .replace(pagePlaceholder, `${pagePlaceholder}\n${pageContent}`)
    .replaceAll(basePlaceholder, baseHref)
    .replaceAll(routePlaceholder, initialRoute || "")
    .replaceAll(titlePlaceholder, title || `${site.productName} — Dashboard Seduh Kopi`)
    .replaceAll(descriptionPlaceholder, description || "Dashboard seduh kopi untuk rekomendasi resep, pencatatan, QA, analitik, laporan, dan pustaka data berbasis referensi.")
    .replaceAll(canonicalPlaceholder, canonicalUrl || site.siteUrl)
    .replaceAll("{{THEME_COLOR}}", site.themeColor)
    .replaceAll("{{PRODUCT_NAME}}", site.productName)
    .replaceAll("{{BRAND_NAME}}", site.brandName)
    .replaceAll("{{TAGLINE}}", site.tagline)
    .replaceAll("{{SOCIAL_IMAGE_URL}}", socialImageUrl)
    .replaceAll("{{ICON_PATH}}", site.icon)
    .replaceAll("{{LOGO_PATH}}", site.logo || site.icon)
    .replaceAll("{{FAVICON_16_PATH}}", site.favicon16 || site.icon)
    .replaceAll("{{FAVICON_32_PATH}}", site.favicon32 || site.icon)
    .replaceAll("{{FAVICON_ICO_PATH}}", site.faviconIco || site.icon)
    .replaceAll("{{APPLE_TOUCH_ICON_PATH}}", site.appleTouchIcon || site.icon)
    .replaceAll("{{ASSET_VERSION}}", site.build)
    .replaceAll("{{LEGAL_VERSION}}", site.legalVersion || "1.0");
}

async function main() {
  const [shell, manifestRaw, siteRaw] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(manifestPath, "utf8"),
    readFile(sitePath, "utf8")
  ]);
  const manifest = JSON.parse(manifestRaw);
  const site = JSON.parse(siteRaw);
  const pages = [...(manifest.pages || [])].sort((a, b) => a.order - b.order);

  assert(shell.includes(pagePlaceholder), `Placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(shell.includes(basePlaceholder), `Base placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(shell.includes(routePlaceholder), `Route placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(shell.includes(titlePlaceholder), `Title placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(shell.includes(descriptionPlaceholder), `Description placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(shell.includes(canonicalPlaceholder), `Canonical placeholder tidak ditemukan di ${path.relative(root, shellPath)}.`);
  assert(pages.length > 0, "Manifest halaman kosong.");

  const seenTabs = new Set();
  const seenRoutes = new Set();
  const seenSections = new Set();
  const fragments = [];

  for (const page of pages) {
    assert(page.tab && page.route && page.sectionId && page.file, "Manifest halaman tidak lengkap.");
    assert(!seenTabs.has(page.tab), `Tab duplikat: ${page.tab}`);
    assert(!seenRoutes.has(page.route), `Route duplikat: ${page.route}`);
    assert(!seenSections.has(page.sectionId), `Section ID duplikat: ${page.sectionId}`);
    seenTabs.add(page.tab);
    seenRoutes.add(page.route);
    seenSections.add(page.sectionId);

    const fragmentPath = path.join(srcDir, page.file);
    const fragment = (await readFile(fragmentPath, "utf8")).trim();
    assert(fragment.includes(`id="${page.sectionId}"`), `${page.file} tidak memuat ${page.sectionId}.`);
    assert(fragment.startsWith("<section"), `${page.file} harus diawali elemen <section>.`);
    fragments.push(fragment);
  }

  const pageContent = fragments
    .map(fragment => fragment.split("\n").map(line => `          ${line}`).join("\n"))
    .join("\n\n");

  const rootHtml = renderDocument(shell, pageContent, site, {
    baseHref: "./",
    initialRoute: "",
    title: `${site.productName} — Dashboard Seduh Kopi`,
    description: site.description,
    canonicalUrl: site.siteUrl
  });
  await writeFile(outputPath, rootHtml, "utf8");

  for (const page of pages) {
    const routeDir = path.join(root, page.route);
    await rm(routeDir, { recursive: true, force: true });
    await mkdir(routeDir, { recursive: true });
    const routeHtml = renderDocument(shell, pageContent, site, {
      baseHref: "../",
      initialRoute: page.route,
      title: `${page.title} — ${site.productName}`,
      description: page.subtitle,
      canonicalUrl: new URL(`${page.route}/`, site.siteUrl).toString()
    });
    await writeFile(path.join(routeDir, "index.html"), routeHtml, "utf8");
  }

  const routes = pages.map(({ order, tab, route, sectionId, title, subtitle, access }) => ({
    order,
    tab,
    route,
    sectionId,
    title,
    subtitle,
    access
  }));

  const routesJs = `(function () {\n  "use strict";\n\n  const pages = ${jsString(routes)};\n  const byTab = Object.fromEntries(pages.map(page => [page.tab, Object.freeze({ ...page })]));\n  const byRoute = Object.fromEntries(pages.map(page => [page.route, byTab[page.tab]]));\n\n  window.COFFEE_PAGES = Object.freeze({\n    version: ${JSON.stringify(site.version || manifest.version || "0.0.0")},\n    pages: Object.freeze(pages.map(page => byTab[page.tab])),\n    byTab: Object.freeze(byTab),\n    byRoute: Object.freeze(byRoute),\n    routeFor(tab) {\n      return byTab[String(tab || "")]?.route || "cara-pakai";\n    },\n    tabFor(route) {\n      return byRoute[String(route || "").toLowerCase()]?.tab || "";\n    },\n    metaFor(tab) {\n      const page = byTab[String(tab || "")] || byTab.home || pages[0];\n      return Object.freeze({ title: page.title, subtitle: page.subtitle });\n    }\n  });\n})();\n`;
  await writeFile(routesOutputPath, routesJs, "utf8");

  console.log(`Built ${pages.length} modular pages into index.html.`);
  console.log(`Generated ${pages.length} clean URL entry points and 404 fallback.`);
  console.log(`Generated route registry: ${path.relative(root, routesOutputPath)}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
