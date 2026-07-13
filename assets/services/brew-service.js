(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};
  const validation = window.COFFEE_CORE?.validation;

  function expectedWater(dose, ratio) {
    return Math.round((Number(dose) || 0) * (Number(ratio) || 0));
  }

  function validateBrew(brew = {}, { stockBean = null } = {}) {
    const checks = [
      validation?.required(brew.BeanName || brew.Variety, "Nama kopi"),
      validation?.number(brew.Dose_g, { label: "Dosis", min: 5, max: 50 }),
      validation?.number(brew.Ratio, { label: "Rasio", min: 8, max: 25 }),
      validation?.number(brew.Temp_C, { label: "Suhu", min: 70, max: 100 }),
      validation?.number(brew.TotalWater_ml, { label: "Total air", min: 50, max: 1000 }),
      validation?.number(brew.BrewTime_sec, { label: "Waktu seduh", min: 30, max: 600 })
    ];
    if (stockBean && Number(stockBean.Stock_g || 0) < Number(brew.Dose_g || 0)) {
      checks.push(`Stok ${stockBean.CoffeeName || "kopi"} tidak cukup. Tersedia ${Number(stockBean.Stock_g || 0)}g.`);
    }
    return validation?.collect(checks) || { ok: checks.filter(Boolean).length === 0, errors: checks.filter(Boolean), first: checks.find(Boolean) || "" };
  }

  function validateManual(input = {}) {
    const checks = [
      validation?.required(input.beanName, "Nama kopi"),
      validation?.number(input.dose, { label: "Dosis", min: 5, max: 50 }),
      validation?.number(input.ratio, { label: "Rasio", min: 8, max: 25 }),
      validation?.number(input.totalWater, { label: "Total air", min: 50, max: 1000 }),
      validation?.number(input.temperature, { label: "Suhu", min: 70, max: 100 }),
      validation?.number(input.brewTime, { label: "Waktu seduh", min: 30, max: 600 }),
      validation?.number(input.bloom, { label: "Bloom", min: 0, max: 200 })
    ];
    const target = expectedWater(input.dose, input.ratio);
    const difference = Math.abs((Number(input.totalWater) || 0) - target);
    const tolerance = Math.max(10, target * 0.06);
    const warnings = [];
    if (difference > tolerance) warnings.push(`Total air berbeda ${Math.round(difference)}ml dari rasio 1:${Number(input.ratio || 0)} (target sekitar ${target}ml).`);
    const pourTotal = (input.pours || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
    if (pourTotal > 0 && Math.abs(pourTotal - Number(input.totalWater || 0)) > 8) {
      warnings.push(`Jumlah detail pour ${Math.round(pourTotal)}ml belum sama dengan total air ${Math.round(Number(input.totalWater || 0))}ml.`);
    }
    if (/japanese/i.test(String(input.mode || "")) && Number(input.ice || 0) <= 0) warnings.push("Mode Japanese Iced sebaiknya memiliki berat es lebih dari 0g.");
    const result = validation?.collect(checks) || { ok: checks.filter(Boolean).length === 0, errors: checks.filter(Boolean), first: checks.find(Boolean) || "" };
    return { ...result, warnings, targetWater: target, pourTotal };
  }

  function compare(current = {}, previous = {}) {
    const fields = [
      ["Dose_g", "Dosis", "g"], ["Ratio", "Rasio", ""], ["Temp_C", "Suhu", "°C"],
      ["BrewTime_sec", "Waktu", " dtk"], ["GrindSetting", "Gilingan", ""]
    ];
    return fields.flatMap(([key, label, suffix]) => {
      if (String(current[key] ?? "") === String(previous[key] ?? "")) return [];
      return [{ key, label, before: previous[key] ?? "-", after: current[key] ?? "-", suffix }];
    });
  }

  services.brew = Object.freeze({ expectedWater, validateBrew, validateManual, compare });
})();
