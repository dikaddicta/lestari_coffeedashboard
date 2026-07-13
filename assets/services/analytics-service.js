(function () {
  "use strict";

  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalized = value => String(value || "").trim().toLowerCase();

  function dateValue(row) {
    const raw = row?.Date || row?.CreatedAt || row?.brew_date || row?.created_at || "";
    const value = new Date(raw);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function filterPeriod(rows = [], days = 0, now = new Date()) {
    const period = number(days);
    if (!period) return [...rows];
    const floor = new Date(now);
    floor.setHours(23, 59, 59, 999);
    floor.setDate(floor.getDate() - period);
    return rows.filter(row => {
      const value = dateValue(row);
      return value && value >= floor;
    });
  }

  function stockKeys(stock = {}) {
    return [
      stock.CloudID,
      stock.BeanID,
      stock.StockBeanID,
      stock.CoffeeName
    ].filter(Boolean).map(value => normalized(value));
  }

  function brewStockKeys(log = {}) {
    const explicit = [log.StockBeanID, log.StockBeanCode, log.BeanID].filter(Boolean);
    if (String(log.AnalyticsSource || "").toLowerCase() === "public" && !explicit.length) return [];
    return [...explicit, log.BeanName].filter(Boolean).map(value => normalized(value));
  }

  function createStockIndex(stocks = []) {
    const index = new Map();
    stocks.forEach(stock => stockKeys(stock).forEach(key => {
      if (!index.has(key)) index.set(key, stock);
    }));
    return index;
  }

  function findStock(log, stockIndex) {
    for (const key of brewStockKeys(log)) {
      if (stockIndex.has(key)) return stockIndex.get(key);
    }
    return null;
  }

  function usageGram(log = {}) {
    const explicit = number(log.StockUsage_g);
    if (explicit > 0) return explicit;
    return log.StockBeanID || log.StockBeanCode ? Math.max(0, number(log.Dose_g)) : 0;
  }

  function stockIdentity(stock = {}) {
    return normalized(stock.CloudID || stock.BeanID || stock.CoffeeName);
  }

  function buildConsumedMap(historyRows = [], stocks = []) {
    const index = createStockIndex(stocks);
    const consumed = new Map();
    historyRows.forEach(log => {
      const stock = findStock(log, index);
      const key = stock ? stockIdentity(stock) : "";
      const usage = usageGram(log);
      if (key && usage > 0) consumed.set(key, (consumed.get(key) || 0) + usage);
    });
    return consumed;
  }

  function stockUnitCost(stock = {}, consumedMap = new Map()) {
    const price = Math.max(0, number(stock.Price));
    if (!price) return { known: false, value: 0, basisGram: 0, source: "missing-price" };
    const consumed = Math.max(0, consumedMap.get(stockIdentity(stock)) || 0);
    const current = Math.max(0, number(stock.Stock_g));
    const basisGram = current + consumed;
    if (!basisGram) return { known: false, value: 0, basisGram: 0, source: "missing-weight" };
    return {
      known: true,
      value: price / basisGram,
      basisGram,
      source: consumed > 0 ? "inferred-purchase-weight" : "current-stock-weight"
    };
  }

  function enrich(rows = [], stocks = [], historyRows = rows) {
    const index = createStockIndex(stocks);
    const consumedMap = buildConsumedMap(historyRows, stocks);
    return rows.map(log => {
      const stock = findStock(log, index);
      const usage = usageGram(log);
      const unit = stock ? stockUnitCost(stock, consumedMap) : { known: false, value: 0, basisGram: 0, source: "unlinked" };
      const costKnown = Boolean(stock && usage > 0 && unit.known);
      return {
        ...log,
        AnalyticsUsage_g: usage,
        AnalyticsStockName: stock?.CoffeeName || log.BeanName || "-",
        AnalyticsCostKnown: costKnown,
        AnalyticsUnitCost: costKnown ? unit.value : 0,
        AnalyticsCost: costKnown ? unit.value * usage : 0,
        AnalyticsCostSource: unit.source,
        AnalyticsCostBasis_g: unit.basisGram
      };
    });
  }

  function average(values = []) {
    const valid = values.map(number).filter(value => Number.isFinite(value));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  }

  function standardDeviation(values = []) {
    const valid = values.map(number).filter(value => Number.isFinite(value));
    if (valid.length < 2) return 0;
    const mean = average(valid);
    return Math.sqrt(average(valid.map(value => (value - mean) ** 2)));
  }

  function dateSpanDays(rows = []) {
    const dates = rows.map(dateValue).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) return 0;
    return Math.max(1, Math.ceil((dates.at(-1) - dates[0]) / 86400000) + 1);
  }

  function summarize(rows = [], stocks = [], historyRows = rows) {
    const enriched = enrich(rows, stocks, historyRows);
    const qa = enriched.map(row => number(row.QA_Final)).filter(value => value > 0);
    const costRows = enriched.filter(row => row.AnalyticsCostKnown);
    const totalCoffeeG = enriched.reduce((sum, row) => sum + number(row.AnalyticsUsage_g), 0);
    const totalCost = costRows.reduce((sum, row) => sum + number(row.AnalyticsCost), 0);
    const remainingValue = stocks.reduce((sum, stock) => {
      const unit = stockUnitCost(stock, buildConsumedMap(historyRows, stocks));
      return sum + (unit.known ? unit.value * Math.max(0, number(stock.Stock_g)) : 0);
    }, 0);
    const spanDays = dateSpanDays(enriched);
    const dailyConsumption = spanDays ? totalCoffeeG / spanDays : 0;
    const totalRemaining = stocks.reduce((sum, stock) => sum + Math.max(0, number(stock.Stock_g)), 0);
    return {
      enriched,
      totalBrews: enriched.length,
      totalCoffeeG,
      totalCost,
      averageCost: costRows.length ? totalCost / costRows.length : 0,
      costCoverage: enriched.length ? (costRows.length / enriched.length) * 100 : 0,
      costKnownBrews: costRows.length,
      averageQA: qa.length ? average(qa) : 0,
      qaDeviation: standardDeviation(qa),
      remainingValue,
      dailyConsumption,
      estimatedStockDays: dailyConsumption > 0 ? totalRemaining / dailyConsumption : 0,
      spanDays
    };
  }

  function bucketKey(date, days) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    if (number(days) && number(days) <= 45) return d.toISOString().slice(0, 10);
    if (number(days) && number(days) <= 180) {
      const monday = new Date(d);
      const offset = (monday.getDay() + 6) % 7;
      monday.setDate(monday.getDate() - offset);
      return monday.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 7);
  }

  function consumptionTrend(enriched = [], days = 0) {
    const buckets = new Map();
    enriched.forEach(row => {
      const date = dateValue(row);
      if (!date) return;
      const key = bucketKey(date, days);
      const current = buckets.get(key) || { key, coffeeG: 0, cost: 0, brews: 0 };
      current.coffeeG += number(row.AnalyticsUsage_g);
      current.cost += number(row.AnalyticsCost);
      current.brews += 1;
      buckets.set(key, current);
    });
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }

  function costBreakdown(enriched = []) {
    const groups = new Map();
    enriched.filter(row => row.AnalyticsCostKnown).forEach(row => {
      const key = row.AnalyticsStockName || row.BeanName || "Tanpa nama";
      const current = groups.get(key) || { key, cost: 0, coffeeG: 0, brews: 0, avgQA: 0, qaValues: [] };
      current.cost += number(row.AnalyticsCost);
      current.coffeeG += number(row.AnalyticsUsage_g);
      current.brews += 1;
      if (number(row.QA_Final) > 0) current.qaValues.push(number(row.QA_Final));
      groups.set(key, current);
    });
    return [...groups.values()].map(item => ({
      ...item,
      avgQA: item.qaValues.length ? average(item.qaValues) : 0
    })).sort((a, b) => b.cost - a.cost);
  }

  function qaDirection(rows = []) {
    const sorted = [...rows].filter(row => number(row.QA_Final) > 0).sort((a, b) => (dateValue(a) || 0) - (dateValue(b) || 0));
    if (sorted.length < 2) return { delta: 0, first: 0, last: 0 };
    const windowSize = Math.min(3, Math.max(1, Math.floor(sorted.length / 2)));
    const first = average(sorted.slice(0, windowSize).map(row => number(row.QA_Final)));
    const last = average(sorted.slice(-windowSize).map(row => number(row.QA_Final)));
    return { delta: last - first, first, last };
  }

  function insights(rows = [], stocks = [], historyRows = rows) {
    const summary = summarize(rows, stocks, historyRows);
    if (!rows.length) return [{ title: "Belum ada pola yang bisa dibaca", text: "Tambahkan brew log dan nilai QA agar analitik mulai menghasilkan insight." }];
    const direction = qaDirection(rows);
    const costGroups = costBreakdown(summary.enriched);
    const result = [];

    if (direction.first && direction.last) {
      result.push({
        title: direction.delta >= 0 ? "Kualitas seduhan bergerak positif" : "Kualitas seduhan perlu distabilkan",
        text: `Rata-rata QA bergerak dari ${direction.first.toFixed(2)} ke ${direction.last.toFixed(2)}. ${direction.delta >= 0 ? "Pertahankan baseline terbaik dan ubah satu variabel setiap percobaan." : "Tinjau perubahan gilingan, suhu, dan agitasi pada beberapa seduhan terakhir."}`
      });
    }

    const deviationLabel = summary.qaDeviation <= 0.3 ? "sangat konsisten" : summary.qaDeviation <= 0.65 ? "cukup konsisten" : "masih bervariasi";
    result.push({
      title: `Konsistensi ${deviationLabel}`,
      text: `Sebaran nilai QA saat ini ${summary.qaDeviation.toFixed(2)}. Nilai yang lebih kecil menunjukkan hasil antar-seduhan lebih stabil.`
    });

    if (summary.costCoverage >= 80) {
      result.push({
        title: "Data biaya sudah cukup lengkap",
        text: `${Math.round(summary.costCoverage)}% seduhan memiliki hubungan stok dan harga. Rata-rata biaya biji per cangkir sekitar ${Math.round(summary.averageCost).toLocaleString("id-ID")} rupiah.`
      });
    } else {
      result.push({
        title: "Lengkapi hubungan stok untuk biaya yang lebih akurat",
        text: `Cakupan biaya baru ${Math.round(summary.costCoverage)}%. Pilih biji dari stok saat menyimpan seduhan dan isi harga pembelian pada menu Stok.`
      });
    }

    if (costGroups[0]) {
      result.push({
        title: "Pengeluaran biji terbesar",
        text: `${costGroups[0].key} menyumbang biaya seduh tertinggi pada periode ini, sekitar ${Math.round(costGroups[0].cost).toLocaleString("id-ID")} rupiah dari ${costGroups[0].brews} seduhan.`
      });
    }

    if (summary.estimatedStockDays > 0) {
      result.push({
        title: "Perkiraan daya tahan stok",
        text: `Dengan pola konsumsi pada periode aktif, stok tercatat diperkirakan cukup sekitar ${Math.max(1, Math.round(summary.estimatedStockDays))} hari.`
      });
    }

    return result.slice(0, 5);
  }

  window.COFFEE_SERVICES = Object.freeze({
    ...(window.COFFEE_SERVICES || {}),
    analytics: Object.freeze({
      filterPeriod,
      createStockIndex,
      findStock,
      usageGram,
      enrich,
      summarize,
      consumptionTrend,
      costBreakdown,
      insights,
      qaDirection,
      standardDeviation
    })
  });
})();
