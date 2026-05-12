# Coffee Dashboard by Lestari

Dashboard web untuk rekomendasi seduh kopi, manajemen stok, brew log, QA, dan pustaka data.

## Fitur

- Rekomendasi seduh berdasarkan varietas, pascapanen, roast profile, dripper, grinder, air, dosis, dan metode seduh.
- Custom grinder untuk pengguna yang memakai grinder di luar daftar pustaka.
- Stok kopi privat per workspace.
- Brew Log & QA dengan status review.
- Feed hasil seduhan publik untuk data yang sudah lolos QA dan approval.
- Role Admin Workspace, Brewer, dan QA.
- Approval akses workspace untuk Brewer/QA.
- Kotak Saran.
- Pustaka data varietas, dripper, proses, roast profile, air mineral, dan grinder.

## Menjalankan lokal

Buka `index.html` di browser atau gunakan Live Server di VS Code.

## Supabase

Untuk project baru, jalankan:

```sql
supabase/schema.sql
```

Untuk project yang sudah memakai versi sebelumnya, jalankan migration sesuai urutan yang belum diterapkan:

```text
supabase/migration_v8_public_brews_private_stock.sql
supabase/migration_v9_private_workspace_modules.sql
supabase/migration_v15_guest_public_brew_threshold_65.sql
supabase/migration_v17_roles_workspace_suggestions.sql
supabase/migration_v18_access_logout_metrics.sql
```

Isi konfigurasi publik Supabase di:

```text
assets/supabase-config.js
```

Gunakan Project URL utama dan anon/public key. Jangan taruh service role key di frontend.

## Alur role

Admin Workspace membuat workspace/company dan menyetujui request akses. Brewer dan QA memilih workspace saat pendaftaran. Selama belum disetujui, status akun tampil sebagai pending dan fitur workspace tetap terkunci.

## Catatan dial-in

Rekomendasi grinder adalah titik awal. Final setting tetap perlu disesuaikan dari drawdown, rasa, roast freshness, filter, dripper, dan kalibrasi tiap unit grinder.
