(function () {
  "use strict";

  const pages = [
  {
    "order": 1,
    "tab": "home",
    "route": "beranda",
    "sectionId": "tab-home",
    "title": "Beranda",
    "subtitle": "Ringkasan metrik utama, akses modul, dan informasi pustaka dashboard kopi.",
    "access": "private"
  },
  {
    "order": 2,
    "tab": "guide",
    "route": "cara-pakai",
    "sectionId": "tab-guide",
    "title": "Cara Pakai",
    "subtitle": "Panduan menggunakan dashboard dari rekomendasi hingga publikasi hasil seduhan.",
    "access": "public"
  },
  {
    "order": 3,
    "tab": "brew",
    "route": "rekomendasi-seduh",
    "sectionId": "tab-brew",
    "title": "Rekomendasi Seduh",
    "subtitle": "Titik awal resep seduh berbasis data biji, proses, alat, dan target rasa.",
    "access": "public"
  },
  {
    "order": 4,
    "tab": "input-seduhan",
    "route": "input-seduhan",
    "sectionId": "tab-input-seduhan",
    "title": "Input Seduhan",
    "subtitle": "Masukkan parameter eksperimen seduh untuk dibandingkan dan disimpan.",
    "access": "public"
  },
  {
    "order": 5,
    "tab": "beans",
    "route": "beans",
    "sectionId": "tab-beans",
    "title": "Biji Kopi",
    "subtitle": "Kelola referensi biji, asal, dan atribut pendukung untuk alur kerja internal.",
    "access": "private"
  },
  {
    "order": 6,
    "tab": "stock",
    "route": "stock",
    "sectionId": "tab-stock",
    "title": "Stok",
    "subtitle": "Pantau stok kopi, status bahan, dan ketersediaan untuk eksperimen berikutnya.",
    "access": "private"
  },
  {
    "order": 7,
    "tab": "qa",
    "route": "brew-log-qa",
    "sectionId": "tab-qa",
    "title": "Log Seduh & QA",
    "subtitle": "Catat hasil seduhan, validasi kualitas, dan bangun histori evaluasi internal.",
    "access": "private"
  },
  {
    "order": 8,
    "tab": "public-brews",
    "route": "hasil-seduhan-publik",
    "sectionId": "tab-public-brews",
    "title": "Hasil Seduhan Publik",
    "subtitle": "Lihat hasil seduhan yang telah dipublikasikan dan melewati proses peninjauan.",
    "access": "public"
  },
  {
    "order": 9,
    "tab": "analytics",
    "route": "data-analytics",
    "sectionId": "tab-analytics",
    "title": "Analitik Data",
    "subtitle": "Baca performa seduhan, tren QA, dan pola eksperimen secara ringkas.",
    "access": "private"
  },
  {
    "order": 10,
    "tab": "quality",
    "route": "notification",
    "sectionId": "tab-quality",
    "title": "Notifikasi",
    "subtitle": "Pusat peringatan dan tindakan untuk menjaga kualitas data dan alur kerja.",
    "access": "private"
  },
  {
    "order": 11,
    "tab": "reports",
    "route": "export-report",
    "sectionId": "tab-reports",
    "title": "Ekspor & Laporan",
    "subtitle": "Ekspor data dan rangkum hasil seduhan menjadi laporan yang siap dibagikan.",
    "access": "private"
  },
  {
    "order": 12,
    "tab": "suggestion",
    "route": "saran",
    "sectionId": "tab-suggestion",
    "title": "Saran",
    "subtitle": "Kirim masukan untuk membantu pengembangan Coffee Brew OS.",
    "access": "public"
  },
  {
    "order": 13,
    "tab": "admin",
    "route": "akun-role",
    "sectionId": "tab-admin",
    "title": "Akun & Peran",
    "subtitle": "Kelola akun, peran, dan workspace untuk membuka seluruh modul dashboard.",
    "access": "private"
  },
  {
    "order": 14,
    "tab": "library",
    "route": "pustaka-data",
    "sectionId": "tab-library",
    "title": "Pustaka Data",
    "subtitle": "Jelajahi referensi dripper, filter, varietas, proses, profil sangrai, air, dan grinder.",
    "access": "public"
  }
];
  const byTab = Object.fromEntries(pages.map(page => [page.tab, Object.freeze({ ...page })]));
  const byRoute = Object.fromEntries(pages.map(page => [page.route, byTab[page.tab]]));

  window.COFFEE_PAGES = Object.freeze({
    version: "36.0.0",
    pages: Object.freeze(pages.map(page => byTab[page.tab])),
    byTab: Object.freeze(byTab),
    byRoute: Object.freeze(byRoute),
    routeFor(tab) {
      return byTab[String(tab || "")]?.route || "cara-pakai";
    },
    tabFor(route) {
      return byRoute[String(route || "").toLowerCase()]?.tab || "";
    },
    metaFor(tab) {
      const page = byTab[String(tab || "")] || byTab.home || pages[0];
      return Object.freeze({ title: page.title, subtitle: page.subtitle });
    }
  });
})();
