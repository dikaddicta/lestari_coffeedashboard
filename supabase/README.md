# Supabase Setup

Folder ini berisi SQL yang dipakai Coffee Brew OS.

## Project baru

Jalankan seluruh isi file berikut melalui Supabase SQL Editor:

```text
supabase/schema.sql
```

File tersebut adalah schema konsolidasi yang dibutuhkan frontend v35.1, termasuk workspace, role, stok, brew log, QA, saran, RLS, dan RPC operasional.

## Project lama

Untuk database yang sudah pernah digunakan, jangan menjalankan schema baru secara membabi buta. Gunakan:

```text
supabase/supabase_repair_v8_stable.sql
```

Lalu periksa migration historis di `supabase/archive/` hanya ketika ada patch tertentu yang belum pernah diterapkan.

## Keamanan

- Frontend hanya boleh memakai Supabase `anon/public key`.
- Jangan pernah menyimpan `service_role` key di file JavaScript, GitHub, atau browser.
- Keamanan data harus ditegakkan melalui Row Level Security (RLS), bukan dengan menyembunyikan anon key.
- Uji login, role, insert, update, delete, dan akses publik setelah perubahan policy.
