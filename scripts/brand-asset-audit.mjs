import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file));
const text = file => read(file).toString("utf8");
const exists = file => fs.existsSync(path.join(root, file));
const checks = [];
let failed = false;
const check = (ok,label,detail="") => { checks.push({ok:Boolean(ok),label,detail}); if(!ok) failed=true; console[ok?"log":"error"](`${ok?"PASS":"FAIL"}: ${label}${detail?` — ${detail}`:""}`); };
const pngSize = file => { const b=read(file); return b.toString("ascii",1,4)==="PNG" ? {width:b.readUInt32BE(16),height:b.readUInt32BE(20)} : null; };

const required=[
  "assets/brand/lestari-logo-original.png",
  "assets/brand/lestari-logo.png",
  "assets/icons/favicon-16x16.png",
  "assets/icons/favicon-32x32.png",
  "assets/icons/favicon-48x48.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "favicon.ico",
  "assets/css/brand.css"
];
required.forEach(file=>check(exists(file),`${file} tersedia`));
const expected={
  "assets/icons/favicon-16x16.png":[16,16],
  "assets/icons/favicon-32x32.png":[32,32],
  "assets/icons/favicon-48x48.png":[48,48],
  "assets/icons/apple-touch-icon.png":[180,180],
  "assets/icons/icon-192.png":[192,192],
  "assets/icons/icon-512.png":[512,512]
};
for(const [file,[w,h]] of Object.entries(expected)){ const size=pngSize(file); check(size?.width===w&&size?.height===h,`${file} berukuran ${w}×${h}`,size?`${size.width}×${size.height}`:"invalid"); }
const site=JSON.parse(text("src/site.json"));
check(site.productName==="Lestari Coffee Dashboard","Nama produk final terpasang");
check(site.brandName==="Lestari","Nama singkat terpasang");
check(site.logo==="assets/brand/lestari-logo.png","Path logo utama terpusat");
const index=text("index.html");
check(index.includes("assets/brand/lestari-logo.png"),"Dashboard memakai logo Lestari");
check(index.includes("assets/icons/favicon-16x16.png"),"Dashboard memakai favicon 16 px");
check(index.includes("assets/icons/favicon-32x32.png"),"Dashboard memakai favicon 32 px");
check(index.includes("assets/icons/apple-touch-icon.png"),"Dashboard memakai Apple Touch Icon");
check(!index.includes("latte-art-icon.png"),"Logo lama tidak digunakan pada dashboard");
const sw=text("sw.js");
for(const file of ["./assets/brand/lestari-logo.png","./assets/icons/icon-192.png","./assets/icons/icon-512.png","./favicon.ico"]) check(sw.includes(file),`Service worker memuat ${file}`);
check(!fs.existsSync(path.join(root,"assets/latte-art-icon.png")),"Aset logo lama telah dihapus");
const report={version:site.version,generatedAt:new Date().toISOString(),passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length,checks};
fs.writeFileSync(path.join(root,"docs","V44_RC3_BRAND_AUDIT_RESULT.json"),JSON.stringify(report,null,2));
console.log(`\nBrand asset audit: ${report.passed} passed, ${report.failed} failed.`);
if(failed) process.exit(1);
