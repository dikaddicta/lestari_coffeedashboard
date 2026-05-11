# Rekomendasi Seduh Kopi — MVP Komersial

Aplikasi web ini dibuat sebagai versi web dari dashboard Excel rekomendasi seduh kopi.

Fitur utama:
- Rekomendasi seduh berdasarkan varietas, proses pascapanen, profil sangrai, dripper, grinder, air, dosis, dan metode seduh.
- Rekomendasi biji kopi dari stok.
- Brew Log dan QA.
- Opsi resep terverifikasi berdasarkan nilai QA.
- Supabase Auth untuk login.
- Workspace untuk coffee shop, roastery, komunitas, atau tim kompetisi.
- Peran pengguna: brewer, QA, dan admin.
- Moderasi data: menunggu review, disetujui, ditolak.
- Panel admin untuk meninjau, mengedit, menyetujui, menolak, dan menghapus data bermasalah.

## Cara menjalankan lokal

Buka `index.html` langsung di browser.

Jika Supabase belum dikonfigurasi, aplikasi tetap berjalan dengan penyimpanan lokal browser (`localStorage`).

## Setup Supabase

1. Buat project baru di Supabase.
2. Buka SQL Editor.
3. Jalankan file `supabase/schema.sql`.
4. Buka Project Settings > API.
5. Salin Project URL dan anon/public key.
6. Isi file `assets/supabase-config.js`.
7. Upload folder ini ke GitHub Pages atau hosting static lain.

Jangan pernah memasukkan `service_role key` ke frontend.

## Catatan operasional

- Data publik sebaiknya hanya memakai status `approved`.
- Data baru dari user masuk sebagai `pending`.
- QA/Admin bertugas mengecek dan menyetujui data.
- Untuk penggunaan komersial, resep sebaiknya baru disetujui setelah hasilnya konsisten, misalnya 2 dari 3 brew ulang tetap mendapatkan nilai QA minimal 8.6.
