# Supabase Setup

Folder ini berisi schema dan migration Coffee Brew OS.

## Project baru

Jalankan seluruh isi file berikut melalui Supabase SQL Editor:

```text
supabase/schema.sql
```

Schema konsolidasi tersebut mencakup workspace, role, stok, brew log, QA, saran, RLS, RPC operasional, audit trail, serta hardening v42.

## Project yang sudah aktif

Jangan menjalankan ulang seluruh schema pada database produksi. Lakukan langkah berikut:

1. Buat backup database.
2. Terapkan migration pada project staging:

```text
supabase/migration_v42_security_audit_rls.sql
```

3. Jalankan test plan:

```text
docs/V42_SECURITY_TEST_PLAN.md
```

4. Setelah seluruh role dan alur CRUD lulus, terapkan migration yang sama ke produksi.

Migration v42 menambahkan:

- tabel append-only `audit_events`;
- RLS read untuk actor sendiri atau Admin Workspace;
- RPC `write_audit_event` untuk event aplikasi;
- trigger audit perubahan workspace, anggota, dan moderasi;
- perlindungan admin aktif terakhir;
- visibility workspace publik/privat;
- policy saran publik dan anggota yang lebih ketat;
- RPC ringkasan keamanan workspace.

## Project lama sebelum schema stabil

File berikut tetap tersedia untuk perbaikan project historis:

```text
supabase/supabase_repair_v8_stable.sql
```

Gunakan file repair hanya ketika struktur lama memang belum lengkap. Migration historis lain berada di `supabase/archive/`.

## Keamanan

- Frontend hanya boleh memakai Supabase `anon/public key`.
- Jangan menyimpan `service_role` key di JavaScript, GitHub, atau browser.
- Keamanan data harus ditegakkan melalui RLS, constraint, function, dan trigger database.
- `audit_events` tidak menyediakan hak update atau delete kepada client.
- Jangan menaruh password, token, API key, cookie, atau session payload di metadata audit.
- RLS bukan pengganti rate limiting untuk endpoint publik berisiko spam.
- Uji login, role, insert, update, delete, akses publik, workspace privat, dan last-admin protection setelah setiap perubahan policy.

## Catatan validasi

SQL v42 telah diperiksa secara statis oleh audit project, tetapi belum dieksekusi terhadap database Supabase pengguna di environment build ini. Validasi akhir wajib dilakukan pada staging dengan backup yang dapat dipulihkan.
