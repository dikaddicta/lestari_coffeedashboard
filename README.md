# Coffee Dashboard by Lestari

Dashboard web statis untuk rekomendasi seduh kopi, manajemen stok, brew log, QA, feed hasil seduhan publik, kotak saran, dan pustaka data.

## Fitur

- Rekomendasi seduh berdasarkan varietas, pascapanen, roast profile, dripper, grinder, air, dosis, dan metode seduh.
- Custom grinder untuk pengguna yang memakai grinder di luar daftar pustaka.
- Rekomendasi biji kopi dari stok workspace.
- Stok kopi privat per workspace, termasuk pengurangan otomatis ketika brew log memakai stok.
- Brew Log & QA dengan status review dan detail eksperimen.
- Penghapusan brew log oleh Admin dengan pemulihan stok otomatis jika brew memakai stok.
- Feed hasil seduhan publik untuk data yang lolos QA dan approval.
- Role Admin Workspace, Brewer, dan QA.
- Approval akses workspace untuk Brewer/QA.
- Kotak Saran.
- Pustaka data varietas, dripper, proses, roast profile, air mineral, dan grinder.


## v19 Premium Experience

Versi ini menambahkan lapisan visual dan recipe engine yang lebih premium:

- Hero dan navigasi baru dengan gaya clean, elegan, dan tetap bernuansa kopi.
- Brew output card dengan ikon kontekstual.
- Panel **Brew Intelligence** berisi focus profile, confidence score, agitation guidance, water band, dan dial-in tips.
- Rekomendasi seduh lebih presisi karena memperhitungkan varietas, proses, roast tone, flow dripper, heat retention, TDS air, dosis, ferment risk, dan mode seduh.
- Tahapan pour lebih adaptif berdasarkan brew time, bloom, ferment risk, body, acidity, floral cue, dan Switch valve behavior.

## Struktur project

```text
.
├─ index.html
├─ README.md
├─ assets/
│  ├─ app.js
│  ├─ data.js
│  ├─ styles.css
│  └─ supabase-config.js
├─ supabase/
│  ├─ schema.sql
│  └─ migration_*.sql
└─ docs/
   └─ PUSH_TO_GITHUB.md
```

Project ini sengaja dibuat sebagai static single-page app. Tidak ada `package.json`, bundler, atau build step.

## Menjalankan lokal

Cara paling sederhana:

1. Buka folder project di VS Code.
2. Jalankan dengan ekstensi Live Server, atau buka `index.html` langsung di browser.
3. Pastikan internet aktif karena Supabase client dimuat dari CDN jsDelivr.

## Konfigurasi Supabase

Konfigurasi publik berada di:

```text
assets/supabase-config.js
```

Gunakan Project URL utama dan anon/public key dari Supabase. Jangan pernah memasukkan service role key ke frontend.

## Setup database Supabase

### Project Supabase baru

Jalankan isi file berikut di Supabase SQL Editor:

```text
supabase/schema.sql
```

`schema.sql` sudah dikonsolidasikan sampai patch terbaru yang dibutuhkan frontend, termasuk kolom integrasi stok-brew, RPC konsumsi stok, RPC hapus brew log + restore stok, index performa, dan detail QA.

### Project Supabase lama

Jika database sudah pernah dibuat dari versi lama, jalankan migration yang belum pernah diterapkan sesuai urutan berikut:

```text
supabase/migration_v8_public_brews_private_stock.sql
supabase/migration_v9_private_workspace_modules.sql
supabase/migration_v15_guest_public_brew_threshold_65.sql
supabase/migration_v17_roles_workspace_suggestions.sql
supabase/migration_v18_3_workspace_user_admin.sql
supabase/migration_v18_access_logout_metrics.sql
supabase/migration_v18_10_stock_workspace_read.sql
supabase/migration_v18_14_brew_stock_integration.sql
supabase/migration_v18_15_role_stock_guide.sql
supabase/migration_v18_20_stable_submit_delete_brew.sql
supabase/migration_v18_23_safer_stock_restore_on_brew_delete.sql
supabase/migration_v18_24_performance_indexes.sql
supabase/migration_v18_25_qa_details_fast_save.sql
supabase/migration_v19_suggestion_inbox_resilient_save.sql
```

Catatan: `migration_v18_23_safer_stock_restore_on_brew_delete.sql` menggantikan fungsi dari `migration_v18_20_stable_submit_delete_brew.sql` dengan versi restore stok yang lebih aman. Keduanya tetap aman dijalankan berurutan karena memakai `create or replace function`.

## Melihat data masukan

Data dari menu Kotak Saran disimpan di tabel Supabase `suggestions`. Admin Workspace juga bisa membukanya dari menu `Akun & Admin` bagian `Kotak Saran Masuk`. Jika Supabase tidak aktif saat saran dikirim, data fallback hanya tersimpan di `localStorage` browser pengirim dengan key `coffeeDashboardWebV1`.

Jika saat menjalankan migration muncul error `relation public.workspace_members does not exist`, database belum memiliki schema workspace/role. Untuk project baru jalankan `supabase/schema.sql`. Untuk project lama, jalankan migration sebelumnya sesuai urutan README sebelum `migration_v19_suggestion_inbox_resilient_save.sql`.

## Alur role

Admin Workspace membuat workspace/company dan menyetujui request akses. Brewer dan QA memilih workspace saat pendaftaran. Selama belum disetujui, status akun tampil sebagai pending dan fitur workspace tetap terkunci.

## Catatan keamanan

- File `.git/`, folder duplikat hasil export, dan folder versi kosong tidak disertakan dalam struktur bersih.
- Anon/public key Supabase boleh berada di frontend, tetapi keamanan data harus bergantung pada RLS policy di Supabase.
- Service role key tidak boleh dipush ke GitHub atau ditaruh di frontend.

## Catatan dial-in

Rekomendasi grinder adalah titik awal. Final setting tetap perlu disesuaikan dari drawdown, rasa, roast freshness, filter, dripper, dan kalibrasi tiap unit grinder.

## v21 Creative UI Refinement

Patch ini memperhalus tampilan menjadi **Coffee Brew OS** dengan nuansa lebih kreatif, interaktif, dan responsive:

- Hero title diganti menjadi **Coffee Brew OS**.
- Tombol quick action di hero dihapus agar tampilan lebih clean.
- Navigasi tetap tanpa scrollbar horizontal dan lebih rapi pada desktop maupun mobile.
- Header tabel memakai gradasi espresso–cocoa–caramel yang lebih premium.
- Scrollbar tabel dibuat custom sesuai palet warna kopi.
- Panel, kartu, tabel, dan hero diberi micro-interaction ringan.
- Layout responsive diperbaiki agar lebih nyaman di layar kecil.


## Update v23.3

Menu Input Seduhan kini memiliki detail Pour 1–4, logika Switch Valve Mode adaptif, dan kolom Es Batu khusus Japanese Iced.


## v32.3 Final UX Audit

- Route fallback hardened
- Tab visibility guard added
- Floating Quick Start / autosave widgets repositioned
- Brew Compass / Preflight / Insight contrast recovered
- Data jump buttons safety binding added
- Custom process field state re-synced after render
- JS syntax: passed
- Tab routes checked: 14
- Section balance issues: 0
- Duplicate IDs found: 0


## v32.4 Mobile Experience Polish

- Mobile sidebar drawer strengthened
- Sticky topbar compacted for tablet/mobile
- Mobile form input font-size set to 16px to prevent zoom
- Large tables retain horizontal scroll
- Quick Start and sync guard repositioned
- Floating mascot hidden on small screens to reduce overlap
- Mobile buttons and action groups normalized
- Responsive grid stacks standardized


## v32.5 Pustaka Data Polish

- Premium dataset/search controls added
- Quick focus filters added
- USDA, Kopyol, Mix Varietas spotlight ready for varieties dataset
- Source-ready and local Indonesia filters added
- Knowledge cards include mini metric chips
- Detail panel strengthened with source status and metrics
- Mobile library layout improved


## v32.6 Process Data & Library Contrast

- Added Extended Natural process reference.
- Added Fermented Natural process reference.
- Improved Pustaka Data hero text contrast.


## v32.7 Brew Logic Upgrade

- Custom post-harvest process can now be inferred from label keywords
- Unknown/custom processes get adaptive modifiers instead of neutral default only
- Stock beans with 2-3 varieties are resolved into a composite sensory profile
- Brew Preflight now shows Logic card
- Brew Intelligence now shows Library/Adaptive logic signal
- Confidence score accounts for inferred process and composite varieties


## v32.8 Production Pack

- Service worker cache bumped to coffee-brew-os-v32-8-production
- Navigation uses network-first fallback to avoid stale index.html
- Static same-origin assets keep cache-first behavior
- Manifest metadata and shortcuts added
- Deployment checklist added
- Safe Git update SOP added
- Home production readiness panel added
