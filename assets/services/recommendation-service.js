(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const hasName = (row, fields) => fields.some(field => String(row?.[field] || "").trim());
  const hasSource = row => Boolean(String(row?.SourceURL || row?.SourceUrl || row?.URL || row?.Source || "").trim());

  function confidence(brew = {}, history = []) {
    const profileChecks = [
      ["Varietas", hasName(brew.variety, ["Variety"]), 8],
      ["Pascapanen", hasName(brew.process, ["Process"]), 8],
      ["Profil sangrai", hasName(brew.roast, ["RoastProfile"]), 6],
      ["Dripper", hasName(brew.dripper, ["DripperName"]), 5],
      ["Air", hasName(brew.water, ["Water"]), 3],
      ["Grinder", Boolean(String(brew.grinderSetting || "").trim()), 2]
    ];
    const profileScore = profileChecks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);

    const equipmentChecks = [
      ["Setting grinder terbaca", Boolean(String(brew.grinderSetting || "").trim()) && !/klik\/dial|custom grinder/i.test(String(brew.grinderSetting || "")), 7],
      ["Flow dripper tersedia", number(brew.flow, 0) >= 1, 5],
      ["Retensi panas tersedia", number(brew.heat, 0) >= 1, 4],
      ["Mineral air tersedia", number(brew.tds, 0) > 0, 4]
    ];
    const equipmentScore = equipmentChecks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);

    let guardrailScore = 18;
    const risks = [];
    if (number(brew.risk, 2) >= 4) {
      guardrailScore -= 4;
      risks.push("Proses berintensitas fermentasi tinggi membutuhkan validasi rasa lebih ketat.");
    }
    if (brew.process?.Inferred) {
      guardrailScore -= 4;
      risks.push("Profil pascapanen dibuat dari pencocokan kata kunci, bukan entri pustaka langsung.");
    }
    if (brew.variety?.IsComposite) {
      guardrailScore -= 2;
      risks.push("Profil multi-varietas merupakan hasil gabungan beberapa karakter dasar.");
    }
    if (brew.mineralBand === "soft" || brew.mineralBand === "hard") {
      guardrailScore -= 2;
      risks.push("Komposisi mineral air berada di luar rentang tengah dan perlu dikonfirmasi lewat rasa.");
    }
    guardrailScore = clamp(guardrailScore, 5, 18);

    const traceRows = [brew.variety, brew.process, brew.roast, brew.dripper, brew.water];
    const traceScore = traceRows.reduce((sum, row) => sum + (hasSource(row) ? 2 : 0), 0);

    const validHistory = (history || []).filter(row => number(row?.QA_Final, 0) > 0);
    const bestQA = validHistory.reduce((max, row) => Math.max(max, number(row.QA_Final, 0)), 0);
    const historyCount = validHistory.length;
    let historyScore = historyCount === 0 ? 4 : historyCount === 1 ? 10 : historyCount === 2 ? 14 : 17;
    if (bestQA >= 8.5) historyScore += 3;
    else if (bestQA >= 7.5) historyScore += 2;
    else if (bestQA >= 6.5) historyScore += 1;
    historyScore = clamp(historyScore, 0, 20);

    const score = Math.round(profileScore + equipmentScore + guardrailScore + traceScore + historyScore);
    const level = score >= 86 ? "Tinggi" : score >= 72 ? "Cukup kuat" : score >= 60 ? "Perlu validasi" : "Eksperimental";
    const summary = historyCount
      ? `${level}. Rekomendasi didukung ${historyCount} hasil seduh terdahulu; nilai QA terbaik ${bestQA.toFixed(2)}.`
      : `${level}. Resep masih berupa baseline pustaka dan perlu dikonfirmasi melalui satu seduhan kontrol.`;

    return {
      score,
      level,
      summary,
      historyCount,
      bestQA,
      risks,
      items: [
        { key: "profile", label: "Kelengkapan profil", score: profileScore, max: 32, note: profileChecks.filter(([, ok]) => !ok).map(([label]) => label).join(", ") || "Semua profil utama tersedia." },
        { key: "equipment", label: "Kalibrasi peralatan", score: equipmentScore, max: 20, note: equipmentChecks.filter(([, ok]) => !ok).map(([label]) => label).join(", ") || "Data peralatan cukup lengkap." },
        { key: "guardrail", label: "Batas aman proses", score: guardrailScore, max: 18, note: risks[0] || "Tidak ada risiko proses utama yang menonjol." },
        { key: "traceability", label: "Jejak referensi", score: traceScore, max: 10, note: `${traceRows.filter(hasSource).length} dari ${traceRows.length} profil memiliki sumber.` },
        { key: "history", label: "Validasi brew log", score: historyScore, max: 20, note: historyCount ? `${historyCount} log dengan QA tersedia.` : "Belum ada QA untuk profil serupa." }
      ]
    };
  }

  function rationale(brew = {}) {
    const lines = [];
    const tempReason = number(brew.risk, 2) >= 4
      ? "Suhu ditahan agar karakter fermentasi tidak berubah menjadi tajam atau terlalu dominan."
      : number(brew.heat, 3) >= 4
        ? "Retensi panas dripper tinggi, sehingga suhu awal tidak perlu terlalu agresif."
        : brew.mineralBand === "soft"
          ? "Air yang sangat ringan dikompensasi dengan suhu sedikit lebih tinggi."
          : "Suhu dipilih dari kombinasi sangrai, proses, retensi panas, dan target rasa.";
    lines.push({ key: "temperature", label: `Suhu ${number(brew.temp).toFixed(0)}°C`, text: tempReason });

    const ratioReason = number(brew.body, 3) >= 4
      ? "Rasio dibuat sedikit lebih pendek untuk menjaga tekstur tanpa memperpanjang ekstraksi akhir."
      : number(brew.acidity, 3) >= 4 || number(brew.floral, 2) >= 4
        ? "Rasio sedikit lebih panjang membantu kejernihan dan pemisahan aroma."
        : "Rasio berada di titik tengah agar sweetness, body, dan acidity tetap seimbang.";
    lines.push({ key: "ratio", label: `Rasio 1:${number(brew.ratio).toFixed(1)}`, text: ratioReason });

    const grindReason = number(brew.flow, 3) <= 2
      ? "Dripper cenderung lambat, sehingga target gilingan dibuat lebih kasar untuk menjaga drawdown."
      : number(brew.flow, 3) >= 4
        ? "Flow dripper cepat dikompensasi dengan gilingan yang lebih rapat."
        : "Target gilingan mengikuti flow dripper dan tingkat kelarutan profil kopi.";
    lines.push({ key: "grind", label: `Gilingan ${number(brew.grindTarget).toFixed(0)} µm`, text: grindReason });

    const agitation = number(brew.risk, 2) >= 4 ? "rendah" : number(brew.body, 3) >= 4 ? "sedang-rendah" : "sedang";
    lines.push({ key: "agitation", label: `Agitasi ${agitation}`, text: number(brew.risk, 2) >= 4 ? "Agitasi dibatasi untuk menjaga aroma fermentasi tetap bersih." : "Tingkat agitasi dipilih agar ekstraksi naik tanpa memperberat kesan akhir." });

    if (brew.mode === "Japanese Iced") {
      lines.push({ key: "ice", label: `${number(brew.hotWater)} ml air panas + ${number(brew.ice)} g es`, text: "Pembagian air menjaga konsentrasi awal sebelum pendinginan dan pengenceran di server." });
    }
    return lines;
  }

  function chooseExperiment(brew = {}, history = []) {
    const validHistory = (history || []).filter(row => number(row?.QA_Final, 0) > 0).sort((a, b) => number(b.QA_Final) - number(a.QA_Final));
    const best = validHistory[0] || null;
    let variable = "Gilingan";
    let current = `${number(brew.grindTarget).toFixed(0)} µm`;
    let next = number(brew.risk, 2) >= 4 ? `${Math.round(number(brew.grindTarget) + 20)} µm` : `${Math.round(number(brew.grindTarget) - 15)} µm`;
    let direction = number(brew.risk, 2) >= 4 ? "sedikit lebih kasar" : "sedikit lebih halus";
    let reason = number(brew.risk, 2) >= 4
      ? "Kurangi ekstraksi dan agitasi efektif untuk mengecek apakah karakter fermentasi menjadi lebih bersih."
      : "Naikkan ekstraksi secara kecil untuk menguji tambahan sweetness tanpa mengubah suhu dan rasio.";

    if (brew.mineralBand === "hard") {
      variable = "Suhu";
      current = `${number(brew.temp).toFixed(0)}°C`;
      next = `${Math.max(86, number(brew.temp) - 1).toFixed(0)}°C`;
      direction = "turun 1°C";
      reason = "Uji apakah suhu lebih rendah memberi finish yang lebih bersih pada air bermineral tinggi.";
    } else if (number(brew.body, 3) >= 4 && number(brew.acidity, 3) <= 3) {
      variable = "Rasio";
      current = `1:${number(brew.ratio).toFixed(1)}`;
      next = `1:${(number(brew.ratio) + 0.3).toFixed(1)}`;
      direction = "sedikit lebih panjang";
      reason = "Uji apakah penambahan air memperbaiki kejernihan tanpa menghilangkan body utama.";
    }

    return {
      variable,
      current,
      next,
      direction,
      reason,
      holdConstant: ["dosis", "air", "pola tuang", "dripper"],
      reference: best ? `${best.BrewID || "Brew sebelumnya"} · QA ${number(best.QA_Final).toFixed(2)}` : "Belum ada brew log pembanding",
      instruction: `Ubah ${variable.toLowerCase()} menjadi ${direction}. Pertahankan dosis, air, pola tuang, dan dripper agar dampaknya dapat dibaca.`
    };
  }

  function explain(brew = {}, history = []) {
    return {
      confidence: confidence(brew, history),
      rationale: rationale(brew),
      experiment: chooseExperiment(brew, history)
    };
  }

  services.recommendation = Object.freeze({ confidence, rationale, chooseExperiment, explain });
})();
