# Coffee Brew OS — Lestari Coffee Dashboard

Coffee Brew OS adalah dashboard web untuk menyusun rekomendasi seduh, mencatat eksperimen, mengelola stok biji kopi, melakukan QA, membaca analitik, mengekspor laporan, serta menjelajahi pustaka referensi kopi.

## Release aktif

**v42.0.0 — Akses, Keamanan & Riwayat Aktivitas**

Release ini memperkuat pengelolaan akun dan workspace dengan kontrol peran yang lebih jelas, ringkasan kondisi keamanan, serta audit trail append-only yang ditegakkan melalui Supabase.

Pembaruan utama:

- halaman **Akun & Peran** diperbarui menjadi **Akses & Keamanan** dengan bahasa yang lebih natural;
- matriks izin Admin, QA, Brewer, dan Guest;
- pengelolaan role anggota workspace oleh Admin;
- perlindungan agar admin aktif terakhir tidak dapat diturunkan, ditangguhkan, atau dihapus;
- pilihan workspace publik atau privat;
- ringkasan sesi dan security posture;
- riwayat aktivitas untuk login, workspace, anggota, moderasi, stok, seduhan, dan QA;
- tabel `audit_events` append-only dengan RLS dan RPC terkontrol;
- policy workspace dan saran publik diperketat;
- validasi password pendaftaran minimal delapan karakter serta mengandung huruf dan angka;
- audit otomatis khusus keamanan melalui `npm run audit:security`.

## Fitur utama

- Rekomendasi seduh berdasarkan varietas, pascapanen, profil sangrai, dripper, grinder, air, dosis, metode, dan target rasa.
- Input seduhan manual dengan 1–3 varietas, proses manual, detail pour, Switch valve plan, QA, dan validasi resep.
- Hasil seduhan publik dengan batas QA minimum 6.5.
- Biji kopi dan stok privat per workspace.
- Pengurangan stok saat seduhan menggunakan biji dari inventori serta pemulihan stok saat log dihapus.
- Log Seduh & QA dengan diagnosis masalah rasa dan saran dial-in berikutnya.
- Analitik kualitas, konsumsi, biaya per cangkir, dan insight otomatis.
- Role Admin, QA, Brewer, serta mode Guest dan Demo.
- Matriks izin, keamanan sesi, dan audit trail workspace.
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
│  │  ├─ audit-service.js
│  │  ├─ auth-service.js
│  │  ├─ brew-service.js
│  │  ├─ notification-service.js
│  │  ├─ qa-service.js
│  │  ├─ recommendation-service.js
│  │  ├─ security-service.js
│  │  ├─ stock-service.js
│  │  ├─ storage-service.js
│  │  └─ supabase-service.js
│  └─ css/
│     ├─ analytics-insight.css
│     ├─ intelligence.css
│     ├─ security-audit.css
│     ├─ welcome.css
│     └─ workflow.css
├─ scripts/
│  ├─ security-audit.mjs
│  ├─ build-pages.mjs
│  ├─ functional-audit.mjs
│  └─ release-check.mjs
├─ supabase/
│  ├─ schema.sql
│  └─ migration_v42_security_audit_rls.sql
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

`npm run check` menjalankan build dan seluruh audit modular page, clean URL, page module, service layer, core workflow, recommendation engine, QA diagnostics, analytics insight, security, asset, PWA, konfigurasi Supabase, dan validasi dataset.

Hasil functional audit tersimpan pada:

```text
docs/V42_AUDIT_RESULT.json
```

Audit khusus keamanan dapat dijalankan dengan:

```powershell
npm run audit:security
```

## Supabase

Frontend hanya boleh menggunakan Project URL dan `anon/public key` pada `assets/supabase-config.js`. Jangan meletakkan `service_role` key di frontend, repository, atau browser.

### Project baru

Jalankan:

```text
supabase/schema.sql
```

### Project yang sudah aktif

Backup database terlebih dahulu, kemudian jalankan:

```text
supabase/migration_v42_security_audit_rls.sql
```

Migration tersebut wajib diterapkan agar audit trail cloud, policy workspace privat, perlindungan admin terakhir, dan policy saran v42 bekerja. Setelah migration, jalankan skenario pada `docs/V42_SECURITY_TEST_PLAN.md` menggunakan project staging sebelum produksi.

## Workflow Git

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-safe-update.ps1
npm run check
git add -A
git commit -m "Release v42 access security and audit trail"
git push origin main
```

Project menggunakan `fetch` dan `merge --ff-only`, bukan rebase otomatis.

## PWA dan cache

Cache aktif:

```text
coffee-brew-os-v42-security-audit
```

Setelah deployment besar, uji melalui Incognito atau hapus service worker lama satu kali apabila browser masih menampilkan aset versi sebelumnya.

## Batasan release

- Migration v42 belum dianggap selesai sampai dijalankan dan diuji pada Supabase staging milik pengguna.
- Browser fallback audit hanya untuk development dan bukan sumber audit tepercaya.
- IP address asli tidak dicatat dari browser; gunakan log platform atau Edge Function bila informasi jaringan diperlukan.
- Audit trigger v42 menangkap aktivitas penting, bukan seluruh query database.
- Rate limiting khusus saran publik memerlukan Edge Function atau gateway; RLS hanya membatasi akses dan struktur data.
- Retensi, ekspor, dan pengarsipan audit jangka panjang belum diotomatisasi.
- Audit otomatis tidak menggantikan pengujian end-to-end dengan akun, workspace, role, dan database Supabase aktif.
