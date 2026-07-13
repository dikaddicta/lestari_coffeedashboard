# Changelog v42.0.0

## Access Security & Audit Trail

### Ditambahkan

- Halaman **Akses & Keamanan** dengan status sesi, skor kesiapan, pemeriksaan kontrol utama, dan matriks izin per peran.
- Riwayat aktivitas workspace dengan filter kategori, tingkat, dan periode.
- `assets/services/security-service.js` untuk permission matrix, session summary, posture check, dan redaksi metadata sensitif.
- `assets/services/audit-service.js` untuk membaca/menulis audit melalui Supabase serta fallback lokal ketika migration belum diterapkan.
- Tabel Supabase `audit_events` yang append-only.
- RPC `write_audit_event` untuk penulisan audit terkontrol.
- Trigger database untuk perubahan anggota, workspace, dan status moderasi.
- Perlindungan database agar admin aktif terakhir tidak dapat diturunkan, ditangguhkan, atau dihapus.
- Pengubahan peran anggota langsung dari panel Admin Workspace.
- Pengaturan visibilitas direktori workspace: publik atau privat.
- Audit otomatis `npm run audit:security`.

### Diperbaiki

- Judul dan kalimat di halaman akun dibuat lebih natural dalam Bahasa Indonesia.
- Campuran istilah Inggris dan label yang terasa seperti hasil terjemahan diganti dengan Bahasa Indonesia yang lebih konsisten.
- Form pendaftaran menetapkan minimum 8 karakter serta kombinasi huruf dan angka pada sisi client.
- Policy workspace tidak lagi menampilkan workspace privat kepada non-anggota.
- Pembuatan workspace wajib mengikat `created_by` ke pengguna yang sedang login.
- Policy saran membatasi submission anonim ke workspace publik dan membatasi panjang pesan.
- ID tombol bulk review saran diselaraskan dengan JavaScript.

### Supabase

Project lama wajib menjalankan:

```text
supabase/migration_v42_security_audit_rls.sql
```

Project baru cukup menjalankan schema konsolidasi:

```text
supabase/schema.sql
```

Audit cloud tidak aktif sebelum migration v42 dijalankan. Dashboard tetap menampilkan fallback lokal, tetapi fallback tersebut bukan pengganti audit database.
