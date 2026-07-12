import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = message => console.log(`PASS: ${message}`);

const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
duplicateIds.length ? fail(`Duplicate IDs: ${duplicateIds.join(", ")}`) : pass(`${ids.length} unique HTML IDs`);

const tabNames = [...html.matchAll(/class="[^"]*tab-btn[^"]*"[^>]*data-tab="([^"]+)"/g)].map(match => match[1]);
const panelNames = [...html.matchAll(/id="tab-([^"]+)"[^>]*class="[^"]*tab-panel/g)].map(match => match[1]);
const missingPanels = [...new Set(tabNames)].filter(name => !panelNames.includes(name));
missingPanels.length ? fail(`Tabs without panels: ${missingPanels.join(", ")}`) : pass(`${new Set(tabNames).size} tab routes have panels`);

for (const ref of [...html.matchAll(/(?:href|src)="((?:assets|manifest)[^"]+)"/g)].map(match => match[1].split("?")[0])) {
  if (!fs.existsSync(path.join(root, ref))) fail(`Missing referenced asset: ${ref}`);
}
pass("Referenced local assets checked");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(read("assets/data.js"), context, { filename: "assets/data.js" });
const data = context.window.COFFEE_DATA;
if (!data) fail("COFFEE_DATA was not loaded");

for (const [key, field] of Object.entries({ varieties: "Variety", drippers: "DripperName", filters: "FilterName", processes: "Process", roasts: "RoastProfile", waters: "Water", grinders: "Grinder" })) {
  const rows = data[key] || [];
  const normalized = rows.map(row => String(row[field] || "").trim().toLowerCase());
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  duplicates.length ? fail(`${key} duplicate names: ${[...new Set(duplicates)].join(", ")}`) : pass(`${key}: ${rows.length} unique records`);
}

const accessoryInDrippers = (data.drippers || []).filter(row => /filter accessory/i.test(String(row.BrewFamily || "")) || /filter paper|paper filter/i.test(String(row.DripperName || "")));
accessoryInDrippers.length ? fail(`Filter accessory still counted as dripper: ${accessoryInDrippers.map(row => row.DripperName).join(", ")}`) : pass("No paper-filter accessories counted as drippers");

const requiredAccessibleIds = [
  "publicBrewSearch", "publicBrewMethod", "publicBrewDripper", "publicBrewProcess", "publicBrewRoast", "publicBrewMinQA", "publicBrewSort",
  "analyticsScope", "analyticsMinQA", "qualityScope", "qualitySeverity", "reportScope", "reportLibraryDataset", "moderationDataset", "moderationStatus"
];
for (const id of requiredAccessibleIds) {
  const control = html.match(new RegExp(`<(?:input|select)[^>]*id="${id}"[^>]*>`, "i"))?.[0] || "";
  if (!/aria-label=|aria-labelledby=/.test(control)) fail(`Control ${id} has no accessible label`);
}
pass("Critical filter controls have accessible labels");

console.log("\nCounts:", Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])));
if (process.exitCode) process.exit(process.exitCode);
