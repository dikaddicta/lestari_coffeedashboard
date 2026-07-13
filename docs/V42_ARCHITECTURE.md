# Arsitektur v42 — Access Security & Audit Trail

## Tujuan

v42 menambahkan lapisan kontrol akses yang dapat dibaca pengguna dan lapisan audit yang ditegakkan database. Perubahan tidak hanya berada di tampilan; policy RLS, trigger, RPC, dan perlindungan admin terakhir ditambahkan ke Supabase.

## Lapisan browser

```text
assets/services/security-service.js
assets/services/audit-service.js
assets/css/security-audit.css
assets/pages/akun-role.js
src/pages/13-akun-role.html
```

`security-service.js` bertanggung jawab atas:

- definisi izin per peran;
- label peran;
- ringkasan sesi;
- pemeriksaan kesiapan keamanan;
- redaksi key sensitif dari metadata audit.

`audit-service.js` bertanggung jawab atas:

- penulisan audit melalui RPC `write_audit_event`;
- pembacaan `audit_events` berdasarkan workspace;
- normalisasi event;
- fallback browser apabila migration belum tersedia.

Fallback browser hanya untuk menjaga keterlihatan aktivitas saat development. Sumber audit yang dipercaya tetap tabel Supabase.

## Lapisan database

```text
supabase/migration_v42_security_audit_rls.sql
```

Migration menambahkan:

- tabel append-only `audit_events`;
- RLS read untuk actor sendiri atau Admin Workspace;
- RPC terkontrol untuk authenticated user;
- trigger perubahan anggota;
- trigger perubahan workspace;
- trigger perubahan status moderasi;
- trigger perlindungan admin terakhir;
- policy direktori workspace publik/privat;
- policy insert saran yang lebih ketat;
- RPC ringkasan keamanan workspace.

## Prinsip keamanan

1. Frontend hanya menggunakan `anon` key.
2. Keputusan akses tetap ditegakkan RLS dan trigger database.
3. Audit event tidak memiliki policy update atau delete untuk client.
4. Metadata audit dibatasi 8 KB dan key yang menyerupai password/token/secret diredaksi di browser.
5. Workspace privat hanya dapat dibaca anggota aktif.
6. Minimal satu admin aktif harus tetap ada pada setiap workspace.
7. Perubahan role melalui UI tetap divalidasi ulang oleh database.

## Batasan

- IP address asli tidak direkam dari browser karena header jaringan tidak dapat dipercaya dari client. Gunakan Edge Function atau log platform jika IP audit diperlukan.
- Audit trigger mencatat perubahan penting, bukan seluruh query database. pgAudit dapat diaktifkan terpisah melalui Supabase untuk kebutuhan audit database yang lebih luas.
- Rate limiting public suggestion membutuhkan Edge Function atau gateway; policy RLS hanya membatasi struktur dan cakupan data.
