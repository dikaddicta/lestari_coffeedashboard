import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = JSON.parse(await readFile(path.join(root, "src", "site.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const key of ["version", "release", "build", "siteUrl", "productName", "brandName", "description", "themeColor", "backgroundColor", "socialImage", "icon", "logo"]) {
  assert(String(source[key] || "").trim(), `src/site.json: ${key} wajib diisi.`);
}
assert(/^https:\/\//.test(source.siteUrl), "src/site.json: siteUrl harus menggunakan HTTPS.");
assert(source.siteUrl.endsWith("/"), "src/site.json: siteUrl harus diakhiri garis miring.");

const commit = String(process.env.GITHUB_SHA || process.env.COFFEE_BUILD_COMMIT || "not-recorded").slice(0, 12);
const features = Object.freeze({
  mascot: false,
  demoExperience: true,
  pwa: true,
  debugTools: false,
  modularPages: true,
  modularScripts: true,
  cleanUrls: true,
  serviceLayer: true,
  refinedWelcome: true,
  coreWorkflowModules: true,
  workflowValidation: true,
  recommendationEngine: true,
  qaDiagnostics: true,
  analyticsInsight: true,
  costPerCup: true,
  securityHardening: true,
  auditTrail: true,
  roleManagement: true,
  commercialReadiness: true,
  legalPages: true,
  verifiedBackup: true,
  diagnostics: true,
  maintenanceMode: true,
  releaseCandidate: true,
  brandedMetadata: true,
  releaseManifest: true,
  productionMonitoring: true
});

const runtimeConfig = {
  version: source.version,
  release: source.release,
  build: source.build,
  commit,
  releasedAt: source.releasedAt,
  environment: source.environment || "production",
  site: {
    url: source.siteUrl,
    productName: source.productName,
    brandName: source.brandName,
    applicationName: source.applicationName || source.productName,
    tagline: source.tagline,
    description: source.description,
    socialImage: new URL(source.socialImage, source.siteUrl).toString(),
    supportUrl: new URL(source.supportPath || "saran/", source.siteUrl).toString(),
    legalVersion: source.legalVersion || "1.0"
  },
  monitoring: {
    enabled: Boolean(source.monitoring?.enabled),
    endpoint: String(source.monitoring?.endpoint || ""),
    sampleRate: Math.min(1, Math.max(0, Number(source.monitoring?.sampleRate ?? 1))),
    timeoutMs: Math.min(15000, Math.max(1000, Number(source.monitoring?.timeoutMs ?? 5000)))
  },
  maintenance: {
    enabled: Boolean(source.maintenance?.enabled),
    title: source.maintenance?.title || "Pemeliharaan terjadwal",
    message: source.maintenance?.message || "Beberapa fitur untuk sementara tidak tersedia."
  },
  features
};

const configJs = `(function () {\n  "use strict";\n\n  function deepFreeze(value) {\n    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;\n    Object.values(value).forEach(deepFreeze);\n    return Object.freeze(value);\n  }\n\n  window.COFFEE_APP_CONFIG = deepFreeze(${JSON.stringify(runtimeConfig, null, 2)});\n})();\n`;
await writeFile(path.join(root, "assets", "app-config.js"), configJs, "utf8");

const releaseManifest = {
  schemaVersion: 1,
  product: source.productName,
  brand: source.brandName,
  version: source.version,
  release: source.release,
  build: source.build,
  commit,
  releasedAt: source.releasedAt,
  environment: source.environment || "production",
  siteUrl: source.siteUrl,
  statusUrl: new URL("status/", source.siteUrl).toString(),
  supportUrl: new URL(source.supportPath || "saran/", source.siteUrl).toString(),
  legalVersion: source.legalVersion || "1.0",
  databaseMigration: "v42_security_audit_rls",
  releaseStage: "candidate"
};
await writeFile(path.join(root, "release.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");

const manifest = {
  id: source.siteUrl,
  name: `${source.productName} — ${source.brandName}`,
  short_name: source.productName,
  description: source.description,
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: source.backgroundColor,
  theme_color: source.themeColor,
  orientation: "any",
  icons: [
    { src: source.icon192 || source.icon, sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: source.icon512 || source.icon, sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ],
  categories: ["productivity", "food", "utilities"],
  lang: "id",
  shortcuts: [
    { name: "Rekomendasi Seduh", short_name: "Brew", description: "Buka modul rekomendasi seduh.", url: "./rekomendasi-seduh/", icons: [{ src: source.icon192 || source.icon, sizes: "192x192", type: "image/png" }] },
    { name: "Pustaka Data", short_name: "Pustaka", description: "Buka knowledge base kopi.", url: "./pustaka-data/", icons: [{ src: source.icon192 || source.icon, sizes: "192x192", type: "image/png" }] }
  ]
};
await writeFile(path.join(root, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await mkdir(path.join(root, ".well-known"), { recursive: true });
const expiry = new Date(source.releasedAt || Date.now());
expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
const security = [
  `Contact: ${new URL(source.supportPath || "saran/", source.siteUrl)}`,
  `Expires: ${expiry.toISOString()}`,
  "Preferred-Languages: id, en",
  `Canonical: ${new URL(source.securityPath || ".well-known/security.txt", source.siteUrl)}`,
  `Policy: ${new URL("ketentuan/", source.siteUrl)}`,
  `Acknowledgments: ${new URL("status/", source.siteUrl)}`,
  ""
].join("\n");
await writeFile(path.join(root, ".well-known", "security.txt"), security, "utf8");

console.log(`Built release metadata ${source.version} (${source.build}).`);
