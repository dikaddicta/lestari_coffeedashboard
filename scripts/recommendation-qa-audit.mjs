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

const files = [
  "assets/services/recommendation-service.js",
  "assets/services/qa-service.js",
  "assets/css/intelligence.css"
];
for (const file of files) check(exists(file), `${file} exists`);
for (const file of files.filter(file => file.endsWith(".js"))) {
  const syntax = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  check(syntax.status === 0, `${file} has valid JavaScript syntax`);
}

const shell = read("src/shell.html");
check(shell.includes("assets/css/intelligence.css"), "Intelligence stylesheet is loaded");
check(shell.includes("assets/services/recommendation-service.js"), "Recommendation service is loaded");
check(shell.indexOf("assets/services/recommendation-service.js") < shell.indexOf("assets/app.js"), "Recommendation service loads before app.js");
check(shell.indexOf("assets/services/qa-service.js") < shell.indexOf("assets/app.js"), "QA service loads before app.js");

const context = { window: { COFFEE_SERVICES: {} }, console };
vm.createContext(context);
vm.runInContext(read("assets/services/recommendation-service.js"), context, { filename: "recommendation-service.js" });
vm.runInContext(read("assets/services/qa-service.js"), context, { filename: "qa-service.js" });
const services = context.window.COFFEE_SERVICES;

check(typeof services.recommendation?.explain === "function", "Recommendation service exposes explain");
const brew = {
  variety: { Variety: "Typica", SourceURL: "https://example.com/variety" },
  process: { Process: "Washed", SourceURL: "https://example.com/process" },
  roast: { RoastProfile: "Light", SourceURL: "https://example.com/roast" },
  dripper: { DripperName: "V60", SourceURL: "https://example.com/dripper" },
  water: { Water: "Balanced", SourceURL: "https://example.com/water" },
  grinderSetting: "18 clicks",
  flow: 3,
  heat: 3,
  tds: 120,
  risk: 2,
  mineralBand: "balanced",
  temp: 93,
  ratio: 16,
  grindTarget: 700,
  body: 3,
  acidity: 4,
  floral: 4,
  mode: "Hot V60"
};
const explanation = services.recommendation.explain(brew, [{ BrewID: "BL-001", QA_Final: 8.6 }]);
check(explanation.confidence.score >= 80, "Complete profile with QA history receives strong confidence");
check(explanation.confidence.items.length === 5, "Confidence includes five transparent factors");
check(explanation.rationale.length >= 4, "Recommendation includes parameter rationale");
check(Boolean(explanation.experiment.variable && explanation.experiment.next), "Recommendation includes one-variable experiment");

const metrics = { aroma: 8, flavor: 7.5, aftertaste: 6.5, acidity: 7, sweetness: 8.5, body: 7, balance: 7, clarity: 6, finish: 6.5, consistency: 7.5 };
const diagnosis = services.qa.diagnose({ metrics, finalScore: 7.2, issue: "muddy", target: "lebih jernih", previous: { finalScore: 6.8 } });
check(diagnosis.variable === "Agitasi", "QA diagnosis maps muddy cup to agitation change");
check(diagnosis.delta === 0.4, "QA diagnosis compares final score with previous evaluation");
check(services.qa.compare(metrics, { ...metrics, clarity: 5 }).find(row => row.key === "clarity")?.delta === 1, "QA service compares individual metrics");

const recommendationPage = read("src/pages/03-rekomendasi-seduh.html");
for (const id of ["brewRecommendationConfidence", "brewRecommendationRationale", "brewNextExperiment"]) {
  check(recommendationPage.includes(`id="${id}"`), `Recommendation page includes ${id}`);
}
const qaPage = read("src/pages/07-brew-log-qa.html");
for (const id of ["qaPrimaryIssue", "qaTargetFocus", "qaDiagnosticPlan", "qaComparisonCard", "qaMetricMap"]) {
  check(qaPage.includes(`id="${id}"`), `QA page includes ${id}`);
}

const app = read("assets/app.js");
check(app.includes("RECOMMENDATION_SERVICE.explain"), "Application consumes recommendation explanation service");
check(app.includes("QA_SERVICE.diagnose"), "Application consumes QA diagnostic service");
check(app.includes("matchingRecommendationHistory"), "Application matches brew history for confidence");
check(app.includes("previousQAContext"), "Application resolves previous QA comparison context");

const sw = read("sw.js");
check(sw.includes("assets/services/recommendation-service.js"), "Service worker precaches recommendation service");
check(sw.includes("assets/css/intelligence.css"), "Service worker precaches intelligence stylesheet");

console.log(`\nRecommendation & QA audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
