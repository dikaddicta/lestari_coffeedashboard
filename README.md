# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, dan menjelajahi pustaka referensi kopi.

## Release aktif

**v39.0.0 — Core Workflow Modules**

Release ini memindahkan fondasi workflow utama dari satu file aplikasi besar ke modul yang dapat diuji dan digunakan ulang. Fokusnya bukan menambah dekorasi, tetapi membuat alur stok, seduhan, dan QA lebih aman untuk dikembangkan.

Pembaruan utama:

- state aplikasi dipusatkan melalui `assets/core/app-state.js`;
- lifecycle fitur memakai event bus melalui `assets/core/event-bus.js`;
- validasi form dipusatkan melalui `assets/core/validation.js`;
- auth, stok, seduhan, QA, dan notifikasi mulai menggunakan service terpisah;
- Input Seduhan memiliki pemeriksaan konsistensi dosis, rasio, total air, suhu, waktu, dan detail pour;
- QA memberi arahan otomatis berdasarkan parameter sensorik terlemah;
- tabel stok menampilkan estimasi jumlah cangkir dan status ketersediaan.

## Fitur utama

- Rekomendasi seduh berdasarkan varietas, pascapanen, profil sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan 1–3 varietas, proses manual, detail pour, Switch valve plan, QA, dan validasi resep.
- Hasil seduhan publik dengan batas QA minimum 6.5.
- Biji kopi dan stok privat per workspace.
- Pengurangan stok saat draft seduhan menggunakan biji dari inventori serta pemulihan stok saat log dihapus melalui RPC Supabase yang sudah tersedia.
- Log Seduh & QA, moderasi, analitik, notifikasi kualitas, ekspor, dan laporan.
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
├─ <route>/index.html            # 14 clean URL entry points
├─ src/
│  ├─ shell.html
│  ├─ routes.json
│  └─ pages/                     # satu fragment HTML per menu
├─ assets/
│  ├─ app.js                     # orchestration lama yang sedang diperkecil bertahap
│  ├─ app-config.js
│  ├─ data.js
│  ├─ core/
│  │  ├─ app-state.js
│  │  ├─ event-bus.js
│  │  ├─ validation.js
│  │  ├─ navigation.js
│  │  ├─ page-modules.js
│  │  ├─ routes.js
│  │  └─ runtime.js
│  ├─ services/
│  │  ├─ auth-service.js
│  │  ├─ brew-service.js
│  │  ├─ notification-service.js
│  │  ├─ qa-service.js
│  │  ├─ stock-service.js
│  │  ├─ storage-service.js
│  │  └─ supabase-service.js
│  ├─ pages/
│  └─ css/
│     ├─ welcome.css
│     ├─ workflow.css
│     └─ ...
├─ scripts/
│  ├─ build-pages.mjs
│  ├─ workflow-modules-audit.mjs
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

`npm run check` menjalankan build, audit modular page, clean URL, page module, service layer, core workflow module, functional audit, asset check, PWA check, konfigurasi browser Supabase, dan validasi jumlah dataset.

Hasil functional audit tersimpan pada `docs/V39_AUDIT_RESULT.json`.

## Supabase

Gunakan hanya Project URL dan anon/public key pada `assets/supabase-config.js`. Jangan meletakkan `service_role` key di frontend. Tidak ada migrasi database baru pada v39; release ini menggunakan schema dan RPC yang sudah ada.

## Workflow Git

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v39 core workflow modules"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis.

## PWA dan cache

Cache aktif:

```text
coffee-brew-os-v39-core-workflow
```

Setelah deployment besar, uji melalui Incognito atau hapus service worker lama satu kali bila browser masih menampilkan asset versi sebelumnya.

## Batasan release

- Sebagian besar orchestration UI masih berada di `assets/app.js`; pemisahan dilakukan bertahap untuk mengurangi risiko regresi.
- Penyimpanan draft seduhan dan pengurangan stok masih dua operasi terpisah. Race condition ekstrem hanya dapat dihilangkan melalui RPC transaksi gabungan pada tahap database berikutnya.
- Audit otomatis tidak menggantikan pengujian end-to-end dengan akun, workspace, role, dan database Supabase aktif.
- Rekomendasi resep merupakan baseline dial-in, bukan jaminan hasil rasa identik pada setiap kopi dan alat.
