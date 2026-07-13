# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, dan menjelajahi pustaka referensi kopi.

## Release aktif

**v38.0.0 — Services & Welcome Refinement**

Release ini melanjutkan clean URL dan modular page v37 dengan dua fokus:

1. halaman pembuka dibangun ulang agar lebih rapi, natural, dan mudah dipahami;
2. akses browser storage dan inisialisasi Supabase mulai dipindahkan ke service layer.

Judul pembuka sekarang menggunakan kalimat yang lebih natural:

> Seduh lebih rapi. Hasil lebih konsisten.

Pilihan akses juga disederhanakan menjadi Masuk ke Dashboard, Buat Akun, Jelajahi sebagai Tamu, dan Lihat Data Demo.

## Fitur utama

- Rekomendasi seduh berdasarkan varietas, proses pascapanen, profil sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan detail pour, Switch valve plan, evaluasi sensorik, dan QA.
- Hasil seduhan publik dengan threshold QA minimum 6.5.
- Biji kopi dan stok privat per workspace.
- Pengurangan stok saat brew menggunakan bean dari stok serta pemulihan stok ketika brew dihapus melalui alur yang didukung.
- Log Seduh & QA, moderasi, analitik, notifikasi kualitas, ekspor, dan laporan.
- Role Admin, QA, Brewer, serta mode Guest.
- Pustaka data varietas, proses, dripper/setup, filter kertas, profil sangrai, air, dan grinder.
- PWA dengan cache untuk seluruh clean route, page module, dan service layer.

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
├─ index.html                    # hasil build untuk root
├─ 404.html                      # fallback GitHub Pages
├─ beranda/index.html            # clean URL entry point
├─ cara-pakai/index.html
├─ ...                           # 14 clean URL entry points
├─ src/
│  ├─ shell.html                 # kerangka aplikasi dan welcome screen
│  ├─ routes.json                # manifest halaman
│  └─ pages/                     # 14 menu, satu file per menu
├─ assets/
│  ├─ app-config.js
│  ├─ app.js                     # business logic utama, masih dalam proses refactor
│  ├─ data.js
│  ├─ supabase-config.js
│  ├─ core/
│  │  ├─ routes.js               # hasil build
│  │  ├─ navigation.js           # History API dan clean URL
│  │  ├─ page-modules.js         # registry lifecycle halaman
│  │  └─ runtime.js
│  ├─ services/
│  │  ├─ storage-service.js      # penyimpanan browser dan auth adapter
│  │  └─ supabase-service.js     # validasi config dan pembuatan client
│  ├─ pages/                     # renderer orchestration per menu
│  └─ css/
│     ├─ welcome.css             # seluruh layout halaman pembuka v38
│     └─ ...
├─ scripts/
│  ├─ build-pages.mjs
│  ├─ clean-url-audit.mjs
│  ├─ page-modules-audit.mjs
│  ├─ service-layer-audit.mjs
│  ├─ functional-audit.mjs
│  └─ release-check.mjs
├─ supabase/
└─ docs/
```

## Mengubah halaman

Edit konten menu melalui:

```text
src/pages/
```

Ubah route atau metadata melalui:

```text
src/routes.json
```

Ubah halaman pembuka melalui:

```text
src/shell.html
assets/css/welcome.css
```

Jangan mengedit `index.html` atau folder route hasil build secara manual karena semuanya dibuat ulang oleh `npm run build`.

## Menjalankan secara lokal

Persyaratan: Node.js 18 atau lebih baru.

```powershell
cd "D:\PRIBADI\4. WEBSITE\coffee_dashboard"
npm run build
npm run check
npm run serve
```

Buka:

```text
http://127.0.0.1:4173/
```

## Audit sebelum release

```powershell
npm run check
git diff --check
```

`npm run check` menjalankan:

1. build halaman dan clean route;
2. audit page fragment;
3. audit clean URL;
4. audit page module;
5. audit service layer;
6. functional audit aplikasi, asset, PWA, Supabase browser config, dan dataset.

Hasil audit mesin disimpan pada:

```text
docs/V38_AUDIT_RESULT.json
```

## Konfigurasi Supabase

Konfigurasi browser berada pada `assets/supabase-config.js`. Gunakan hanya Project URL dan anon/public key. Jangan menaruh `service_role` key di frontend atau repository. Keamanan data harus ditegakkan melalui Row Level Security.

## Workflow Git yang aman

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v38 services and welcome refinement"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis. Jangan memakai `push --force` pada branch `main`.

## PWA dan cache

v38 menggunakan cache:

```text
coffee-brew-os-v38-services-welcome
```

Setelah deployment besar, uji website melalui Incognito. Clear site data diperlukan bila browser masih mempertahankan service worker versi lama.

## Batasan release

- Storage dan Supabase client creation sudah dipisahkan, tetapi sebagian besar business logic masih berada di `assets/app.js` untuk menjaga kompatibilitas fungsi.
- Pengujian otomatis belum menggantikan uji end-to-end login, role, CRUD, dan sinkronisasi dengan session Supabase aktif.
- Clean route dibuat sebagai static entry point agar kompatibel dengan GitHub Pages tanpa server rewrite.
- Rekomendasi grinder, air, dan resep adalah titik awal dial-in, bukan jaminan hasil rasa yang sama pada setiap alat dan biji kopi.
