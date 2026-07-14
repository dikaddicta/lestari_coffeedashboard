# Lestari Coffee Dashboard

Lestari Coffee Dashboard adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, serta menjelajahi pustaka referensi kopi.

## Release aktif

**v44.0.0-rc.3 — Release Candidate 3**

Release ini mengintegrasikan identitas sementara **Lestari Coffee Dashboard** dan memakai gambar bunga yang dikirim pengguna sebagai logo utama, favicon, Apple Touch Icon, serta icon PWA. Bentuk logo tidak digambar ulang; adaptasi hanya berupa resize, padding, dan penempatan pada bidang espresso untuk icon kecil. Social preview dan detail brand lain masih bersifat placeholder hingga aset final disiapkan.

Pembaruan utama:

- `src/site.json` menjadi sumber konfigurasi versi, URL, identitas produk, maintenance, dan monitoring;
- `release.json` untuk verifikasi versi runtime dan build yang sedang ter-deploy;
- Open Graph dan Twitter Card pada root, clean route, serta halaman publik;
- social preview 1200×630;
- halaman publik `/rilis/`;
- status browser memeriksa HTTPS, release manifest, monitoring, PWA, storage, dan diagnostik;
- monitoring cloud nonaktif secara default dan tidak mengirim data tanpa endpoint yang dikonfigurasi;
- template email konfirmasi akun, reset password, dan magic link untuk Supabase Auth;
- panduan deployment produksi, konfigurasi email, serta backup dan recovery database;
- audit baru melalui `npm run audit:rc`.

## Fitur utama

- Rekomendasi seduh berdasarkan profil biji, pascapanen, sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan validasi rasio, pour, suhu, waktu, bloom, dan Japanese Iced.
- Log Seduh & QA dengan diagnosis rasa dan saran dial-in berikutnya.
- Stok privat per workspace dengan estimasi cangkir dan pengurangan stok.
- Analitik kualitas, konsumsi, biaya biji per cangkir, dan insight otomatis.
- Role Admin, QA, Brewer, serta mode Guest dan Demo.
- Matriks izin, RLS, perlindungan admin terakhir, dan audit trail workspace.
- Backup lokal terverifikasi, diagnostik tersanitasi, maintenance mode, dan halaman legal.
- Pustaka data varietas, proses, dripper/setup, filter, sangrai, air, dan grinder.
- PWA dengan clean URL untuk 14 menu dan enam halaman informasi publik.

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
├─ release.json
├─ 404.html
├─ <route>/index.html
├─ privasi/
├─ ketentuan/
├─ disclaimer/
├─ status/
├─ maintenance/
├─ rilis/
├─ src/
│  ├─ site.json
│  ├─ shell.html
│  ├─ public-shell.html
│  ├─ routes.json
│  ├─ public-pages.json
│  ├─ pages/
│  └─ public/
├─ assets/
│  ├─ app.js
│  ├─ app-config.js
│  ├─ social-preview.png
│  ├─ brand/
│  ├─ icons/
│  ├─ core/
│  ├─ pages/
│  ├─ public/
│  ├─ services/
│  │  ├─ release-service.js
│  │  ├─ monitoring-service.js
│  │  ├─ backup-service.js
│  │  ├─ error-service.js
│  │  └─ ...
│  └─ css/
├─ scripts/
│  ├─ build-release.mjs
│  ├─ build-all.mjs
│  ├─ build-pages.mjs
│  ├─ build-public-pages.mjs
│  ├─ release-candidate-audit.mjs
│  └─ release-check.mjs
├─ supabase/
└─ docs/
```

## Sumber konfigurasi

Perubahan identitas produk, URL deployment, versi, maintenance, dan monitoring dilakukan melalui:

```text
src/site.json
```

Jangan mengedit `assets/app-config.js`, `release.json`, `manifest.webmanifest`, `index.html`, atau folder route hasil build secara langsung. File tersebut dihasilkan ulang oleh build.

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

Buka:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/status/
http://127.0.0.1:4173/rilis/
```

## Monitoring

Monitoring cloud default-nya nonaktif:

```json
"monitoring": {
  "enabled": false,
  "endpoint": ""
}
```

Ketika nonaktif, diagnostik hanya tersimpan lokal di browser. Aktivasi monitoring harus disertai endpoint yang aman, CORS, rate limit, retensi, dan pembaruan Kebijakan Privasi.

## Backup dan pemulihan

- Backup menu **Ekspor & Laporan** hanya melindungi data lokal browser.
- Backup tersebut tidak menggantikan backup database Supabase.
- Panduan database tersedia pada `docs/V44_DATABASE_BACKUP_RUNBOOK.md`.
- Panduan deployment tersedia pada `docs/V44_PRODUCTION_DEPLOYMENT.md`.

## Maintenance mode

Ubah `maintenance.enabled` pada `src/site.json`, lalu jalankan build:

```powershell
npm run build
npm run check
```

Halaman privasi, ketentuan, disclaimer, status, maintenance, dan catatan rilis tetap dapat dibuka.

## Supabase

Frontend hanya boleh menggunakan Project URL dan `anon/public key` pada `assets/supabase-config.js`. Jangan meletakkan `service_role` key di frontend.

Migration keamanan v42 tetap wajib diterapkan dan diuji:

```text
supabase/migration_v42_security_audit_rls.sql
```

v44 tidak menambahkan migration database baru.

Template autentikasi tersedia pada:

```text
docs/email-templates/
```

## Workflow Git

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v44 RC1"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis.

## PWA dan cache

```text
coffee-brew-os-v44-rc1
```

Setelah deployment besar, uji melalui Incognito atau hapus service worker lama satu kali apabila browser masih menampilkan aset lama.

## Batasan release candidate

- Belum dilakukan pengujian end-to-end terhadap seluruh role dan workspace pada database Supabase aktif dari environment build ini.
- Migration keamanan v42 harus diverifikasi melalui test plan sebelum produksi.
- SMTP, custom domain, monitoring cloud, dan backup database off-site belum otomatis aktif.
- Dokumen legal masih membutuhkan review hukum dan identitas badan usaha sebelum layanan berbayar.
- Release candidate belum sama dengan general availability.
