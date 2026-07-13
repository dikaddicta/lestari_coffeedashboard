# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk merancang rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, dan menjelajahi pustaka referensi kopi.

## Release aktif

**v36.0.0 — Modular Pages Architecture**

v36 mempertahankan fungsi dan visual Quiet Luxury dari v35.1, lalu memisahkan sumber setiap menu menjadi file tersendiri. `index.html` sekarang dihasilkan dari shell, manifest route, dan 14 page fragment.

Dokumen perubahan:

```text
docs/CHANGELOG_v36.md
docs/V36_ARCHITECTURE.md
docs/V36_BUILD_REPORT.txt
```

## Fitur utama

- Rekomendasi seduh berdasarkan varietas, proses pascapanen, profil sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan detail pour, Switch valve plan, evaluasi sensorik, dan QA.
- Hasil seduhan publik dengan threshold QA minimum 6.5.
- Biji kopi dan stok privat per workspace.
- Pengurangan stok saat brew menggunakan bean dari stok serta pemulihan stok ketika brew dihapus melalui alur yang didukung.
- Log Seduh & QA, moderasi, analitik, notifikasi kualitas, ekspor, dan laporan.
- Role Admin, QA, Brewer, serta mode Guest.
- Pustaka data varietas, proses, dripper/setup, filter kertas, profil sangrai, air, dan grinder.
- PWA untuk cache asset dasar dan pengalaman offline terbatas.

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
├─ index.html                    # hasil build
├─ src/
│  ├─ shell.html                 # kerangka aplikasi
│  ├─ routes.json                # manifest halaman
│  └─ pages/                     # 14 menu, satu file per menu
├─ assets/
│  ├─ app-config.js
│  ├─ app.js
│  ├─ data.js
│  ├─ supabase-config.js
│  ├─ core/
│  │  ├─ routes.js               # hasil build
│  │  └─ runtime.js
│  └─ css/
│     ├─ tokens.css
│     ├─ base.css
│     ├─ layout.css
│     ├─ components.css
│     └─ pages.css
├─ scripts/
│  ├─ build-pages.mjs
│  ├─ modular-pages-audit.mjs
│  ├─ functional-audit.mjs
│  ├─ release-check.mjs
│  └─ serve-local.mjs
├─ supabase/
├─ docs/
└─ .github/workflows/quality-check.yml
```

## Mengubah halaman

Edit menu melalui file pada:

```text
src/pages/
```

Ubah route atau metadata melalui:

```text
src/routes.json
```

Jangan menjadikan `index.html` sebagai sumber utama karena file tersebut akan dihasilkan ulang.

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
http://127.0.0.1:4173
```

## Audit sebelum release

```powershell
npm run check
git diff --check
```

`npm run check` menjalankan:

1. build page modular;
2. audit manifest dan fragment halaman;
3. functional audit aplikasi, asset, PWA, Supabase browser config, dan dataset.

Hasil audit mesin disimpan pada:

```text
docs/V36_AUDIT_RESULT.json
```

## Konfigurasi Supabase

Konfigurasi browser berada pada `assets/supabase-config.js`. Gunakan hanya Project URL dan anon/public key. Jangan menaruh `service_role` key di frontend atau repository. Keamanan data harus ditegakkan melalui Row Level Security.

Database baru menggunakan `supabase/schema.sql`. Untuk database lama, baca `supabase/README.md` dan lakukan backup sebelum menjalankan repair atau migration.

## Workflow Git yang aman

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Deskripsi perubahan"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis. Jangan memakai `push --force` pada branch `main`.

## PWA dan cache

v36 menggunakan cache:

```text
coffee-brew-os-v36-modular-pages
```

Setelah deployment besar, uji website melalui Incognito. Clear site data hanya diperlukan bila browser mempertahankan service worker lama.

## Batasan release

- Source halaman sudah terpisah, tetapi runtime JavaScript utama masih berada di `assets/app.js` demi kompatibilitas fungsi.
- Navigasi produksi masih menggunakan hash route; clean URL akan dikerjakan setelah lifecycle modul stabil.
- Pengujian otomatis bersifat statis dan tidak menggantikan uji end-to-end dengan session Supabase aktif.
- Rekomendasi grinder, air, dan resep adalah titik awal dial-in, bukan jaminan hasil rasa yang sama pada setiap alat dan biji kopi.
