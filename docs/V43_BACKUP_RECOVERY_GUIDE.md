# Panduan Backup & Pemulihan v43

## Membuat backup

1. Masuk ke dashboard.
2. Buka **Ekspor & Laporan**.
3. Pilih **Unduh Backup Terverifikasi**.
4. Simpan file JSON pada lokasi yang aman.

File berisi data lokal browser: stok lokal, log seduh lokal, nilai QA lokal, dan saran lokal. Data cloud tidak disalin penuh oleh fitur ini.

## Memeriksa backup

1. Klik **Pilih File Backup**.
2. Sistem memeriksa format, schema version, checksum, dan jumlah data.
3. Tombol pemulihan hanya aktif bila file dapat dibaca.

## Memulihkan

1. Pastikan data lokal saat ini sudah dibackup.
2. Klik **Pulihkan ke Browser**.
3. Konfirmasi jumlah stok, log, dan QA.
4. Muat ulang menu yang relevan bila diperlukan.

Pemulihan mengganti data lokal, tetapi tidak mengubah database Supabase.

## Kondisi file ditolak

- bukan JSON yang valid;
- format bukan backup Coffee Brew OS;
- schema version lebih baru daripada aplikasi;
- checksum tidak cocok;
- struktur dataset tidak dapat dinormalisasi.
