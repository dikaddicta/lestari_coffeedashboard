# Changelog v41.0.0

## Analytics Seduhan

- Mengubah nama menu dari **Analitik Data** menjadi **Analitik Seduhan**.
- Menambahkan filter periode 30 hari, 90 hari, 6 bulan, 12 bulan, dan seluruh waktu.
- Menambahkan metrik pemakaian biji, biaya per cangkir, total biaya biji, dan estimasi daya tahan stok.
- Menambahkan grafik konsumsi biji dari waktu ke waktu.
- Menambahkan rincian biaya berdasarkan biji kopi.
- Menambahkan biaya biji pada tabel seduhan terbaik.
- Menambahkan insight otomatis untuk arah QA, konsistensi, cakupan biaya, biaya terbesar, dan daya tahan stok.
- Memperbaiki tombol **Perbarui** yang sebelumnya tidak terhubung karena perbedaan ID HTML dan JavaScript.

## Stok

- Mengubah label `Harga` menjadi **Harga Pembelian (Rp)**.
- Menambahkan keterangan cara harga digunakan oleh analitik biaya.
- Tidak ada perubahan schema atau migration database.

## Arsitektur

- Menambahkan `assets/services/analytics-service.js`.
- Menambahkan `assets/css/analytics-insight.css`.
- Menambahkan `scripts/analytics-insight-audit.mjs`.
- Memperluas laporan HTML dengan metrik konsumsi dan biaya.
- Memperbarui cache PWA menjadi `coffee-brew-os-v41-analytics-cost`.
