# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk merancang rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, dan menjelajahi pustaka referensi kopi.

## Release aktif

**v35.1.0 — Functional Stabilization**

Release ini mempertahankan visual **Modern Coffee SaaS — Quiet Luxury** dari v35, lalu memperkuat fondasi fungsi, cache, penyimpanan browser, audit otomatis, dan workflow deployment.

Perubahan lengkap tersedia pada:

```text
docs/CHANGELOG_v35_1.md
docs/V35_1_FUNCTIONAL_AUDIT.md
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
├─ index.html
├─ package.json
├─ manifest.webmanifest
├─ sw.js
├─ assets/
│  ├─ app-config.js
│  ├─ app.js
│  ├─ data.js
│  ├─ supabase-config.js
│  ├─ styles.css
│  ├─ styles-v35-quiet-luxury.css
│  ├─ styles-v35-1-functional.css
│  └─ core/
│     └─ runtime.js
├─ scripts/
│  ├─ functional-audit.mjs
│  ├─ release-check.mjs
│  ├─ serve-local.mjs
│  ├─ pre-push-check.ps1
│  ├─ setup-git-safe.ps1
│  └─ git-safe-update.ps1
├─ supabase/
│  ├─ schema.sql
│  ├─ supabase_repair_v8_stable.sql
│  ├─ README.md
│  └─ archive/
├─ docs/
└─ .github/workflows/quality-check.yml
```

Aplikasi masih menggunakan arsitektur static single-page app. `package.json` hanya menyediakan tooling audit dan local server; tidak ada dependency npm atau proses build.

## Menjalankan secara lokal

Persyaratan: Node.js 18 atau lebih baru.

```powershell
cd "D:\PRIBADI\4. WEBSITE\coffee_dashboard"
npm run check
npm run serve
```

Buka:

```text
http://127.0.0.1:4173
```

Live Server di VS Code tetap dapat digunakan, tetapi `npm run serve` direkomendasikan karena tidak membutuhkan extension tambahan dan mengirim header `Cache-Control: no-store` untuk pengujian lokal.

## Audit sebelum release

Jalankan:

```powershell
npm run check
git diff --check
```

Audit memeriksa syntax, route, asset, tipe tombol, urutan script, safe storage, Supabase browser key, service worker, serta integritas dataset. Hasil audit mesin disimpan di:

```text
docs/V35_1_AUDIT_RESULT.json
```

GitHub Actions juga menjalankan pemeriksaan yang sama ketika ada push ke `main` atau `development`, serta ketika pull request menuju `main` dibuat.

## Konfigurasi Supabase

Konfigurasi browser berada pada:

```text
assets/supabase-config.js
```

Gunakan hanya:

- Supabase Project URL.
- Supabase anon/public key.

Jangan pernah menaruh `service_role` key di frontend atau repository. Anon key memang dapat terlihat oleh browser; keamanan data harus ditegakkan melalui Row Level Security.

### Database baru

Jalankan:

```text
supabase/schema.sql
```

### Database lama

Baca:

```text
supabase/README.md
```

Gunakan repair script atau migration historis secara sadar. Lakukan backup database sebelum mengubah schema atau RLS.

## Workflow Git yang aman

Sebelum mulai bekerja:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
```

Sebelum commit dan push:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pre-push-check.ps1
git add -A
git commit -m "Deskripsi perubahan"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis. Jangan memakai `push --force` pada branch `main`.

## Catatan PWA dan cache

v35.1 menggunakan cache:

```text
coffee-brew-os-v35-1-functional
```

Fallback `index.html` hanya dipakai untuk navigasi halaman. File CSS atau JavaScript yang gagal dimuat tidak lagi diganti dengan HTML.

Setelah deployment besar, uji website melalui Incognito. Clear site data hanya diperlukan bila browser masih mempertahankan service worker versi lama.

## Batasan release ini

- Pengujian otomatis bersifat statis dan tidak menggantikan uji end-to-end dengan session Supabase aktif.
- Seluruh menu masih berada dalam satu `index.html` dan satu file aplikasi utama yang besar.
- Pemisahan menu menjadi page/module terpisah direncanakan untuk fase arsitektur berikutnya.
- Rekomendasi grinder, air, dan resep adalah titik awal dial-in, bukan jaminan hasil rasa yang sama pada setiap alat dan biji kopi.

## Dokumen penting

- `docs/CHANGELOG_v35_1.md`
- `docs/V35_1_FUNCTIONAL_AUDIT.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/GIT_SAFE_UPDATE_SOP.md`
- `docs/PUSH_TO_GITHUB.md`
