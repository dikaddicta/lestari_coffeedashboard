# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, dan menjelajahi pustaka referensi kopi.

## Release aktif

**v41.0.0 — Analytics & Cost Insight**

Release ini memperkuat menu Analitik Seduhan agar tidak hanya menampilkan nilai QA, tetapi juga membantu membaca konsumsi kopi dan estimasi biaya biji per cangkir.

Pembaruan utama:

- filter analitik berdasarkan cakupan, periode, dan nilai QA minimum;
- metrik total seduhan, rata-rata QA, pemakaian biji, biaya per cangkir, dan total biaya biji;
- grafik tren QA dan konsumsi biji;
- rincian biaya berdasarkan biji kopi;
- insight otomatis untuk konsistensi, arah kualitas, kelengkapan data biaya, konsumsi, dan estimasi daya tahan stok;
- biaya biji pada tabel resep terbaik dan laporan HTML;
- perbaikan tombol refresh Analitik yang sebelumnya memakai ID berbeda;
- label harga stok diperjelas menjadi Harga Pembelian.

Perhitungan biaya menggunakan harga pembelian pada data stok. Berat pembelian diperkirakan dari stok tersisa ditambah seluruh pemakaian stok yang tercatat. Karena itu, nilai biaya ditampilkan sebagai estimasi dan akan lebih akurat jika setiap seduhan selalu dihubungkan ke stok.

## Fitur utama

- Rekomendasi seduh berdasarkan varietas, pascapanen, profil sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan 1–3 varietas, proses manual, detail pour, Switch valve plan, QA, dan validasi resep.
- Hasil seduhan publik dengan batas QA minimum 6.5.
- Biji kopi dan stok privat per workspace.
- Pengurangan stok saat draft seduhan menggunakan biji dari inventori serta pemulihan stok saat log dihapus.
- Log Seduh & QA dengan diagnosis masalah rasa dan saran dial-in berikutnya.
- Analitik kualitas, konsumsi, biaya per cangkir, dan insight otomatis.
- Role Admin, QA, Brewer, serta mode Guest dan Demo.
- Pustaka data varietas, proses, dripper/setup, filter kertas, profil sangrai, air, dan grinder.
- PWA dengan clean URL untuk 14 menu.

## Data referensi

| Dataset | Jumlah |
|---|---:|
| Varietas | 180 |
| Proses pascapanen | 81 |
| Dripper/setup | 74 |
| Filter kertas | 2 |
| Profil sangrai | 18 |
| Profil air | 15 |
| Grinder | 16 |

## Struktur project

```text
.
├─ index.html
├─ 404.html
├─ <route>/index.html
├─ src/
│  ├─ shell.html
│  ├─ routes.json
│  └─ pages/
├─ assets/
│  ├─ app.js
│  ├─ app-config.js
│  ├─ data.js
│  ├─ core/
│  ├─ pages/
│  ├─ services/
│  │  ├─ analytics-service.js
│  │  ├─ auth-service.js
│  │  ├─ brew-service.js
│  │  ├─ notification-service.js
│  │  ├─ qa-service.js
│  │  ├─ recommendation-service.js
│  │  ├─ stock-service.js
│  │  ├─ storage-service.js
│  │  └─ supabase-service.js
│  └─ css/
│     ├─ analytics-insight.css
│     ├─ intelligence.css
│     ├─ welcome.css
│     └─ workflow.css
├─ scripts/
│  ├─ analytics-insight-audit.mjs
│  ├─ build-pages.mjs
│  ├─ functional-audit.mjs
│  └─ release-check.mjs
├─ supabase/
└─ docs/
```

## Mengubah halaman

Edit isi menu melalui `src/pages/`, metadata route melalui `src/routes.json`, dan kerangka global melalui `src/shell.html`. Jangan mengedit `index.html` atau folder route hasil build secara langsung.

Setelah perubahan:

```powershell
npm run build
npm run check
```

## Menjalankan secara lokal

Persyaratan: Node.js 18 atau lebih baru.

```powershell
cd "D:\PRIBADI\4. WEBSITE\coffee_dashboard"
npm run check
npm run serve
```

Buka `http://127.0.0.1:4173/`.

## Audit sebelum release

`npm run check` menjalankan build dan seluruh audit modular page, clean URL, page module, service layer, core workflow, recommendation engine, QA diagnostics, analytics insight, asset, PWA, konfigurasi Supabase, dan validasi dataset.

Hasil functional audit tersimpan pada `docs/V41_AUDIT_RESULT.json`.

## Supabase

Gunakan hanya Project URL dan anon/public key pada `assets/supabase-config.js`. Jangan meletakkan `service_role` key di frontend.

Tidak ada migrasi database baru pada v41. Analitik biaya menggunakan field `price`, `stock_g`, dan histori `stock_usage_g` yang sudah tersedia pada schema sebelumnya.

## Workflow Git

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v41 analytics and cost insight"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis.

## PWA dan cache

Cache aktif:

```text
coffee-brew-os-v41-analytics-cost
```

Setelah deployment besar, uji melalui Incognito atau hapus service worker lama satu kali bila browser masih menampilkan aset versi sebelumnya.

## Batasan release

- Nilai biaya merupakan estimasi biaya biji, belum mencakup air, listrik, filter, susu, es, tenaga kerja, atau overhead coffee shop.
- Akurasi biaya bergantung pada harga stok dan hubungan Brew Log dengan stok yang benar.
- Sebagian besar orchestration UI masih berada di `assets/app.js`; pemisahan dilakukan bertahap untuk mengurangi risiko regresi.
- Audit otomatis tidak menggantikan pengujian end-to-end dengan akun, workspace, role, dan database Supabase aktif.
- Rekomendasi resep merupakan baseline dial-in, bukan jaminan hasil rasa identik pada setiap kopi dan alat.
