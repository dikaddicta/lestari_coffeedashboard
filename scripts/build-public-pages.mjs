import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const src = path.join(root, "src");
const [shell, manifestRaw, siteRaw] = await Promise.all([
  readFile(path.join(src, "public-shell.html"), "utf8"),
  readFile(path.join(src, "public-pages.json"), "utf8"),
  readFile(path.join(src, "site.json"), "utf8")
]);
const manifest = JSON.parse(manifestRaw);
const site = JSON.parse(siteRaw);
const marker = "<!-- PUBLIC_PAGE_CONTENT -->";

function render(content, page, baseHref = "../") {
  const canonical = new URL(`${page.slug}/`, site.siteUrl).toString();
  const script = page.script ? `<script src="${page.script}?v=${site.build}"></script>` : "";
  return shell
    .replace(marker, `${marker}\n${content}`)
    .replaceAll("{{BASE_HREF}}", baseHref)
    .replaceAll("{{DOCUMENT_TITLE}}", page.title.replaceAll("Coffee Brew OS", site.productName))
    .replaceAll("{{DOCUMENT_DESCRIPTION}}", page.description)
    .replaceAll("{{ROBOTS}}", page.robots || "index,follow")
    .replaceAll("{{CANONICAL_URL}}", canonical)
    .replaceAll("{{PAGE_SLUG}}", page.slug)
    .replaceAll("{{PAGE_SCRIPT}}", script)
    .replaceAll("{{THEME_COLOR}}", site.themeColor)
    .replaceAll("{{PRODUCT_NAME}}", site.productName)
    .replaceAll("{{BRAND_NAME}}", site.brandName)
    .replaceAll("{{TAGLINE}}", site.tagline)
    .replaceAll("{{SOCIAL_IMAGE_URL}}", new URL(site.socialImage, site.siteUrl).toString())
    .replaceAll("{{ICON_PATH}}", site.icon)
    .replaceAll("{{LOGO_PATH}}", site.logo || site.icon)
    .replaceAll("{{FAVICON_16_PATH}}", site.favicon16 || site.icon)
    .replaceAll("{{FAVICON_32_PATH}}", site.favicon32 || site.icon)
    .replaceAll("{{FAVICON_ICO_PATH}}", site.faviconIco || site.icon)
    .replaceAll("{{APPLE_TOUCH_ICON_PATH}}", site.appleTouchIcon || site.icon)
    .replaceAll("{{ASSET_VERSION}}", site.build)
    .replaceAll("{{LEGAL_VERSION}}", site.legalVersion || "1.0");
}

for (const page of manifest.pages) {
  const content = (await readFile(path.join(src, page.file), "utf8")).trim();
  const outDir = path.join(root, page.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), render(content, page), "utf8");
}

const notFound = (await readFile(path.join(src, "public/404.html"), "utf8")).trim();
// GitHub Pages serves 404.html while preserving the unknown URL in the address bar.
// An absolute project-root base keeps CSS, scripts, and action links valid even for
// deeply nested missing paths such as /foo/bar/baz/.
const notFoundBaseHref = new URL(site.siteUrl).pathname;
const notFoundHtml = render(notFound, {
  slug: "404",
  title: `Halaman Tidak Ditemukan — ${site.productName}`,
  description: "Halaman yang diminta tidak tersedia.",
  robots: "noindex,nofollow"
}, notFoundBaseHref);
await writeFile(path.join(root, "404.html"), notFoundHtml, "utf8");
// Keep an explicit /404/ route too. GitHub Pages uses root 404.html for unknown
// paths, while this alias makes direct links and local smoke tests deterministic.
await mkdir(path.join(root, "404"), { recursive: true });
await writeFile(path.join(root, "404", "index.html"), notFoundHtml, "utf8");
// Disable Jekyll processing so generated folders and assets are served verbatim.
await writeFile(path.join(root, ".nojekyll"), "", "utf8");

const sitemapUrls = [
  site.siteUrl,
  ...JSON.parse(await readFile(path.join(src, "routes.json"), "utf8")).pages
    .filter(page => page.access === "public")
    .map(page => new URL(`${page.route}/`, site.siteUrl).toString()),
  ...manifest.pages
    .filter(page => (page.robots || "").startsWith("index"))
    .map(page => new URL(`${page.slug}/`, site.siteUrl).toString())
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(sitemapUrls)].map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(root, "sitemap.xml"), sitemap, "utf8");
await writeFile(path.join(root, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${new URL("sitemap.xml", site.siteUrl)}\n`, "utf8");

console.log(`Built ${manifest.pages.length} public release pages, resilient 404 routes, .nojekyll, robots.txt, and sitemap.xml.`);
