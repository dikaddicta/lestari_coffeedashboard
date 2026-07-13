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

for (const file of ["assets/services/analytics-service.js", "assets/css/analytics-insight.css"]) {
  check(exists(file), `${file} exists`);
}
const syntax = spawnSync(process.execPath, ["--check", "assets/services/analytics-service.js"], { cwd: root, encoding: "utf8" });
check(syntax.status === 0, "Analytics service has valid JavaScript syntax");

const shell = read("src/shell.html");
check(shell.includes("assets/css/analytics-insight.css"), "Analytics stylesheet is loaded");
check(shell.includes("assets/services/analytics-service.js"), "Analytics service is loaded");
check(shell.indexOf("assets/services/analytics-service.js") < shell.indexOf("assets/app.js"), "Analytics service loads before app.js");

const context = { window: { COFFEE_SERVICES: {} }, console, Map, Date, Math, Number, String };
vm.createContext(context);
vm.runInContext(read("assets/services/analytics-service.js"), context, { filename: "analytics-service.js" });
const analytics = context.window.COFFEE_SERVICES.analytics;
check(typeof analytics?.summarize === "function", "Analytics service exposes summarize");
check(typeof analytics?.consumptionTrend === "function", "Analytics service exposes consumption trend");
check(typeof analytics?.costBreakdown === "function", "Analytics service exposes cost breakdown");
check(typeof analytics?.insights === "function", "Analytics service exposes insight generation");

const stocks = [{ CloudID: "stock-1", BeanID: "B-1", CoffeeName: "Kerinci", Stock_g: 170, Price: 120000 }];
const history = [
  { BrewID: "BL-1", Date: "2026-06-01", StockBeanID: "stock-1", StockUsage_g: 15, Dose_g: 15, BeanName: "Kerinci", QA_Final: 7.8 },
  { BrewID: "BL-2", Date: "2026-06-05", StockBeanID: "stock-1", StockUsage_g: 15, Dose_g: 15, BeanName: "Kerinci", QA_Final: 8.2 }
];
const summary = analytics.summarize(history, stocks, history);
check(summary.totalBrews === 2, "Summary counts brew logs");
check(summary.totalCoffeeG === 30, "Summary counts coffee consumption");
check(Math.round(summary.totalCost) === 18000, "Cost uses inferred 200 g purchase weight");
check(Math.round(summary.averageCost) === 9000, "Average cost per cup is calculated");
check(summary.costCoverage === 100, "Cost coverage is calculated");
check(analytics.costBreakdown(summary.enriched)[0]?.key === "Kerinci", "Cost breakdown groups by stock bean");
const publicSummary = analytics.summarize([{ BrewID: "PUB-1", Date: "2026-06-06", BeanName: "Kerinci", AnalyticsSource: "public", Dose_g: 15, QA_Final: 8 }], stocks, history);
check(publicSummary.costKnownBrews === 0, "Public rows without a stock reference do not inherit private stock cost");
check(analytics.consumptionTrend(summary.enriched, 30).length === 2, "Consumption trend buckets recent dates");
check(analytics.insights(history, stocks, history).length >= 3, "Analytics returns actionable insights");

const page = read("src/pages/09-data-analytics.html");
for (const id of [
  "analyticsPeriod",
  "analyticsFinanceNotice",
  "analyticsMetricGrid",
  "analyticsTrendChart",
  "analyticsConsumptionChart",
  "analyticsCostBreakdown",
  "analyticsTopTable"
]) check(page.includes(`id="${id}"`), `Analytics page includes ${id}`);

const stockPage = read("src/pages/06-stock.html");
check(stockPage.includes("Harga Pembelian (Rp)"), "Stock form clarifies purchase price for cost analytics");

const app = read("assets/app.js");
check(app.includes("ANALYTICS_SERVICE?.summarize"), "Application consumes analytics summary service");
check(app.includes("renderAnalyticsConsumption"), "Application renders consumption trend");
check(app.includes("renderAnalyticsCostBreakdown"), "Application renders cost breakdown");
check(app.includes('$("refreshAnalitik")'), "Analytics refresh button uses the correct DOM id");

const sw = read("sw.js");
check(sw.includes("assets/services/analytics-service.js"), "Service worker precaches analytics service");
check(sw.includes("assets/css/analytics-insight.css"), "Service worker precaches analytics stylesheet");

console.log(`\nAnalytics insight audit: ${passed} passed${failed ? ", failures detected" : ", 0 failed"}.`);
if (failed) process.exit(1);
