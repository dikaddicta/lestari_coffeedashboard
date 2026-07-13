import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
let failed = false;
let passed = 0;

function check(ok, message) {
  console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"}: ${message}`);
  if (ok) passed += 1;
  else failed = true;
}

const coreFiles = [
  "assets/core/event-bus.js",
  "assets/core/validation.js",
  "assets/core/app-state.js"
];
const workflowFiles = [
  "assets/services/auth-service.js",
  "assets/services/stock-service.js",
  "assets/services/brew-service.js",
  "assets/services/qa-service.js",
  "assets/services/notification-service.js"
];

for (const file of [...coreFiles, ...workflowFiles]) {
  check(exists(file), `${file} exists`);
  const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(syntax.status === 0, `${file} has valid JavaScript syntax`);
}

const shell = read("src/shell.html");
for (const file of [...coreFiles, ...workflowFiles, "assets/css/workflow.css"]) {
  check(shell.includes(file), `${file} is loaded by the modular shell`);
}
check(shell.indexOf("assets/core/validation.js") < shell.indexOf("assets/services/stock-service.js"), "Validation loads before stock service");
check(shell.indexOf("assets/services/qa-service.js") < shell.indexOf("assets/app.js"), "QA service loads before app.js");

const context = {
  window: {
    COFFEE_CORE: {},
    COFFEE_SERVICES: {},
    localStorage: new Map(),
    sessionStorage: new Map()
  },
  console,
  structuredClone: value => JSON.parse(JSON.stringify(value)),
  setTimeout,
  clearTimeout
};
vm.createContext(context);
for (const file of ["assets/core/event-bus.js", "assets/core/validation.js", "assets/core/app-state.js", ...workflowFiles]) {
  vm.runInContext(read(file), context, { filename: file });
}

const core = context.window.COFFEE_CORE;
const services = context.window.COFFEE_SERVICES;
check(typeof core.events?.emit === "function", "Event bus exposes emit");
let eventValue = 0;
const unsubscribe = core.events.on("audit", payload => { eventValue = payload.value; });
core.events.emit("audit", { value: 39 });
unsubscribe();
check(eventValue === 39, "Event bus delivers payloads and supports unsubscribe");

const memory = {};
const storage = {
  readJSON: (key, fallback) => memory[key] || fallback,
  writeJSON: (key, value) => { memory[key] = JSON.parse(JSON.stringify(value)); return true; }
};
const store = core.state.createStore({ storage, key: "audit", defaults: { rows: [], cloudRows: [] } });
store.state.rows.push({ id: 1 });
check(store.persist() === true && memory.audit.rows.length === 1, "App state store persists state through storage adapter");

check(core.validation.number(15, { label: "Dosis", min: 5, max: 50 }) === null, "Validation accepts in-range numbers");
check(Boolean(core.validation.number(0, { label: "Dosis", min: 5, max: 50 })), "Validation rejects out-of-range numbers");

const stockValid = services.stock.validateStock({ CoffeeName: "Test Bean", Stock_g: 150, Price: 100000, Sweetness: 4, Acidity: 4, Body: 3 });
check(stockValid.ok, "Stock service accepts valid inventory data");
check(services.stock.estimateCups(150, 15) === 10, "Stock service estimates cups from dose");
check(services.stock.getStatus(15, 15).key === "critical", "Stock service identifies critical stock");

const manual = services.brew.validateManual({ beanName: "Test", dose: 15, ratio: 15, totalWater: 225, temperature: 92, brewTime: 165, bloom: 45, mode: "Hot V60", pours: [45, 60, 60, 60] });
check(manual.ok && manual.warnings.length === 0, "Brew service validates a consistent manual recipe");
const inconsistent = services.brew.validateManual({ beanName: "Test", dose: 15, ratio: 15, totalWater: 300, temperature: 92, brewTime: 165, bloom: 45, mode: "Hot V60", pours: [45, 60, 60, 60] });
check(inconsistent.warnings.length >= 1, "Brew service reports ratio or pour inconsistencies");

const qaScore = services.qa.score([8, 8, 8, 8, 8, 8, 8, 8, 8, 8], 0.5);
check(qaScore === 7.5, "QA service calculates final score with defect penalty");
const guidance = services.qa.guidance({ clarity: 6, sweetness: 8, body: 7, balance: 7 }, 7);
check(guidance.weakest === "clarity" && Boolean(guidance.advice), "QA service identifies weakest metric and advice");

const app = read("assets/app.js");
check(app.includes("APP_STATE_SERVICE.createStore"), "Application consumes centralized state store");
check(app.includes("STOCK_SERVICE?.validateStock"), "Application delegates stock validation");
check(app.includes("BREW_SERVICE.validateManual"), "Application delegates manual brew validation");
check(app.includes("QA_SERVICE.guidance"), "Application renders QA guidance from service");
check(app.includes("EVENT_BUS.emit(\"brew:saved\""), "Application emits brew lifecycle events");

const inputPage = read("src/pages/04-input-seduhan.html");
const qaPage = read("src/pages/07-brew-log-qa.html");
const stockPage = read("src/pages/06-stock.html");
check(inputPage.includes("manualValidationSummary"), "Input Seduhan includes live validation summary");
check(qaPage.includes("qaGuidance"), "QA page includes automated guidance area");
check(stockPage.includes("Estimasi Cangkir") && stockPage.includes("Status Stok"), "Stock table includes operational availability columns");

console.log(`\nWorkflow modules audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
