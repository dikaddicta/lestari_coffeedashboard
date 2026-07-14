# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, serta menjelajahi pustaka referensi kopi.

## Release aktif

**v43.0.0 — Commercial Readiness**

Release ini menyiapkan fondasi operasional sebelum produk dipakai secara lebih luas. Fokusnya adalah transparansi layanan, pemulihan data, diagnostik, status sistem, maintenance mode, SEO dasar, dan persetujuan kebijakan saat pendaftaran.

Pembaruan utama:

- halaman Kebijakan Privasi, Ketentuan Penggunaan, Batasan Rekomendasi, Status Sistem, dan Pemeliharaan;
- persetujuan kebijakan yang wajib dicentang saat membuat akun;
- backup lokal berformat terstruktur dengan checksum SHA-256 bila Web Crypto tersedia;
- pemeriksaan format, versi, checksum, dan jumlah data sebelum pemulihan;
- pencatatan maksimal 25 error lokal yang telah disanitasi;
- ekspor diagnostik tanpa kata sandi, token, atau isi workspace;
- konfigurasi maintenance mode melalui `assets/app-config.js`;
- metadata title, description, Open Graph, dan canonical URL per clean route;
- `robots.txt`, `sitemap.xml`, dan `.well-known/security.txt`;
- halaman 404 yang lebih jelas;
- audit otomatis melalui `npm run audit:commercial`.

## Fitur utama

- Rekomendasi seduh berdasarkan profil biji, pascapanen, sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan validasi rasio, pour, suhu, waktu, bloom, dan Japanese Iced.
- Log Seduh & QA dengan diagnosis rasa dan saran dial-in berikutnya.
- Stok privat per workspace dengan estimasi cangkir dan pengurangan stok.
- Analitik kualitas, konsumsi, biaya biji per cangkir, dan insight otomatis.
- Role Admin, QA, Brewer, serta mode Guest dan Demo.
- Matriks izin, RLS, perlindungan admin terakhir, dan audit trail workspace.
- Pustaka data varietas, proses, dripper/setup, filter, sangrai, air, dan grinder.
- PWA dengan clean URL untuk 14 menu dan lima halaman informasi publik.

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
├─ privasi/
├─ ketentuan/
├─ disclaimer/
├─ status/
├─ maintenance/
├─ src/
│  ├─ shell.html
│  ├─ public-shell.html
│  ├─ routes.json
│  ├─ public-pages.json
│  ├─ pages/
│  └─ public/
├─ assets/
│  ├─ app.js
│  ├─ app-config.js
│  ├─ core/
│  ├─ pages/
│  ├─ public/
│  ├─ services/
│  │  ├─ backup-service.js
│  │  ├─ error-service.js
│  │  ├─ security-service.js
│  │  └─ ...
│  └─ css/
│     ├─ commercial-readiness.css
│     ├─ public-pages.css
│     └─ ...
├─ scripts/
│  ├─ build-all.mjs
│  ├─ build-pages.mjs
│  ├─ build-public-pages.mjs
│  ├─ commercial-readiness-audit.mjs
│  └─ release-check.mjs
├─ supabase/
└─ docs/
```

## Mengubah halaman

- Menu dashboard: `src/pages/`
- Metadata route: `src/routes.json`
- Kerangka dashboard: `src/shell.html`
- Halaman informasi publik: `src/public/`
- Metadata halaman publik: `src/public-pages.json`
- Kerangka halaman publik: `src/public-shell.html`

Jangan mengedit `index.html` atau folder route hasil build secara langsung.

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
http://127.0.0.1:4173/privasi/
```

## Backup dan pemulihan

Gunakan menu **Ekspor & Laporan → Backup & pemulihan lokal**. Pemulihan mengganti data lokal browser, tetapi tidak otomatis menulis atau menghapus data Supabase.

Panduan detail tersedia pada `docs/V43_BACKUP_RECOVERY_GUIDE.md`.

## Maintenance mode

Ubah nilai berikut pada `assets/app-config.js`:

```js
maintenance: {
  enabled: true,
  title: "Pemeliharaan terjadwal",
  message: "Dashboard kembali tersedia setelah pemeliharaan selesai."
}
```

Jalankan `npm run build`, lalu deploy. Halaman privasi, ketentuan, disclaimer, status, dan maintenance tetap dapat dibuka.

## Supabase

Frontend hanya boleh menggunakan Project URL dan `anon/public key` pada `assets/supabase-config.js`. Jangan meletakkan `service_role` key di frontend.

Untuk project aktif, migration keamanan v42 tetap wajib diterapkan dan diuji:

```text
supabase/migration_v42_security_audit_rls.sql
```

v43 tidak menambahkan migration database baru.

## Workflow Git

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v43 commercial readiness"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis.

## PWA dan cache

```text
coffee-brew-os-v43-commercial-readiness
```

Setelah deployment besar, uji melalui Incognito atau hapus service worker lama satu kali bila browser masih menampilkan aset lama.

## Batasan release

- Dokumen kebijakan masih perlu review hukum dan identitas badan usaha sebelum layanan berbayar diluncurkan.
- Backup v43 melindungi data lokal browser, bukan pengganti backup database Supabase.
- Status Sistem hanya memeriksa komponen yang dapat dilihat dari browser.
- Diagnostik disimpan lokal dan bukan sistem monitoring server terpusat.
- Pengujian end-to-end tetap perlu dilakukan dengan akun, role, workspace, dan database Supabase aktif.
