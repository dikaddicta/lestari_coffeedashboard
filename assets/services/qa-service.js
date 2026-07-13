(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

  const LABELS = Object.freeze({
    aroma: "aroma",
    flavor: "rasa",
    aftertaste: "kesan akhir",
    acidity: "kualitas acidity",
    sweetness: "kemanisan",
    body: "body",
    balance: "keseimbangan",
    clarity: "kejernihan rasa",
    finish: "kebersihan akhir",
    consistency: "konsistensi"
  });

  function normalizeMetrics(metrics = {}) {
    return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, clamp(value, 0, 10)]));
  }

  function score(values = [], defectPenalty = 0) {
    const normalized = values.map(Number).filter(Number.isFinite).map(value => clamp(value, 0, 10));
    if (!normalized.length) return 0;
    const average = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
    return Number(clamp(average - (Number(defectPenalty) || 0), 0, 10).toFixed(2));
  }

  function rank(metrics = {}) {
    const entries = Object.entries(normalizeMetrics(metrics))
      .map(([key, value]) => ({ key, label: LABELS[key] || key, value }))
      .sort((a, b) => a.value - b.value);
    return {
      entries,
      weakest: entries[0] || { key: "balance", label: "keseimbangan", value: 0 },
      strongest: entries[entries.length - 1] || { key: "balance", label: "keseimbangan", value: 0 }
    };
  }

  function guidance(metrics = {}, finalScore = 0, context = {}) {
    const { weakest, strongest } = rank(metrics);
    const advice = {
      clarity: "Kurangi agitasi atau gunakan gilingan sedikit lebih kasar untuk menjaga kejernihan rasa.",
      sweetness: "Naikkan ekstraksi secara kecil melalui gilingan sedikit lebih halus atau suhu +1°C.",
      body: "Gunakan rasio sedikit lebih pendek atau tambah kontak air untuk meningkatkan body.",
      acidity: "Turunkan suhu sedikit atau gunakan air dengan alkalinitas lebih seimbang bila acidity terasa tajam.",
      balance: "Ubah satu variabel saja pada seduhan berikutnya agar penyebab ketidakseimbangan mudah dilacak.",
      consistency: "Ulangi resep dengan pola tuang dan waktu yang sama sebelum mengubah variabel lain.",
      aftertaste: "Kurangi ekstraksi akhir dan hindari tuang agresif pada fase terakhir.",
      finish: "Periksa drawdown dan suhu akhir agar kebersihan akhir lebih baik.",
      aroma: "Pastikan kopi cukup segar dan bloom membasahi seluruh permukaan secara merata.",
      flavor: "Evaluasi rasio, suhu, dan gilingan sebagai tiga pengungkit utama rasa."
    };
    const status = Number(finalScore) >= 8.5 ? "Sangat baik" : Number(finalScore) >= 7.5 ? "Layak dipertahankan" : Number(finalScore) >= 6.5 ? "Lolos dengan catatan" : "Perlu percobaan ulang";
    const targetText = context.target && context.target !== "balanced" ? ` Fokus berikutnya: ${context.target}.` : "";
    return {
      status,
      weakest: weakest.label,
      strongest: strongest.label,
      message: `${status}. Kekuatan utama ada pada ${strongest.label}; prioritas perbaikan berikutnya adalah ${weakest.label}.${targetText}`,
      advice: advice[weakest.key] || advice.balance
    };
  }

  const ISSUE_PLANS = Object.freeze({
    sour: { label: "Masih asam mentah", variable: "Gilingan", direction: "sedikit lebih halus", expected: "ekstraksi dan kemanisan meningkat", avoid: "Jangan sekaligus menaikkan suhu dan menambah agitasi." },
    sharp: { label: "Acidity terlalu tajam", variable: "Suhu", direction: "turun 1°C", expected: "acidity lebih membulat", avoid: "Pertahankan rasio dan gilingan untuk membaca dampak suhu." },
    bitter: { label: "Pahit dominan", variable: "Gilingan", direction: "sedikit lebih kasar", expected: "ekstraksi akhir berkurang", avoid: "Hindari memperpendek rasio sekaligus." },
    dry: { label: "Kering atau sepat", variable: "Agitasi", direction: "lebih rendah pada tuang akhir", expected: "finish lebih bersih", avoid: "Jangan mengaduk atau melakukan swirl agresif." },
    thin: { label: "Body terlalu tipis", variable: "Rasio", direction: "lebih pendek 0,3–0,5", expected: "tekstur dan konsentrasi meningkat", avoid: "Pertahankan suhu dan pola tuang." },
    flat: { label: "Rasa datar", variable: "Suhu", direction: "naik 1°C", expected: "aroma dan intensitas rasa meningkat", avoid: "Jangan mengubah gilingan pada percobaan yang sama." },
    muddy: { label: "Rasa keruh", variable: "Agitasi", direction: "lebih rendah", expected: "kejernihan rasa meningkat", avoid: "Jaga ketinggian tuang lebih dekat dengan bed kopi." },
    weak_aroma: { label: "Aroma lemah", variable: "Bloom", direction: "lebih merata selama 35–45 detik", expected: "pelepasan gas dan aroma lebih baik", avoid: "Jangan memperpanjang bloom terlalu jauh pada kopi yang sudah lama." }
  });

  function diagnose({ metrics = {}, finalScore = 0, issue = "none", target = "balanced", previous = null } = {}) {
    const normalized = normalizeMetrics(metrics);
    const { entries, weakest, strongest } = rank(normalized);
    const chosen = ISSUE_PLANS[issue] || null;
    const fallbackByMetric = {
      clarity: ISSUE_PLANS.muddy,
      sweetness: ISSUE_PLANS.sour,
      body: ISSUE_PLANS.thin,
      acidity: ISSUE_PLANS.sharp,
      aftertaste: ISSUE_PLANS.dry,
      finish: ISSUE_PLANS.dry,
      aroma: ISSUE_PLANS.weak_aroma,
      consistency: { label: "Hasil belum konsisten", variable: "Teknik", direction: "ulangi resep tanpa perubahan", expected: "variabilitas teknik dapat dipisahkan dari masalah resep", avoid: "Jangan mengubah parameter sebelum dua pengulangan." },
      balance: { label: "Belum seimbang", variable: "Gilingan", direction: "ubah satu langkah kecil", expected: "arah ekstraksi lebih mudah dibaca", avoid: "Jangan mengubah lebih dari satu variabel." },
      flavor: { label: "Intensitas rasa rendah", variable: "Gilingan", direction: "sedikit lebih halus", expected: "intensitas rasa meningkat", avoid: "Pertahankan suhu dan rasio." }
    };
    const plan = chosen || fallbackByMetric[weakest.key] || fallbackByMetric.balance;
    const delta = previous ? Number((Number(finalScore) - Number(previous.finalScore || 0)).toFixed(2)) : null;
    const comparison = previous
      ? delta > 0.05 ? `Nilai naik ${delta.toFixed(2)} dari evaluasi pembanding.`
        : delta < -0.05 ? `Nilai turun ${Math.abs(delta).toFixed(2)} dari evaluasi pembanding.`
          : "Nilai relatif sama dengan evaluasi pembanding."
      : "Belum ada evaluasi pembanding untuk profil ini.";

    return {
      status: Number(finalScore) >= 8.5 ? "Pertahankan sebagai resep kontrol" : Number(finalScore) >= 6.5 ? "Lakukan satu iterasi terarah" : "Perbaiki sebelum dipublikasikan",
      summary: `${plan.label}. Ubah ${plan.variable.toLowerCase()} ${plan.direction}.`,
      variable: plan.variable,
      direction: plan.direction,
      expected: plan.expected,
      avoid: plan.avoid,
      target,
      weakest,
      strongest,
      entries,
      comparison,
      delta
    };
  }

  function compare(current = {}, previous = {}) {
    const currentMetrics = normalizeMetrics(current);
    const previousMetrics = normalizeMetrics(previous);
    return Object.keys({ ...currentMetrics, ...previousMetrics }).map(key => {
      const before = Number(previousMetrics[key] || 0);
      const after = Number(currentMetrics[key] || 0);
      return { key, label: LABELS[key] || key, before, after, delta: Number((after - before).toFixed(2)) };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  services.qa = Object.freeze({ score, normalizeMetrics, rank, guidance, diagnose, compare });
})();
