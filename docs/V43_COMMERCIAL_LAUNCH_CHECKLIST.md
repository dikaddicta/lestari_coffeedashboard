# Commercial Launch Checklist v43

## Identitas dan legal

- [ ] Tetapkan nama badan usaha/pemilik layanan.
- [ ] Tetapkan alamat dan kontak resmi.
- [ ] Review Kebijakan Privasi oleh pihak hukum.
- [ ] Review Ketentuan Penggunaan dan yurisdiksi.
- [ ] Tambahkan skema pembayaran, pembatalan, dan refund bila berbayar.
- [ ] Tetapkan periode retensi serta prosedur permintaan hak pengguna.

## Supabase dan keamanan

- [ ] Backup database sebelum migration.
- [ ] Terapkan dan uji migration v42 pada staging.
- [ ] Pastikan RLS aktif pada seluruh tabel yang diakses browser.
- [ ] Uji akun Admin, QA, Brewer, Guest, dan pengguna tanpa membership.
- [ ] Periksa Auth redirect URL untuk domain produksi.
- [ ] Aktifkan monitoring, alert, dan backup database sesuai plan.
- [ ] Pastikan tidak ada service-role key di repository/frontend.

## Operasional

- [ ] Uji backup dan restore lokal dengan data nyata.
- [ ] Tentukan jadwal backup cloud.
- [ ] Tentukan jalur pelaporan insiden.
- [ ] Tentukan jadwal maintenance dan komunikasi pengguna.
- [ ] Uji halaman Status Sistem dan Maintenance.
- [ ] Tetapkan SLA/support hours bila diperlukan.

## Deployment dan brand

- [ ] Tetapkan domain produksi.
- [ ] Perbarui `siteUrl` pada `src/public-pages.json`.
- [ ] Perbarui canonical URL, sitemap, dan security.txt.
- [ ] Perbarui logo, favicon, social preview, dan identitas final.
- [ ] Uji mobile, tablet, desktop, PWA, dan browser utama.
- [ ] Jalankan `npm run check` sebelum release.
