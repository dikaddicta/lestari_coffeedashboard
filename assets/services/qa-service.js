(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};

  function score(values = [], defectPenalty = 0) {
    const normalized = values.map(Number).filter(Number.isFinite).map(value => Math.min(10, Math.max(0, value)));
    if (!normalized.length) return 0;
    const average = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
    return Number(Math.min(10, Math.max(0, average - (Number(defectPenalty) || 0))).toFixed(2));
  }

  function guidance(metrics = {}, finalScore = 0) {
    const entries = Object.entries(metrics)
      .map(([key, value]) => ({ key, value: Number(value) || 0 }))
      .sort((a, b) => a.value - b.value);
    const weakest = entries[0] || { key: "balance", value: 0 };
    const strongest = entries[entries.length - 1] || weakest;
    const labels = {
      aroma: "aroma", flavor: "rasa", aftertaste: "aftertaste", acidity: "acidity",
      sweetness: "sweetness", body: "body", balance: "balance", clarity: "clarity",
      finish: "finish", consistency: "konsistensi"
    };
    const advice = {
      clarity: "Kurangi agitasi atau gunakan gilingan sedikit lebih kasar untuk menjaga clarity.",
      sweetness: "Coba naikkan ekstraksi secara bertahap melalui gilingan sedikit lebih halus atau suhu +1°C.",
      body: "Gunakan rasio sedikit lebih pendek atau tambah kontak air untuk meningkatkan body.",
      acidity: "Turunkan suhu sedikit atau gunakan air dengan alkalinitas lebih seimbang bila acidity terasa tajam.",
      balance: "Ubah satu variabel saja pada seduhan berikutnya agar penyebab ketidakseimbangan mudah dilacak.",
      consistency: "Ulangi resep dengan pola pour dan waktu yang sama sebelum mengubah variabel lain.",
      aftertaste: "Kurangi ekstraksi akhir atau hindari pour agresif di fase terakhir.",
      finish: "Periksa drawdown dan temperatur akhir agar finish lebih bersih.",
      aroma: "Gunakan kopi yang lebih segar dan pastikan bloom cukup untuk membantu pelepasan gas.",
      flavor: "Evaluasi kembali rasio, suhu, dan grind sebagai tiga pengungkit utama rasa."
    };
    const status = Number(finalScore) >= 8.5 ? "Sangat baik" : Number(finalScore) >= 7.5 ? "Siap dipertahankan" : Number(finalScore) >= 6.5 ? "Lolos dengan catatan" : "Perlu iterasi";
    return {
      status,
      weakest: labels[weakest.key] || weakest.key,
      strongest: labels[strongest.key] || strongest.key,
      message: `${status}. Kekuatan utama ada pada ${labels[strongest.key] || strongest.key}; prioritas perbaikan berikutnya adalah ${labels[weakest.key] || weakest.key}.`,
      advice: advice[weakest.key] || advice.balance
    };
  }

  services.qa = Object.freeze({ score, guidance });
})();
