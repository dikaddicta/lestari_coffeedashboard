import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const results = [];
let passed = 0;
let failed = 0;

function check(condition, label, detail = "") {
  const item = { status: condition ? "pass" : "fail", label, detail };
  results.push(item);
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map(char => char + char).join("") : value;
  return [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  return hexToRgb(hex)
    .map(value => value / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const [css, siteRaw, notFoundHtml, quietCss] = await Promise.all([
  readFile(path.join(root, "assets/css/public-pages.css"), "utf8"),
  readFile(path.join(root, "src/site.json"), "utf8"),
  readFile(path.join(root, "404.html"), "utf8"),
  readFile(path.join(root, "assets/styles-v35-quiet-luxury.css"), "utf8")
]);
const site = JSON.parse(siteRaw);
const publicSources = await Promise.all([
  "404.html",
  "maintenance.html",
  "rilis.html",
  "status.html"
].map(async file => ({ file, html: await readFile(path.join(root, "src/public", file), "utf8") })));

check(css.includes(".public-article .public-actions .button-link:not(.secondary)"), "Primary public CTA has a higher-specificity text rule");
check(css.includes("color:#fff;"), "Primary public CTA declares light text");
check(css.includes(".public-article .public-actions .secondary"), "Secondary public CTA has an explicit surface rule");
check(css.includes("outline:3px solid rgba(155,107,63,.28)"), "Public CTA keyboard focus is visible");
check(css.includes("min-height:44px"), "Public CTA meets the 44px touch target baseline");

const primaryRatio = contrastRatio("#ffffff", "#1f1d1a");
const secondaryRatio = contrastRatio("#1f1d1a", "#ffffff");
const articleLinkRatio = contrastRatio("#76491f", "#fffdfa");
check(primaryRatio >= 4.5, "Primary CTA contrast meets WCAG AA", primaryRatio.toFixed(2));
check(secondaryRatio >= 4.5, "Secondary CTA contrast meets WCAG AA", secondaryRatio.toFixed(2));
check(articleLinkRatio >= 4.5, "Inline public link contrast meets WCAG AA", articleLinkRatio.toFixed(2));

for (const { file, html } of publicSources) {
  const actionAnchors = [...html.matchAll(/<a\s+class="([^"]*button-link[^"]*)"[^>]*>([^<]+)<\/a>/g)];
  check(actionAnchors.length > 0, `${file} action links use the shared button-link component`, `${actionAnchors.length} action(s)`);
  for (const match of actionAnchors) {
    const classes = match[1].split(/\s+/);
    const text = match[2].trim();
    check(classes.includes("button-link"), `${file}: ${text} keeps the button-link class`);
  }
}

const expectedBase = new URL(site.siteUrl).pathname;
const baseMatch = notFoundHtml.match(/<base href="([^"]+)"/);
check(Boolean(baseMatch), "Generated 404 includes a base URL");
check(baseMatch?.[1] === expectedBase, "404 assets and links resolve from the project root", baseMatch?.[1] || "missing");
check(notFoundHtml.includes('href="status/"'), "404 status action resolves through the project-root base");
check(notFoundHtml.includes('href="./"'), "404 dashboard action resolves through the project-root base");

check(/button\.primary,[\s\S]*?\.primary\s*\{[\s\S]*?color:\s*#fff\s*!important/.test(quietCss), "Dashboard primary buttons retain light text on dark surfaces");
check(/button\.secondary,[\s\S]*?\.secondary,[\s\S]*?\.file-button\s*\{[\s\S]*?background:\s*#fff\s*!important/.test(quietCss), "Dashboard secondary actions retain dark text on light surfaces");

const emailFiles = ["confirmation.html", "magic-link.html", "password-reset.html"];
for (const file of emailFiles) {
  const html = await readFile(path.join(root, "docs/email-templates", file), "utf8");
  check(/background:#1f1d1a;color:#fff/.test(html), `${file} CTA uses light text on the dark button`);
}

const report = {
  version: site.version,
  build: site.build,
  passed,
  failed,
  results
};
await writeFile(path.join(root, "docs", "V44_RC2_VISUAL_AUDIT_RESULT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`\nVisual contrast audit: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
