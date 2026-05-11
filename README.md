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
- Untuk penggunaan komersial, resep sebaiknya baru disetujui setelah hasilnya konsisten, misalnya 2 dari 3 brew ulang tetap mendapatkan nilai QA minimal 6.5.


## Troubleshooting Supabase

Jika muncul pesan `Invalid path specified in request URL` saat daftar/login, biasanya nilai `url` di `assets/supabase-config.js` salah.

Gunakan Project URL utama dari Supabase:

```js
url: "https://xxxxx.supabase.co"
```

Jangan gunakan URL dashboard, `/rest/v1`, `/auth/v1`, atau `service_role key`.


## Perubahan v8

- Stok kopi bersifat privat untuk akun/workspace aktif.
- Brew log yang sudah disetujui tampil di tab **Hasil Seduhan Publik**.
- Halaman publik menampilkan nama brewer, profil kopi, metode seduh, recipe ringkas, nilai QA, dan catatan dial-in.
- Untuk project Supabase yang sudah berjalan, jalankan `supabase/migration_v8_public_brews_private_stock.sql` di SQL Editor.


## Catatan v9 — Modul privat dan feed publik

Mulai v9:
- Stok Kopi hanya muncul jika pengguna sudah login dan punya workspace aktif.
- Brew Log & QA juga hanya bisa digunakan setelah login dan memilih workspace.
- Hitungan `Stock Workspace` di header mengikuti jumlah stok pada workspace aktif.
- Hasil seduhan dari semua pengguna ditampilkan di tab `Hasil Seduhan Publik`, tetapi hanya untuk brew log yang sudah berstatus `approved`.
- Stok kopi tidak masuk feed publik.

Jika project Supabase sudah berjalan, jalankan migration:
`supabase/migration_v9_private_workspace_modules.sql`


## Catatan v10 — Penguncian feed publik

Mulai v10, tab Hasil Seduhan Publik hanya menampilkan brew log yang memenuhi semua syarat berikut:
- visibility = public
- moderation_status = approved
- ApprovedForRecipe = Yes
- QA_Final minimal 6.5

Draft brew tanpa QA tidak akan tampil di feed publik.


## Catatan v11 — Feedback Workspace

Mulai v11, aksi `Buat Workspace` menampilkan notifikasi/toast yang jelas:
- sedang membuat workspace,
- berhasil dibuat,
- gagal karena slug sudah dipakai,
- atau gagal karena user belum login.


## Catatan v12 — Login/logout

Mulai v12:
- Setelah pengguna login, tombol `Masuk` dan `Daftar` disembunyikan.
- Tombol `Keluar` hanya muncul saat pengguna sudah login.
- Link `Masuk / Daftar` di card akun header ikut hilang setelah login.
- Logout membersihkan state akun, workspace aktif, dan data privat di tampilan.


## Catatan v13 — Form login dan daftar dipisah

Mulai v13:
- Login hanya memakai email dan kata sandi.
- Nama Tampilan hanya muncul di area daftar akun baru.
- Area daftar dibuat sebagai bagian collapsible agar tidak terlihat seperti login ulang.


## Catatan v14 — Tampilan akun setelah login

Mulai v14:
- Setelah user login, seluruh area form login dan form daftar benar-benar disembunyikan.
- Judul panel berubah dari `Login Pengguna` menjadi `Akun Pengguna`.
- Yang tersisa hanya ringkasan akun dan tombol `Keluar`.


## Catatan v15 — Brew Log flow dan threshold 6.5

Mulai v15:
- Batas lolos QA diturunkan dari 8.6 menjadi 6.5.
- Tombol `Simpan draft ke Brew Log` hanya muncul setelah user login dan memiliki workspace aktif.
- Draft dari menu Rekomendasi Seduh masuk ke tabel Brew Log dengan status `belum diverifikasi`.
- Di menu Brew Log & QA, user login wajib memilih `BrewID Asal` dari draft yang sudah dibuat.
- `Variabel Utama yang Diubah` memakai checklist. Jika tidak dicentang, sistem menyimpan `Tidak ada perubahan variabel`.
- Saat belum login, tabel Brew Log pribadi disembunyikan. Guest tetap bisa mengisi form QA publik, dan hasilnya masuk ke feed publik jika QA minimal 6.5.
- Menu Rekomendasi Biji Kopi hanya tampil saat user login dan memiliki workspace aktif.
- Jalankan migration: `supabase/migration_v15_guest_public_brew_threshold_65.sql`
